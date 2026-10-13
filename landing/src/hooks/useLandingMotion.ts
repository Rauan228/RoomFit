import { useLayoutEffect, useRef } from "react";

const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Native, one-shot entrances. Content remains readable without animation support. */
export default function useLandingMotion() {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const mouse = matchMedia("(hover: hover) and (pointer: fine)");
    const running = new Map<HTMLElement, Animation>();
    const pending = new Map<HTMLElement, Animation>();
    const seen = new WeakSet<HTMLElement>();
    const header = document.querySelector<HTMLElement>(".site-header");
    const visual = root.querySelector<HTMLElement>(".hero-visual");
    const preview = visual?.querySelector<HTMLElement>(".editor-preview");
    let observer: IntersectionObserver | undefined;
    let scrollFrame = 0;
    let pointerFrame = 0;
    let bounds: DOMRect | undefined;

    const reveal = (el: HTMLElement) => {
      const animation = pending.get(el);
      if (!animation) return;
      seen.add(el);
      pending.delete(el);
      running.set(el, animation);
      animation.play();
      if (document.hidden) animation.pause();
      observer?.unobserve(el);
    };

    const cancelEntrances = () => {
      pending.forEach((animation) => animation.cancel());
      pending.clear();
      running.forEach((animation) => animation.cancel());
      running.clear();
    };
    const resetTilt = () => {
      cancelAnimationFrame(pointerFrame);
      preview?.style.removeProperty("--preview-x");
      preview?.style.removeProperty("--preview-y");
      bounds = undefined;
    };
    const setupEntrances = () => {
      observer?.disconnect();
      cancelEntrances();
      resetTilt();
      const targets = root.querySelectorAll<HTMLElement>(
        ".hero-copy, .hero-visual, .section-heading, .section-copy, .feature-card, .step, .gallery-card, .compare-card, .demo-editor, .comparison-slider, .devices",
      );
      if (preference.matches) {
        targets.forEach((el) => seen.add(el));
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            reveal(entry.target as HTMLElement);
          }
        },
        { threshold: 0, rootMargin: "0px 0px 64px 0px" },
      );
      // Prepare every entrance before paint, including the delayed cards.
      // Default CSS stays visible if motion is disabled or unsupported.
      targets.forEach((el) => {
        if (seen.has(el) || typeof el.animate !== "function") return;
        const rect = el.getBoundingClientRect();
        // Pre-rendered content may already have painted before hydration.
        // Never hide a block the visitor can already see.
        if (
          rect.bottom <= 0 ||
          (root.dataset.prerendered === "true" && rect.top < window.innerHeight)
        ) {
          seen.add(el);
          return;
        }
        const staggered = el.matches(
          ".feature-card, .step, .gallery-card, .compare-card",
        );
        const index = staggered
          ? Array.from(el.parentElement!.children).indexOf(el)
          : 0;
        const animation = el.animate(
          [
            { opacity: 0, translate: "0 12px" },
            { opacity: 1, translate: "0 0" },
          ],
          {
            duration: 720,
            delay: Math.min(index * 40, 160),
            easing,
            fill: "both",
            id: "roomfit-reveal",
          },
        );
        animation.pause();
        animation.currentTime = 0;
        animation.onfinish = () => {
          running.delete(el);
          animation.cancel();
        };
        pending.set(el, animation);
        if (rect.top < window.innerHeight + 64) reveal(el);
        else observer?.observe(el);
      });
    };

    const updateScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      header?.style.setProperty(
        "--page-progress",
        `${max > 0 ? Math.min(1, window.scrollY / max) : 0}`,
      );
      let active = "";
      for (const id of ["features", "how", "examples", "faq"]) {
        const section = document.getElementById(id);
        if (
          section &&
          section.getBoundingClientRect().top <= window.innerHeight * 0.35
        )
          active = id;
      }
      document
        .querySelectorAll<HTMLAnchorElement>(".desktop-nav a")
        .forEach((link) => {
          if (link.hash === `#${active}`)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
    };
    const scroll = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(updateScroll);
      resetTilt();
    };
    const enter = () => {
      if (mouse.matches && !preference.matches)
        bounds = visual?.getBoundingClientRect();
    };
    const move = (e: PointerEvent) => {
      if (!mouse.matches || preference.matches || !preview || !bounds) return;
      const x = Math.max(
        -0.5,
        Math.min(0.5, (e.clientX - bounds.left) / bounds.width - 0.5),
      );
      const y = Math.max(
        -0.5,
        Math.min(0.5, (e.clientY - bounds.top) / bounds.height - 0.5),
      );
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        preview.style.setProperty("--preview-y", `${-7 + x * 9}deg`);
        preview.style.setProperty("--preview-x", `${2 - y * 7}deg`);
      });
    };
    const interrupt = (event: Event) => {
      for (const animations of [pending, running]) {
        animations.forEach((animation, el) => {
          if (event.target instanceof Node && el.contains(event.target)) {
            seen.add(el);
            observer?.unobserve(el);
            animation.cancel();
            animations.delete(el);
          }
        });
      }
    };
    const visibility = () => {
      running.forEach((animation) => {
        if (document.hidden) animation.pause();
        else animation.play();
      });
    };

    setupEntrances();
    updateScroll();
    preference.addEventListener("change", setupEntrances);
    mouse.addEventListener("change", resetTilt);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    visual?.addEventListener("pointerenter", enter);
    visual?.addEventListener("pointermove", move);
    visual?.addEventListener("pointerleave", resetTilt);
    root.addEventListener("pointerdown", interrupt, true);
    root.addEventListener("focusin", interrupt);
    document.addEventListener("visibilitychange", visibility);

    return () => {
      observer?.disconnect();
      cancelEntrances();
      cancelAnimationFrame(scrollFrame);
      resetTilt();
      preference.removeEventListener("change", setupEntrances);
      mouse.removeEventListener("change", resetTilt);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      visual?.removeEventListener("pointerenter", enter);
      visual?.removeEventListener("pointermove", move);
      visual?.removeEventListener("pointerleave", resetTilt);
      root.removeEventListener("pointerdown", interrupt, true);
      root.removeEventListener("focusin", interrupt);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return ref;
}

// First-party aggregate events. No user IDs, project IDs, emails or cookie IDs.
const SOURCES = new Set([
  "direct",
  "google",
  "bing",
  "yandex",
  "chatgpt",
  "perplexity",
  "other",
]);
const EVENTS = new Set([
  "page_view",
  "platform_click",
  "signup_complete",
  "project_created",
  "project_saved",
]);
let initialized = false;
export function trafficSource(): string {
  try {
    const incoming = new URLSearchParams(location.search).get("rf_source");
    if (incoming && SOURCES.has(incoming)) {
      sessionStorage.setItem("roomfit:source", incoming);
      return incoming;
    }
    const existing = sessionStorage.getItem("roomfit:source");
    if (existing && SOURCES.has(existing)) return existing;
    const referrer = document.referrer
      ? new URL(document.referrer).hostname
      : "";
    const source =
      !referrer || referrer.endsWith("roomfit.art")
        ? "direct"
        : /(^|\.)google\./.test(referrer)
          ? "google"
          : /(^|\.)bing\.com$/.test(referrer)
            ? "bing"
            : /(^|\.)yandex\./.test(referrer)
              ? "yandex"
              : /(^|\.)(chatgpt\.com|chat\.openai\.com)$/.test(referrer)
                ? "chatgpt"
                : /(^|\.)perplexity\.ai$/.test(referrer)
                  ? "perplexity"
                  : "other";
    sessionStorage.setItem("roomfit:source", source);
    return source;
  } catch {
    return "direct";
  }
}
function canMeasure() {
  return (
    typeof window !== "undefined" &&
    navigator.doNotTrack !== "1" &&
    !(navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  );
}
export function track(event: string, page?: string) {
  // Vite development has no event endpoint. Static preview and production do.
  if (!import.meta.env.PROD || !canMeasure() || !EVENTS.has(event)) return;
  const routes: Record<string, string> = {
    "/": "home",
    "/rukovodstva/": "guides",
    "/rasstanovka-mebeli/": "arrangement",
    "/planirovka-spalni-12-m2/": "bedroom12",
    "/malenkaya-komnata-9-m2/": "small9",
    "/pomestitsya-li-divan/": "sofa",
    "/kak-narisovat-plan-komnaty/": "measure",
    "/o-proekte/": "about",
    "/konfidencialnost/": "privacy",
    "/usloviya/": "terms",
  };
  const name =
    page ||
    (location.hostname.startsWith("platform.") ||
    location.pathname.startsWith("/project/")
      ? "platform"
      : routes[location.pathname] || "other");
  const params = new URLSearchParams({
    event,
    page: name,
    source: trafficSource(),
  });
  void fetch(`/events?${params}`, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(() => {});
}
export function initializeAnalytics() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  track("page_view");
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (!link) return;
    const url = new URL(link.href);
    const platform =
      url.hostname === "platform.roomfit.art" ||
      (url.hostname === "127.0.0.1" && url.port === "4181");
    if (!platform || !["/register", "/login"].includes(url.pathname)) return;
    if (canMeasure()) url.searchParams.set("rf_source", trafficSource());
    link.href = url.toString();
    track("platform_click");
  });
}
export function starterQuery(params: URLSearchParams) {
  const result = new URLSearchParams();
  const template = params.get("template"),
    source = params.get("rf_source");
  if (
    template &&
    ["bedroom12", "small9", "living", "measure"].includes(template)
  )
    result.set("template", template);
  if (source && SOURCES.has(source)) result.set("rf_source", source);
  return result.size ? `?${result}` : "";
}

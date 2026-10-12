import { useLayoutEffect, useRef, useState } from "react";
import { Plan } from "../lib/plan-visuals";
import type { RoomTemplate } from "../lib/types";

export function useElementWidth(initial = 400) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export default function PlanPreview({
  template,
  dimensions = false,
  selected,
  status,
  className = "",
}: {
  template: RoomTemplate;
  dimensions?: boolean;
  selected?: string;
  status?: Record<string, string>;
  className?: string;
}) {
  const { ref, width } = useElementWidth();
  return (
    <div
      ref={ref}
      className={`plan-preview ${className}`}
      role="img"
      aria-label={`План: ${template.name}, ${template.room.w} на ${template.room.h} сантиметров`}
    >
      <Plan
        {...template}
        fitW={Math.max(40, width - 12)}
        fitH={400}
        dims={dimensions}
        margin={dimensions ? 27 : 0}
        selectedId={selected}
        status={status}
        zones
      />
    </div>
  );
}

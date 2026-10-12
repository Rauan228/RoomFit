import { useState } from "react";
import { MoveHorizontal } from "lucide-react";
import { ROOMS } from "../lib/data";
import PlanPreview from "./PlanPreview";

export default function ComparisonSlider() {
  const [split, setSplit] = useState(52);
  return (
    <div className="comparison-slider">
      <img
        className="comparison-photo"
        src="/assets/photo-bedroom.png"
        alt="Визуальная концепция спальни в 3D"
        loading="lazy"
        width={424}
        height={410}
      />
      <div
        className="comparison-plan"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      >
        <PlanPreview template={ROOMS.bedroom} />
      </div>
      <span className="slider-label left">2D план</span>
      <span className="slider-label right">
        3D просмотр <small>скоро</small>
      </span>
      <div className="slider-divider" style={{ left: `${split}%` }}>
        <span>
          <MoveHorizontal size={23} />
        </span>
      </div>
      <input
        className="comparison-range"
        type="range"
        min="0"
        max="100"
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Сравнить 2D-план и 3D-концепцию"
        aria-valuetext={`${split}% плана, ${100 - split}% 3D-концепции`}
      />
    </div>
  );
}

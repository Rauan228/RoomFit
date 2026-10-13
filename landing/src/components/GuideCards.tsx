import { ArrowUpRight } from "lucide-react";
import { GUIDES, guidePath } from "../content/guides";
import GuidePlan from "./GuidePlan";

export default function GuideCards({ exclude }: { exclude?: string }) {
  return (
    <div className="guide-grid">
      {GUIDES.filter((g) => g.slug !== exclude).map((guide) => (
        <a className="guide-card" key={guide.slug} href={guidePath(guide)}>
          {import.meta.env.PROD ? (
            <img
              src={`/assets/guides/${guide.slug}.webp`}
              width="600"
              height="480"
              alt={`Учебный план: ${guide.label}`}
              loading="lazy"
            />
          ) : (
            <GuidePlan template={guide.template} cover />
          )}
          <div>
            <span>{guide.minutes} минут · Практика</span>
            <h3>{guide.label}</h3>
            <p>{guide.description}</p>
            <span className="guide-card-link">
              Открыть разбор <ArrowUpRight size={18} />
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}

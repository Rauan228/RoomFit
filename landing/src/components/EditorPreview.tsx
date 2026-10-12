import {
  MousePointer2,
  Square,
  DoorOpen,
  PanelsTopLeft,
  Ruler,
  Save,
  Undo2,
  Redo2,
  Search,
} from "lucide-react";
import { CATALOG, HERO_ITEMS, ROOMS } from "../lib/data";
import { FurnThumb } from "../lib/plan-visuals";
import PlanPreview from "./PlanPreview";

export const heroTemplate = {
  ...ROOMS.bedroom,
  name: "Гостиная",
  items: HERO_ITEMS,
};

export default function EditorPreview() {
  return (
    <div
      className="editor-preview"
      role="img"
      aria-label="Пример редактора RoomFit: 2D-план гостиной с мебелью и каталогом"
    >
      <div className="preview-top">
        <img src="/assets/logo-mark-dark.png" alt="" />
        <b>
          Room<span>Fit</span>
        </b>
        <span className="preview-project">Моя гостиная</span>
        <span className="preview-save">
          <Save size={12} />
          Сохранить
        </span>
      </div>
      <div className="preview-body">
        <div className="preview-tools">
          {[MousePointer2, Square, DoorOpen, PanelsTopLeft, Ruler].map(
            (Icon, i) => (
              <span key={i} className={i === 0 ? "active" : ""}>
                <Icon size={17} />
              </span>
            ),
          )}
        </div>
        <div className="preview-main">
          <div className="preview-toolbar">
            <b>2D план</b>
            <span>3D (скоро)</span>
            <div />
            <Undo2 size={13} />
            <Redo2 size={13} />
            <span>100%</span>
          </div>
          <div className="preview-canvas">
            <PlanPreview template={heroTemplate} dimensions selected="c" />
          </div>
        </div>
        <div className="preview-catalog">
          <b>Каталог мебели</b>
          <span className="preview-search">
            <Search size={11} />
            Поиск мебели…
          </span>
          <div className="preview-filters">
            <b>Все</b>
            <span>Диваны</span>
            <span>Кровати</span>
          </div>
          <div className="preview-catalog-grid">
            {["sofa3", "bed2", "dtable", "chair", "ward", "night"].map(
              (key) => {
                const c = CATALOG.find((c) => c.key === key)!;
                return (
                  <div key={key}>
                    <FurnThumb type={c.type} w={c.w} h={c.h} size={34} />
                    <b>{c.name.split(" ").at(-1)}</b>
                    <small>
                      {c.w}×{c.h} см
                    </small>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

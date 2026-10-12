import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  DoorOpen,
  MousePointer2,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Search,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { CATALOG, initialItems, ROOMS } from "../lib/data";
import { aabb, analyze, fitInside, rays, rotateItem } from "../lib/geometry";
import { Furn, FurnThumb, geom, Plan } from "../lib/plan-visuals";
import { exportPlan } from "../lib/export-plan";
import type { Furniture, RoomTemplate } from "../lib/types";
import { useElementWidth } from "./PlanPreview";

const STORAGE_KEY = "roomfit-demo-v1";
type Timeline = {
  past: Furniture[][];
  current: Furniture[];
  future: Furniture[][];
};
type SavedPlan = { items: Furniture[]; template: RoomTemplate };
const furnitureTypes = new Set(CATALOG.map((c) => c.type));

function loadSaved(): SavedPlan | null {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      !data ||
      !Array.isArray(data.items) ||
      data.items.length > 40 ||
      !data.template
    )
      return null;
    const known = Object.values(ROOMS).find(
      (t) =>
        t.name === data.template.name &&
        t.room.w === data.template.room?.w &&
        t.room.h === data.template.room?.h,
    );
    if (
      !known ||
      !data.items.every(
        (i: Furniture) =>
          i &&
          typeof i.id === "string" &&
          typeof i.name === "string" &&
          furnitureTypes.has(i.type) &&
          [i.w, i.h, i.x, i.y, i.rot ?? 0].every(Number.isFinite) &&
          i.w > 0 &&
          i.h > 0 &&
          i.w <= 800 &&
          i.h <= 800 &&
          (i.rot ?? 0) % 90 === 0,
      ) ||
      new Set(data.items.map((i: Furniture) => i.id)).size !== data.items.length
    )
      return null;
    return { items: data.items, template: known };
  } catch {
    return null;
  }
}

export default function DemoEditor({
  templateKey,
  onStatus,
}: {
  templateKey?: string;
  onStatus?: (status: ReturnType<typeof analyze>) => void;
}) {
  const [saved] = useState(loadSaved);
  const [template, setTemplate] = useState(saved?.template ?? ROOMS.bedroom);
  const [history, setHistory] = useState<Timeline>({
    past: [],
    current: saved?.items ?? initialItems(),
    future: [],
  });
  const [selected, setSelected] = useState<string | null>(
    history.current[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const { ref: canvasRef, width } = useElementWidth(420);
  const drag = useRef<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    before: Furniture[];
    scale: number;
  } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scale = Math.max(0.15, (width - 60) / (template.room.w + 20));
  const g = geom(template.room, { scale, margin: 24 });
  const items = history.current;
  const selectedItem = items.find((i) => i.id === selected);
  const status = analyze(template.room, items, template.doors);
  const distances = selected ? rays(template.room, items, selected) : [];
  const catalog = CATALOG.filter(
    (c) =>
      ["sofa2", "bed1", "desk", "chair", "dresser", "night"].includes(c.key) &&
      c.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
  );

  useEffect(() => {
    onStatus?.(analyze(template.room, history.current, template.doors));
  }, [template, history.current, onStatus]);
  useEffect(() => {
    if (!templateKey || !ROOMS[templateKey]) return;
    const next = ROOMS[templateKey];
    setTemplate(next);
    setHistory({ past: [], current: structuredClone(next.items), future: [] });
    setSelected(next.items.find((i) => i.type !== "rug")?.id ?? null);
    setNotice(`Открыт шаблон «${next.name}»`);
  }, [templateKey]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  function notify(message: string) {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }
  function commit(next: Furniture[]) {
    setHistory((h) => ({
      past: [...h.past.slice(-39), h.current],
      current: next,
      future: [],
    }));
  }
  function undo() {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            current: h.past.at(-1)!,
            future: [h.current, ...h.future],
          }
        : h,
    );
  }
  function redo() {
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.current],
            current: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  }
  function rotate(id: string) {
    commit(items.map((i) => (i.id === id ? rotateItem(i, template.room) : i)));
  }
  function remove(id: string) {
    commit(items.filter((i) => i.id !== id));
    setSelected(null);
  }
  function startDrag(e: PointerEvent<HTMLButtonElement>, item: Furniture) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setSelected(item.id);
    drag.current = {
      id: item.id,
      sx: e.clientX,
      sy: e.clientY,
      ox: item.x,
      oy: item.y,
      before: items,
      scale,
    };
  }
  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    setHistory((h) => ({
      ...h,
      current: h.current.map((i) =>
        i.id === d.id
          ? fitInside(
              {
                ...i,
                x: d.ox + (e.clientX - d.sx) / d.scale,
                y: d.oy + (e.clientY - d.sy) / d.scale,
              },
              template.room,
            )
          : i,
      ),
    }));
  }
  function endDrag(cancel = false) {
    const d = drag.current;
    if (!d) return;
    setHistory((h) =>
      cancel
        ? { ...h, current: d.before }
        : JSON.stringify(h.current) === JSON.stringify(d.before)
          ? h
          : {
              past: [...h.past.slice(-39), d.before],
              current: h.current,
              future: [],
            },
    );
    drag.current = null;
  }
  function itemKey(e: KeyboardEvent<HTMLButtonElement>, item: Furniture) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (directions[e.key]) {
      e.preventDefault();
      const [dx, dy] = directions[e.key],
        step = e.shiftKey ? 10 : 1;
      commit(
        items.map((i) =>
          i.id === item.id
            ? fitInside(
                { ...i, x: i.x + dx * step, y: i.y + dy * step },
                template.room,
              )
            : i,
        ),
      );
    } else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      rotate(item.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(item.id);
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, template }));
      notify("План сохранён на этом устройстве");
    } catch {
      notify("Браузер не разрешил сохранить план. Скачай PNG.");
    }
  }
  function download() {
    try {
      exportPlan(template, items);
      notify("План скачан в PNG");
    } catch {
      notify("Не удалось скачать план. Попробуй другой браузер.");
    }
  }

  return (
    <div className="demo-editor">
      <div className="demo-topbar">
        <span className="demo-project">
          <b>{template.name}</b>
          <small>
            {template.room.w} × {template.room.h} см
          </small>
        </span>
        <div className="demo-top-actions">
          <button
            className="icon-button"
            onClick={undo}
            disabled={!history.past.length}
            aria-label="Отменить действие"
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            onClick={redo}
            disabled={!history.future.length}
            aria-label="Повторить действие"
          >
            <Redo2 size={17} />
          </button>
          <button className="save-button" onClick={save}>
            <Save size={14} />
            <span>Сохранить</span>
          </button>
        </div>
      </div>
      <div className="demo-body">
        <aside className="demo-tools" aria-label="Режим редактора">
          <span className="active">
            <MousePointer2 size={20} />
            <small>Выбор</small>
          </span>
          <span>
            <Square size={20} />
          </span>
          <span>
            <DoorOpen size={20} />
          </span>
          <span>
            <Ruler size={20} />
          </span>
        </aside>
        <div className="demo-main">
          <div className="demo-tabs">
            <b>2D план</b>
            <span>
              3D <small>скоро</small>
            </span>
            <span className="demo-tab-hint">Демо</span>
          </div>
          <div ref={canvasRef} className="demo-canvas">
            <div className="demo-plan" style={{ width: g.W, height: g.H }}>
              <Plan
                room={template.room}
                items={[]}
                doors={template.doors}
                windows={template.windows}
                floor={template.floor}
                scale={scale}
                margin={24}
                zones
              />
              <div
                className="demo-item-layer"
                style={{
                  left: g.off,
                  top: g.off,
                  width: template.room.w * scale,
                  height: template.room.h * scale,
                }}
              >
                {items.map((item) => {
                  const b = aabb(item);
                  return (
                    <button
                      key={item.id}
                      className={`furniture-object ${selected === item.id ? "selected" : ""} ${status.status[item.id] === "err" ? "error" : status.status[item.id] === "warn" ? "warning" : ""}`}
                      style={{
                        left: b.x * scale,
                        top: b.y * scale,
                        width: b.w * scale,
                        height: b.h * scale,
                        zIndex:
                          item.type === "rug"
                            ? 0
                            : selected === item.id
                              ? 3
                              : 1,
                      }}
                      aria-label={`${item.name}, ${item.w} на ${item.h} сантиметров`}
                      aria-pressed={selected === item.id}
                      title={`${item.name} · ${item.w} × ${item.h} см. Перетащи или используй стрелки; R — повернуть.`}
                      onFocus={() => setSelected(item.id)}
                      onPointerDown={(e) => startDrag(e, item)}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag()}
                      onPointerCancel={() => endDrag(true)}
                      onDoubleClick={() => rotate(item.id)}
                      onKeyDown={(e) => itemKey(e, item)}
                    >
                      <span
                        className="furniture-inner"
                        style={{
                          width: item.w * scale,
                          height: item.h * scale,
                          transform: `translate(-50%, -50%) rotate(${item.rot ?? 0}deg)`,
                        }}
                      >
                        <Furn
                          type={item.type}
                          w={item.w * scale}
                          h={item.h * scale}
                          tone={item.tone}
                        />
                      </span>
                      {selected === item.id && (
                        <span className="furniture-caption">
                          {item.w} × {item.h} см
                        </span>
                      )}
                    </button>
                  );
                })}
                {distances.map((r) => (
                  <span
                    key={r.dir}
                    className={`distance-line ${r.dir === "l" || r.dir === "r" ? "horizontal" : "vertical"}`}
                    style={{
                      left: r.x1 * scale,
                      top: r.y1 * scale,
                      width: (r.x2 - r.x1) * scale,
                      height: (r.y2 - r.y1) * scale,
                    }}
                  >
                    <span>{Math.round(r.d)} см</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="selection-bar">
            <span>
              {selectedItem
                ? `${selectedItem.name} · ${selectedItem.w} × ${selectedItem.h} см`
                : "Выбери предмет на плане"}
            </span>
            <button
              className="icon-button"
              aria-label="Повернуть предмет"
              disabled={!selectedItem}
              onClick={() => selectedItem && rotate(selectedItem.id)}
            >
              <RotateCw size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Удалить предмет"
              disabled={!selectedItem}
              onClick={() => selectedItem && remove(selectedItem.id)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
        <aside className="demo-catalog">
          <h3>Каталог мебели</h3>
          <label className="catalog-search">
            <Search size={15} />
            <input
              aria-label="Поиск мебели"
              placeholder="Поиск мебели…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="catalog-grid">
            {catalog.map((c) => (
              <button
                key={c.key}
                className="catalog-item"
                onClick={() => {
                  if (items.length >= 40) {
                    notify("В демо можно добавить до 40 предметов");
                    return;
                  }
                  const id = crypto.randomUUID();
                  commit([
                    ...items,
                    {
                      id,
                      type: c.type,
                      name: c.name,
                      w: c.w,
                      h: c.h,
                      x: Math.round((template.room.w - c.w) / 2),
                      y: Math.round((template.room.h - c.h) / 2),
                      rot: 0,
                    },
                  ]);
                  setSelected(id);
                }}
                aria-label={`Добавить: ${c.name}`}
              >
                <FurnThumb type={c.type} w={c.w} h={c.h} size={42} />
                <b>
                  {c.cat === "Тумбы"
                    ? c.type === "dresser"
                      ? "Комод"
                      : "Тумба"
                    : c.cat === "Кровати"
                      ? "Кровать"
                      : c.cat === "Столы"
                        ? "Стол"
                        : c.cat === "Стулья"
                          ? "Стул"
                          : "Диван"}
                </b>
                <small>
                  {c.w}×{c.h} см
                </small>
              </button>
            ))}
          </div>
          {catalog.length === 0 && (
            <p className="catalog-empty">Ничего не найдено</p>
          )}
          <button className="download-button" onClick={download}>
            <ArrowDownToLine size={15} /> Скачать PNG
          </button>
        </aside>
      </div>
      <div className="demo-foot">
        <span
          className={`editor-status ${status.errors ? "error" : status.warnings ? "warning" : "ok"}`}
          aria-live="polite"
        >
          {status.errors || status.warnings ? (
            <CircleAlert size={14} />
          ) : (
            <Check size={14} />
          )}
          {status.errors
            ? `Пересечения: ${status.errors}`
            : status.warnings
              ? "Проверь узкие проходы"
              : "Столкновений нет"}
        </span>
        <button
          className="text-button"
          onClick={() => {
            const next =
              templateKey || template !== ROOMS.bedroom
                ? structuredClone(template.items)
                : initialItems();
            commit(next);
            setSelected(next[0]?.id ?? null);
          }}
        >
          Сбросить
        </button>
      </div>
      <p className="demo-notice" role="status">
        {notice || "Перетаскивай предметы. Стрелки — сдвиг, R — поворот."}
      </p>
    </div>
  );
}

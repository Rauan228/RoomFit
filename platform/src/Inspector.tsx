import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  DoorOpen,
  Lock,
  Unlock,
  Trash2,
  Copy,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  FileUp,
  ChevronRight,
  PanelsTopLeft,
} from "lucide-react";
import {
  area,
  bounds,
  perimeter,
  distance,
  toDisplay,
  fromDisplay,
  formatLength,
  makeRoom,
  rectangle,
  moveWallVertex,
  selfIntersects,
  uid,
  furniturePolygon,
  openingPlacement,
  type ProjectDocument,
  type Floor,
  type Variant,
  type CatalogItem,
  type Furniture,
  type Point,
  type analyzeFloor,
  type whatFits,
  type routeClearance,
} from "@roomfit/core";
import { Field } from "./components";
import { FurnitureShape } from "./Plan";
type Mutation<T> = (fn: (data: T) => void, transient?: boolean) => void;
export function NumberInput({
  value,
  set,
  min = -1000000,
  max = 1000000,
  label,
  step = 0.1,
}: {
  value: number;
  set: (n: number) => void;
  min?: number;
  max?: number;
  label?: string;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      aria-label={label}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text);
        if (text && Number.isFinite(n) && n >= min && n <= max) set(n);
        else setText(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
interface Props {
  doc: ProjectDocument;
  floor: Floor;
  variant: Variant;
  panel: string;
  selected: string[];
  entity: { id: string; kind: string };
  catalog: CatalogItem[];
  personal: CatalogItem[];
  analysis: ReturnType<typeof analyzeFloor>;
  fits: ReturnType<typeof whatFits> | null;
  routeResult: ReturnType<typeof routeClearance> | null;
  readOnly: boolean;
  updateFloor: Mutation<Floor>;
  updateVariant: Mutation<Variant>;
  change: Mutation<ProjectDocument>;
  setSelected: (ids: string[]) => void;
  setEntity: (entity: { id: string; kind: string }) => void;
  addItem: (c: CatalogItem, p?: Point, angle?: number) => void;
  deleteSelected: () => void;
  setDialog: (s: string) => void;
  setHint: (s: string) => void;
  importFile: (f: File) => Promise<void>;
  onRoute: () => void;
  onFit: () => void;
  onOpeningTool: (kind: "door" | "window") => void;
  onSelectOpening: (id: string) => void;
  onFocusIssue: (p: Point) => void;
}
export function Inspector(p: Props) {
  const {
    doc,
    floor,
    variant,
    panel,
    selected,
    entity,
    analysis,
    readOnly,
    updateFloor,
    updateVariant,
    change,
  } = p;
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Все"),
    [maxWidth, setMaxWidth] = useState(""),
    [maxDepth, setMaxDepth] = useState("");
  const openingActions = !readOnly && (
    <div className="opening-actions">
      <div className="opening-action-buttons">
        <button
          onClick={() => p.onOpeningTool("door")}
          disabled={!floor.walls.length}
        >
          <DoorOpen size={18} /> Дверь
        </button>
        <button
          onClick={() => p.onOpeningTool("window")}
          disabled={!floor.walls.length}
        >
          <PanelsTopLeft size={18} /> Окно
        </button>
      </div>
      <p>Выбери дверь или окно, затем нажми на стену на плане.</p>
    </div>
  );
  const lengthField = (
    label: string,
    value: number,
    set: (n: number) => void,
    min = 0,
    max = 20000,
  ) => (
    <Field
      label={`${label}, ${doc.units === "ft" ? "ft" : doc.units === "m" ? "м" : "см"}`}
    >
      <NumberInput
        label={`${label}, ${doc.units === "ft" ? "ft" : doc.units === "m" ? "м" : "см"}`}
        value={toDisplay(value, doc.units)}
        min={toDisplay(min, doc.units)}
        max={toDisplay(max, doc.units)}
        set={(n) => set(fromDisplay(n, doc.units))}
      />
    </Field>
  );
  if (panel === "catalog") {
    const source = category === "Моя мебель" ? p.personal : p.catalog,
      shown = source.filter(
        (c) =>
          (!query ||
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.tags.some((t) =>
              t.toLowerCase().includes(query.toLowerCase()),
            )) &&
          (category === "Все" ||
            category === "Моя мебель" ||
            c.category === category) &&
          (!maxWidth || c.width <= fromDisplay(maxWidth, doc.units)) &&
          (!maxDepth || c.depth <= fromDisplay(maxDepth, doc.units)),
      );
    return (
      <div className="panel-content">
        <div className="panel-title">
          <h2>Каталог мебели</h2>
          <span>{source.length}</span>
        </div>
        <p className="muted small">Нажми на предмет, чтобы добавить на план.</p>
        {openingActions}
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Поиск мебели"
            placeholder="Диван, кровать, стол…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="category-chips">
          {[
            "Все",
            "Моя мебель",
            ...new Set(p.catalog.map((c) => c.category)),
          ].map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <details className="catalog-filter">
          <summary>Фильтр по размерам ({doc.units})</summary>
          <div className="two-columns">
            <Field label="Макс. ширина">
              <input
                type="number"
                min="0"
                placeholder="Любая"
                value={maxWidth}
                onChange={(e) => setMaxWidth(e.target.value)}
              />
            </Field>
            <Field label="Макс. глубина">
              <input
                type="number"
                min="0"
                placeholder="Любая"
                value={maxDepth}
                onChange={(e) => setMaxDepth(e.target.value)}
              />
            </Field>
          </div>
        </details>
        <div className="catalog-grid">
          {shown.map((c) => (
            <button
              key={c.id}
              disabled={readOnly}
              className="catalog-item"
              onClick={() => p.addItem(c)}
            >
              <svg
                className="catalog-preview"
                viewBox={`-${c.width / 2 + 120} -${c.depth / 2 + 120} ${c.width + 240} ${c.depth + 240}`}
                aria-hidden="true"
              >
                <FurnitureShape
                  item={{
                    ...c,
                    id: c.id,
                    floorId: floor.id,
                    x: 0,
                    y: 0,
                    angle: 0,
                    locked: false,
                    shopping: {
                      owned: false,
                      price: 0,
                      store: "",
                      url: "",
                      note: "",
                    },
                  }}
                  units={doc.units}
                />
              </svg>
              <strong>{c.name}</strong>
              <span>
                {formatLength(c.width, doc.units)} ×{" "}
                {formatLength(c.depth, doc.units)}
              </span>
              <i className="catalog-add" aria-hidden="true">
                <Plus size={14} />
              </i>
            </button>
          ))}
        </div>
        {!shown.length && (
          <p className="muted">Подходящих предметов пока нет.</p>
        )}
        {!readOnly && (
          <button
            className="full custom-furniture"
            onClick={() => p.setDialog("custom")}
          >
            <Plus size={17} /> Создать свою мебель
          </button>
        )}
        <p className="micro-note">
          Габариты каталога примерные. Введи точные размеры своей мебели в
          свойствах.
        </p>
      </div>
    );
  }
  if (panel === "checks")
    return (
      <div className="panel-content">
        <div className="panel-title">
          <h2>Проверка плана</h2>
          <span className={analysis.errors ? "red-tag" : "green-tag"}>
            {analysis.errors
              ? `${analysis.errors} конфликтов`
              : "Всё помещается"}
          </span>
        </div>
        <div className="check-summary">
          <CheckCircle2 size={22} />
          <div>
            <strong>{(analysis.freeArea / 1e6).toFixed(2)} м² свободно</strong>
            <small>
              Из {(analysis.totalArea / 1e6).toFixed(2)} м² на этаже
            </small>
          </div>
        </div>
        {lengthField(
          "Минимальная ширина прохода",
          doc.settings.clearance,
          (n) =>
            change((d) => {
              d.settings.clearance = n;
            }),
          0,
          3000,
        )}
        <button className="full" onClick={p.onRoute}>
          Показать связность проходов
        </button>
        {p.routeResult && (
          <p className="notice">
            {p.routeResult.hasEntry
              ? `Доступные зоны отмечены зелёным. Не достигнуто ${p.routeResult.unreachable} ячеек.`
              : "Нет доступного входа: добавь дверь шириной не меньше выбранного прохода."}{" "}
            Проверка по консервативной сетке {p.routeResult.step / 10} см.
          </p>
        )}
        <p className="micro-note">
          Сравниваем физические контуры и свободное пространство. Предупреждение
          о ширине прохода требует проверки назначения этого места.
        </p>
        <div className="issue-list">
          {analysis.issues.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                p.setSelected(
                  i.ids.filter((id) => variant.items.some((f) => f.id === id)),
                );
                p.onFocusIssue(i.point);
              }}
              className={`issue ${i.level}`}
            >
              <AlertTriangle size={17} />
              <span>
                {i.text}
                <small>
                  {i.level === "error"
                    ? "Физический конфликт"
                    : "Рекомендация по удобству"}
                </small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
        {!analysis.issues.length && (
          <div className="empty-state">
            <CheckCircle2 size={36} />
            <p>На этом этаже конфликтов не обнаружено.</p>
          </div>
        )}
      </div>
    );
  if (panel === "fits")
    return (
      <div className="panel-content">
        <h2>Что поместится здесь?</h2>
        <button className="full" onClick={p.onFit}>
          Выбрать другую область
        </button>
        {p.fits ? (
          <>
            <p className="notice">
              Выбранная область:{" "}
              {formatLength(p.fits.physicalBounds.width, doc.units)} ×{" "}
              {formatLength(p.fits.physicalBounds.depth, doc.units)}
            </p>
            <p className="micro-note">{p.fits.note}</p>
            {p.fits.results.map((r, i) => (
              <button
                className="fit-result"
                key={`${r.catalog.id}:${i}`}
                onClick={() => p.addItem(r.catalog, r.position, r.angle)}
                disabled={readOnly}
              >
                <span>
                  <strong>{r.catalog.name}</strong>
                  <small>
                    {r.angle}° ·{" "}
                    {r.recommended
                      ? "Есть запас пространства"
                      : "Помещается физически"}
                  </small>
                </span>
                <Plus size={17} />
              </button>
            ))}
            {!p.fits.results.length && (
              <p className="muted">
                Подходящих предметов не найдено. Попробуй выделить большую
                область.
              </p>
            )}
          </>
        ) : (
          <p>Выдели прямоугольную область двумя точками на плане.</p>
        )}
      </div>
    );
  if (panel === "room") {
    const room = floor.rooms[0],
      b = room ? bounds(room.points) : null;
    return (
      <div className="panel-content">
        <h2>Помещение</h2>
        <h3>Двери и окна</h3>
        {openingActions}
        {floor.openings.length > 0 && (
          <div className="opening-list">
            {floor.openings.map((o) => (
              <button key={o.id} onClick={() => p.onSelectOpening(o.id)}>
                {o.kind === "window" ? (
                  <PanelsTopLeft size={18} />
                ) : (
                  <DoorOpen size={18} />
                )}
                <span>
                  <strong>
                    {o.kind === "window"
                      ? "Окно"
                      : o.kind === "double"
                        ? "Двустворчатая дверь"
                        : o.kind === "sliding"
                          ? "Раздвижная дверь"
                          : "Дверь"}
                  </strong>
                  <small>
                    Стена {floor.walls.findIndex((w) => w.id === o.wallId) + 1}{" "}
                    · {formatLength(o.width, doc.units)}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        <fieldset disabled={readOnly}>
          <Field label="Название этажа">
            <input
              value={floor.name}
              maxLength={120}
              onChange={(e) =>
                updateFloor((f) => {
                  f.name = e.target.value || "Этаж";
                })
              }
            />
          </Field>
          <Field label="Единицы измерения">
            <select
              value={doc.units}
              onChange={(e) =>
                change((d) => {
                  d.units = e.target.value as ProjectDocument["units"];
                })
              }
            >
              <option value="cm">Сантиметры</option>
              <option value="m">Метры</option>
              <option value="ft">Футы</option>
            </select>
          </Field>
          {room && b && (
            <>
              <div className="room-stats">
                <span>
                  <strong>{(area(room.points) / 1e6).toFixed(2)} м²</strong>
                  Площадь
                </span>
                <span>
                  <strong>
                    {(perimeter(room.points) / 1000).toFixed(2)} м
                  </strong>
                  Периметр
                </span>
              </div>
              <Field label="Комнаты на этаже">
                <select
                  value={entity.kind === "room" ? entity.id : room.id}
                  onChange={(e) => {
                    p.setSelected([]);
                    p.setEntity({ id: e.target.value, kind: "room" });
                  }}
                >
                  <option value="" disabled>
                    Выбрать комнату
                  </option>
                  {floor.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="full"
                onClick={() => {
                  p.setSelected([]);
                  p.setEntity({ id: room.id, kind: "room" });
                  p.setHint(
                    "Открой «Свойства», чтобы изменить контур и размеры комнаты.",
                  );
                }}
              >
                Выбрать первую комнату
              </button>
            </>
          )}
          <details open>
            <summary>Добавить комнату</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  w = Number(f.get("width")) * 10,
                  h = Number(f.get("depth")) * 10;
                const current = floor.rooms.length
                  ? bounds(floor.rooms.flatMap((r) => r.points))
                  : { maxX: -w, minY: 0 };
                const r = makeRoom(
                  String(f.get("name")),
                  rectangle(w, h, current.maxX + 500, current.minY),
                );
                updateFloor((f) => {
                  f.rooms.push(r.room);
                  f.walls.push(...r.walls);
                });
                p.setHint(
                  "Комната добавлена справа. Нажми «Вписать план», чтобы увидеть её.",
                );
              }}
            >
              <input
                name="name"
                placeholder="Название"
                defaultValue="Новая комната"
                required
                maxLength={120}
              />
              <div className="two-columns">
                <Field label="Ширина, см">
                  <input
                    name="width"
                    type="number"
                    min={50}
                    max={5000}
                    defaultValue={300}
                    required
                  />
                </Field>
                <Field label="Глубина, см">
                  <input
                    name="depth"
                    type="number"
                    min={50}
                    max={5000}
                    defaultValue={300}
                    required
                  />
                </Field>
              </div>
              <button className="full">
                <Plus size={16} /> Добавить
              </button>
            </form>
          </details>
          <details>
            <summary>Добавить проём по номеру стены</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget),
                  wall = floor.walls.find((w) => w.id === form.get("wall"))!;
                if (!wall || floor.openings.length >= 200) return;
                const width = Math.min(
                  Number(form.get("width")) * 10,
                  distance(wall.start, wall.end),
                );
                if (width < 100) return;
                const placement = openingPlacement(
                  { ...floor, walls: [wall] },
                  {
                    x: (wall.start.x + wall.end.x) / 2,
                    y: (wall.start.y + wall.end.y) / 2,
                  },
                  width,
                  0,
                );
                if (!placement) {
                  p.setHint(
                    "В центре этой стены уже есть проём. Добавь новый нажатием на свободный участок стены.",
                  );
                  return;
                }
                const id = uid();
                updateFloor((f) =>
                  f.openings.push({
                    id,
                    wallId: wall.id,
                    kind: form.get("kind") as Floor["openings"][number]["kind"],
                    offset: Math.max(
                      0,
                      (distance(wall.start, wall.end) - width) / 2,
                    ),
                    width,
                    height: form.get("kind") === "window" ? 1500 : 2100,
                    sill: form.get("kind") === "window" ? 900 : 0,
                    flip: false,
                    inward: true,
                  }),
                );
                p.onSelectOpening(id);
                p.setHint(
                  "Проём добавлен. Смещение и направление открывания доступны в свойствах.",
                );
              }}
            >
              <Field label="Стена">
                <select name="wall">
                  {floor.walls.map((w, i) => (
                    <option key={w.id} value={w.id}>
                      Стена {i + 1} ·{" "}
                      {formatLength(distance(w.start, w.end), doc.units)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Тип проёма">
                <select name="kind">
                  <option value="door">Дверь</option>
                  <option value="double">Двустворчатая дверь</option>
                  <option value="sliding">Раздвижная дверь</option>
                  <option value="window">Окно</option>
                </select>
              </Field>
              <Field label="Ширина, см">
                <input
                  name="width"
                  type="number"
                  min={10}
                  max={1000}
                  defaultValue={80}
                  required
                />
              </Field>
              <button
                className="full"
                disabled={!floor.walls.length || floor.openings.length >= 200}
              >
                <DoorOpen size={17} /> Добавить проём
              </button>
            </form>
          </details>
          {lengthField(
            "Шаг сетки",
            doc.settings.gridSize,
            (n) =>
              change((d) => {
                d.settings.gridSize = n;
              }),
            1,
            1000,
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.settings.snap}
              onChange={(e) =>
                change((d) => {
                  d.settings.snap = e.target.checked;
                })
              }
            />{" "}
            Привязка к сетке и вершинам
          </label>
          <label className="button full">
            <FileUp size={17} /> Импорт плана / JSON
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,application/pdf,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void p.importFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {floor.underlay && (
            <>
              <Field label="Прозрачность подложки">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={floor.underlay.opacity}
                  onChange={(e) =>
                    updateFloor((f) => {
                      f.underlay!.opacity = Number(e.target.value);
                    })
                  }
                />
              </Field>
              {lengthField(
                "X подложки",
                floor.underlay.x,
                (n) =>
                  updateFloor((f) => {
                    f.underlay!.x = n;
                  }),
                -1e6,
                1e6,
              )}
              {lengthField(
                "Y подложки",
                floor.underlay.y,
                (n) =>
                  updateFloor((f) => {
                    f.underlay!.y = n;
                  }),
                -1e6,
                1e6,
              )}
              <button
                className="danger full"
                onClick={() =>
                  updateFloor((f) => {
                    delete f.underlay;
                  })
                }
              >
                Удалить подложку
              </button>
            </>
          )}
          {doc.floors.length > 1 && (
            <button
              className="danger full"
              onClick={() => {
                if (confirm("Удалить этаж со всеми его предметами?"))
                  change((d) => {
                    d.floors = d.floors.filter((f) => f.id !== floor.id);
                    d.variants.forEach((v) => {
                      v.items = v.items.filter((i) => i.floorId !== floor.id);
                    });
                  });
              }}
            >
              Удалить этаж
            </button>
          )}
        </fieldset>
      </div>
    );
  }
  const item =
    selected.length === 1
      ? variant.items.find((i) => i.id === selected[0])
      : null;
  const patchItem = (fn: (item: Furniture) => void) =>
    updateVariant((v) => {
      const target = v.items.find((i) => i.id === item!.id)!;
      fn(target);
    });
  const wall = floor.walls.find((w) => w.id === entity.id),
    opening = floor.openings.find((o) => o.id === entity.id),
    room = floor.rooms.find((r) => r.id === entity.id);
  const setVertex = (old: Point, next: Point) => {
    const result = moveWallVertex(floor, old, next);
    if (
      result.rooms.some((r) => selfIntersects(r.points)) ||
      result.walls.some((w) => distance(w.start, w.end) < 100)
    ) {
      p.setHint("Нельзя пересечь контур или сделать стену короче 10 см.");
      return;
    }
    change((d) => {
      d.floors = d.floors.map((f) => (f.id === floor.id ? result : f));
    });
  };
  return (
    <div className="panel-content">
      <h2>
        Свойства {selected.length > 1 ? `· ${selected.length} предметов` : ""}
      </h2>
      <fieldset disabled={readOnly}>
        {item && (
          <>
            <Field label="Название предмета">
              <input
                value={item.name}
                maxLength={120}
                onChange={(e) =>
                  patchItem((i) => {
                    i.name = e.target.value || "Предмет";
                  })
                }
              />
            </Field>
            <fieldset disabled={item.locked}>
              <div className="two-columns">
                {lengthField(
                  "Ширина",
                  item.width,
                  (n) =>
                    patchItem((i) => {
                      i.width = n;
                    }),
                  10,
                )}
                {lengthField(
                  "Глубина",
                  item.depth,
                  (n) =>
                    patchItem((i) => {
                      i.depth = n;
                    }),
                  10,
                )}
                {lengthField("Высота", item.height, (n) =>
                  patchItem((i) => {
                    i.height = n;
                  }),
                )}
                {
                  <Field label="Поворот, °">
                    <NumberInput
                      value={item.angle}
                      min={-3600}
                      max={3600}
                      set={(n) =>
                        patchItem((i) => {
                          i.angle = n;
                        })
                      }
                    />
                  </Field>
                }
                {lengthField(
                  "X центра",
                  item.x,
                  (n) =>
                    patchItem((i) => {
                      i.x = n;
                    }),
                  -1e6,
                  1e6,
                )}
                {lengthField(
                  "Y центра",
                  item.y,
                  (n) =>
                    patchItem((i) => {
                      i.y = n;
                    }),
                  -1e6,
                  1e6,
                )}
              </div>
              <Field label="Цвет">
                <input
                  type="color"
                  value={item.color}
                  onChange={(e) =>
                    patchItem((i) => {
                      i.color = e.target.value;
                    })
                  }
                />
              </Field>
              {lengthField(
                "Зона обслуживания вокруг",
                item.clearance,
                (n) =>
                  patchItem((i) => {
                    i.clearance = n;
                  }),
                0,
                3000,
              )}
              <p className="micro-note">
                Зона обслуживания симметрична. Для точного запрета добавь
                отдельную зону на плане.
              </p>
            </fieldset>
            <div className="object-actions">
              <button
                onClick={() =>
                  patchItem((i) => {
                    i.locked = !i.locked;
                  })
                }
              >
                {item.locked ? <Unlock size={17} /> : <Lock size={17} />}{" "}
                {item.locked ? "Разблокировать" : "Заблокировать"}
              </button>
              <button
                disabled={item.locked}
                title="Поворот 90°"
                onClick={() =>
                  patchItem((i) => {
                    i.angle += 90;
                  })
                }
              >
                <RotateCw size={17} />
              </button>
              <button
                title="Дублировать"
                onClick={() => {
                  const copy = {
                    ...structuredClone(item),
                    id: uid(),
                    x: item.x + 100,
                    y: item.y + 100,
                    locked: false,
                    groupId: undefined,
                  };
                  updateVariant((v) => v.items.push(copy));
                  p.setSelected([copy.id]);
                }}
              >
                <Copy size={17} />
              </button>
            </div>
            <button
              className="danger full"
              disabled={item.locked}
              onClick={p.deleteSelected}
            >
              <Trash2 size={16} /> Удалить предмет
            </button>
          </>
        )}
        {selected.length > 1 && (
          <>
            <div className="object-actions">
              <button
                onClick={() => {
                  const id = uid();
                  updateVariant((v) =>
                    v.items.forEach((i) => {
                      if (selected.includes(i.id) && !i.locked) i.groupId = id;
                    }),
                  );
                }}
              >
                Сгруппировать
              </button>
              <button
                onClick={() =>
                  updateVariant((v) =>
                    v.items.forEach((i) => {
                      if (selected.includes(i.id)) delete i.groupId;
                    }),
                  )
                }
              >
                Разгруппировать
              </button>
            </div>
            <div className="object-actions">
              {["left", "right", "top", "bottom", "center-x", "center-y"].map(
                (axis) => (
                  <button
                    key={axis}
                    onClick={() =>
                      updateVariant((v) => {
                        const items = v.items.filter((i) =>
                            selected.includes(i.id),
                          ),
                          polygons = items.flatMap((i) => furniturePolygon(i)),
                          b = bounds(polygons);
                        items
                          .filter((i) => !i.locked)
                          .forEach((i) => {
                            const q = bounds(furniturePolygon(i));
                            if (axis === "left") i.x += b.minX - q.minX;
                            if (axis === "right") i.x += b.maxX - q.maxX;
                            if (axis === "top") i.y += b.minY - q.minY;
                            if (axis === "bottom") i.y += b.maxY - q.maxY;
                            if (axis === "center-x")
                              i.x = (b.minX + b.maxX) / 2;
                            if (axis === "center-y")
                              i.y = (b.minY + b.maxY) / 2;
                          });
                      })
                    }
                  >
                    {
                      {
                        left: "Слева",
                        right: "Справа",
                        top: "Сверху",
                        bottom: "Снизу",
                        "center-x": "Центр X",
                        "center-y": "Центр Y",
                      }[axis]
                    }
                  </button>
                ),
              )}
            </div>
            <button
              className="full"
              onClick={() =>
                updateVariant((v) => {
                  const items = v.items
                    .filter((i) => selected.includes(i.id) && !i.locked)
                    .sort((a, b) => a.x - b.x);
                  if (items.length < 3) return;
                  const start = items[0].x,
                    step =
                      (items[items.length - 1].x - start) / (items.length - 1);
                  items.forEach((i, n) => {
                    i.x = start + step * n;
                  });
                })
              }
            >
              Распределить по горизонтали
            </button>
            <button className="danger full" onClick={p.deleteSelected}>
              Удалить выбранные
            </button>
          </>
        )}
        {wall && (
          <>
            <h3>
              Стена · {formatLength(distance(wall.start, wall.end), doc.units)}
            </h3>
            {lengthField(
              "Толщина стены",
              wall.thickness,
              (n) =>
                updateFloor((f) => {
                  f.walls.find((w) => w.id === wall.id)!.thickness = n;
                }),
              20,
              1000,
            )}
            {lengthField(
              "Высота стены",
              wall.height,
              (n) =>
                updateFloor((f) => {
                  f.walls.find((w) => w.id === wall.id)!.height = n;
                }),
              500,
            )}
            {(["start", "end"] as const).map((end, n) => (
              <div key={end}>
                <h3>{n ? "Конец" : "Начало"} стены</h3>
                <div className="two-columns">
                  {lengthField(
                    "X",
                    wall[end].x,
                    (value) => setVertex(wall[end], { ...wall[end], x: value }),
                    -1e6,
                    1e6,
                  )}
                  {lengthField(
                    "Y",
                    wall[end].y,
                    (value) => setVertex(wall[end], { ...wall[end], y: value }),
                    -1e6,
                    1e6,
                  )}
                </div>
              </div>
            ))}
            <button className="danger full" onClick={p.deleteSelected}>
              Удалить перегородку
            </button>
          </>
        )}
        {room && (
          <>
            <Field label="Название комнаты">
              <input
                value={room.name}
                onChange={(e) =>
                  updateFloor((f) => {
                    f.rooms.find((r) => r.id === room.id)!.name =
                      e.target.value || "Комната";
                  })
                }
              />
            </Field>
            <Field label="Покрытие пола">
              <select
                value={room.floor}
                onChange={(e) =>
                  updateFloor((f) => {
                    f.rooms.find((r) => r.id === room.id)!.floor = e.target
                      .value as typeof room.floor;
                  })
                }
              >
                <option value="oak">Дуб</option>
                <option value="light">Светлый</option>
                <option value="walnut">Орех</option>
                <option value="tile">Плитка</option>
              </select>
            </Field>
            {lengthField(
              "Высота помещения",
              room.height,
              (n) =>
                updateFloor((f) => {
                  f.rooms.find((r) => r.id === room.id)!.height = n;
                }),
              500,
            )}
            <div className="room-stats">
              <span>
                <strong>{(area(room.points) / 1e6).toFixed(2)} м²</strong>
                Площадь
              </span>
              <span>
                <strong>{(perimeter(room.points) / 1000).toFixed(2)} м</strong>
                Периметр
              </span>
            </div>
            <details open>
              <summary>Вершины контура</summary>
              {room.points.map((point, index) => (
                <div key={index} className="two-columns">
                  {lengthField(
                    `X ${index + 1}`,
                    point.x,
                    (n) => setVertex(point, { ...point, x: n }),
                    -1e6,
                    1e6,
                  )}
                  {lengthField(
                    `Y ${index + 1}`,
                    point.y,
                    (n) => setVertex(point, { ...point, y: n }),
                    -1e6,
                    1e6,
                  )}
                </div>
              ))}
            </details>
            <button className="danger full" onClick={p.deleteSelected}>
              Удалить комнату
            </button>
          </>
        )}
        {opening &&
          (() => {
            const w = floor.walls.find((w) => w.id === opening.wallId)!,
              l = distance(w.start, w.end);
            const patch = (fn: (o: NonNullable<typeof opening>) => void) => {
              const next = { ...opening };
              fn(next);
              if (
                floor.openings.some(
                  (o) =>
                    o.id !== next.id &&
                    o.wallId === next.wallId &&
                    next.offset < o.offset + o.width &&
                    next.offset + next.width > o.offset,
                )
              ) {
                p.setHint(
                  "Проёмы на одной стене не должны пересекаться. Измени ширину или расстояние от края.",
                );
                return;
              }
              updateFloor((f) => {
                const o = f.openings.find((v) => v.id === opening.id)!;
                Object.assign(o, next);
              });
            };
            return (
              <>
                <h3>{opening.kind === "window" ? "Окно" : "Дверь"} в стене</h3>
                <p className="micro-note">
                  Перетаскивай проём вдоль стены. Здесь можно задать точные
                  размеры и расстояния от её краёв.
                </p>
                <Field label="Стена проёма">
                  <select
                    value={opening.wallId}
                    onChange={(e) => {
                      const target = floor.walls.find(
                        (v) => v.id === e.target.value,
                      )!;
                      if (distance(target.start, target.end) < opening.width) {
                        p.setHint(
                          "Эта стена короче проёма. Сначала уменьши его ширину.",
                        );
                        return;
                      }
                      patch((o) => {
                        o.wallId = target.id;
                        o.offset = Math.min(
                          o.offset,
                          distance(target.start, target.end) - o.width,
                        );
                      });
                    }}
                  >
                    {floor.walls.map((wall, i) => (
                      <option key={wall.id} value={wall.id}>
                        Стена {i + 1} ·{" "}
                        {formatLength(
                          distance(wall.start, wall.end),
                          doc.units,
                        )}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Тип">
                  <select
                    value={opening.kind}
                    onChange={(e) =>
                      patch((o) => {
                        o.kind = e.target.value as typeof o.kind;
                      })
                    }
                  >
                    <option value="door">Дверь</option>
                    <option value="double">Двустворчатая</option>
                    <option value="sliding">Раздвижная</option>
                    <option value="window">Окно</option>
                  </select>
                </Field>
                {lengthField(
                  "Ширина",
                  opening.width,
                  (n) =>
                    patch((o) => {
                      o.width = n;
                      o.offset = Math.min(o.offset, l - n);
                    }),
                  100,
                  Math.min(10000, l),
                )}
                {lengthField(
                  "От первого края стены",
                  opening.offset,
                  (n) =>
                    patch((o) => {
                      o.offset = n;
                    }),
                  0,
                  l - opening.width,
                )}
                {lengthField(
                  "От второго края стены",
                  l - opening.offset - opening.width,
                  (n) =>
                    patch((o) => {
                      o.offset = l - o.width - n;
                    }),
                  0,
                  l - opening.width,
                )}
                {lengthField(
                  "Высота",
                  opening.height,
                  (n) =>
                    patch((o) => {
                      o.height = n;
                    }),
                  100,
                  10000,
                )}
                {opening.kind === "window" &&
                  lengthField(
                    "Подоконник",
                    opening.sill,
                    (n) =>
                      patch((o) => {
                        o.sill = n;
                      }),
                    0,
                    10000,
                  )}
                {opening.kind !== "window" && opening.kind !== "sliding" && (
                  <>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={opening.flip}
                        onChange={(e) =>
                          patch((o) => {
                            o.flip = e.target.checked;
                          })
                        }
                      />{" "}
                      Петли с другой стороны
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={opening.inward}
                        onChange={(e) =>
                          patch((o) => {
                            o.inward = e.target.checked;
                          })
                        }
                      />{" "}
                      Открывание внутрь
                    </label>
                  </>
                )}
                <button className="danger full" onClick={p.deleteSelected}>
                  Удалить проём
                </button>
              </>
            );
          })()}
        {["zone", "measurement", "annotation"].includes(entity.kind) && (
          <>
            <h3>
              {entity.kind === "zone"
                ? "Зона"
                : entity.kind === "annotation"
                  ? "Подпись"
                  : "Измерение"}
            </h3>
            {entity.kind === "zone" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={
                    floor.zones.find((z) => z.id === entity.id)?.forbidden ||
                    false
                  }
                  onChange={(e) =>
                    updateFloor((f) => {
                      f.zones.find((z) => z.id === entity.id)!.forbidden =
                        e.target.checked;
                    })
                  }
                />{" "}
                Запретить мебель
              </label>
            )}
            {entity.kind === "annotation" && (
              <textarea
                value={
                  floor.annotations.find((a) => a.id === entity.id)?.text || ""
                }
                maxLength={500}
                onChange={(e) =>
                  updateFloor((f) => {
                    f.annotations.find((a) => a.id === entity.id)!.text =
                      e.target.value;
                  })
                }
              />
            )}
            <button className="danger full" onClick={p.deleteSelected}>
              Удалить
            </button>
          </>
        )}
        {!item && !selected.length && !entity.id && (
          <div className="empty-state">
            <p>
              Выбери мебель, стену или комнату на плане, чтобы изменить
              свойства.
            </p>
            <small>
              Shift + клик — несколько предметов.
              <br />R — поворот. Стрелки — сдвиг на 1 см.
            </small>
          </div>
        )}
      </fieldset>
      <details className="object-list" open>
        <summary>
          Предметы на этаже (
          {variant.items.filter((i) => i.floorId === floor.id).length})
        </summary>
        {variant.items
          .filter((i) => i.floorId === floor.id)
          .map((i) => (
            <button
              key={i.id}
              className={selected.includes(i.id) ? "selected" : ""}
              onClick={(e) => {
                p.setSelected(
                  e.shiftKey ? [...new Set([...selected, i.id])] : [i.id],
                );
                p.setEntity({ id: "", kind: "" });
                p.onFocusIssue(i);
              }}
            >
              <span>{i.name}</span>
              <small>
                {i.locked ? (
                  <Lock size={12} />
                ) : (
                  formatLength(i.width, doc.units)
                )}
              </small>
            </button>
          ))}
      </details>
    </div>
  );
}

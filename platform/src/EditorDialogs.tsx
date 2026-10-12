import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Plus, Trash2, Check } from "lucide-react";
import {
  analyzeFloor,
  fromDisplay,
  uid,
  selfIntersects,
  type ProjectDocument,
  type Floor,
  type Point,
  type CatalogItem,
} from "@roomfit/core";
import { request } from "./api";
import { Modal, Field, ErrorBox } from "./components";
import { PlanContent, planBounds } from "./Plan";
import { exportPlan, downloadJSON, download } from "./exports";
type Change = (fn: (d: ProjectDocument) => void) => void;
export function ExportDialog({
  doc,
  floorId,
  close,
}: {
  doc: ProjectDocument;
  floorId: string;
  close: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [floor, setFloor] = useState(floorId);
  return (
    <Modal title="Экспорт плана" close={close}>
      <p className="muted">
        Актуальная геометрия, реальные размеры и список мебели.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await exportPlan(doc, {
              format: String(f.get("format")) as "png" | "svg" | "pdf",
              floorId: floor,
              roomId: String(f.get("room") || ""),
              variantId: String(f.get("variant")),
              resolution: Number(f.get("resolution")),
              paper: String(f.get("paper")) as "a4" | "a3",
              orientation: String(f.get("orientation")) as
                "portrait" | "landscape",
              scale: Number(f.get("scale")),
              mono: f.get("mono") === "on",
              names: f.get("names") === "on",
              dimensions: f.get("dimensions") === "on",
              furniture: f.get("furniture") === "on",
              area: true,
            });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="two-columns">
          <Field label="Формат">
            <select name="format">
              <option value="png">PNG</option>
              <option value="pdf">PDF / печать</option>
              <option value="svg">SVG</option>
            </select>
          </Field>
          <Field label="Разрешение PNG, px">
            <select name="resolution">
              <option value="2400">2400</option>
              <option value="3600">3600</option>
              <option value="4800">4800</option>
            </select>
          </Field>
        </div>
        <Field label="Этаж">
          <select value={floor} onChange={(e) => setFloor(e.target.value)}>
            {doc.floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Область экспорта">
          <select name="room" key={floor}>
            <option value="">Весь этаж</option>
            {doc.floors
              .find((f) => f.id === floor)!
              .rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Вариант">
          <select name="variant" defaultValue={doc.activeVariantId}>
            {doc.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="two-columns">
          <Field label="Лист PDF">
            <select name="paper">
              <option value="a4">A4</option>
              <option value="a3">A3</option>
            </select>
          </Field>
          <Field label="Ориентация">
            <select name="orientation">
              <option value="landscape">Альбомная</option>
              <option value="portrait">Книжная</option>
            </select>
          </Field>
        </div>
        <Field label="Масштаб PDF, 1:">
          <input
            type="number"
            name="scale"
            min="1"
            max="1000"
            defaultValue={50}
            required
          />
          <small>
            Для печати выбери «Фактический размер» в PDF-просмотрщике.
          </small>
        </Field>
        <div className="export-checkboxes">
          <label>
            <input name="furniture" type="checkbox" defaultChecked /> Мебель
          </label>
          <label>
            <input name="dimensions" type="checkbox" defaultChecked /> Размеры
          </label>
          <label>
            <input name="names" type="checkbox" /> Подписи и площадь
          </label>
          <label>
            <input name="mono" type="checkbox" /> Чёрно-белый
          </label>
        </div>
        <ErrorBox error={error} />
        <button disabled={busy} className="primary full">
          <Download size={17} />
          {busy ? "Готовим файл…" : "Скачать план"}
        </button>
        <button
          type="button"
          className="full"
          onClick={() => downloadJSON(doc)}
        >
          Скачать полный проект JSON
        </button>
      </form>
    </Modal>
  );
}
export function ShareDialog({
  projectId,
  close,
}: {
  projectId: string;
  close: () => void;
}) {
  const [shares, setShares] = useState<{ id: string; expiresAt: string }[]>([]),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const reload = () =>
    request<typeof shares>(`/projects/${projectId}/shares`)
      .then(setShares)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void reload();
  }, [projectId]);
  return (
    <Modal title="Поделиться проектом" close={close}>
      <p className="muted">
        Проект приватный. По созданной ссылке его можно только смотреть. Ссылка
        действует 30 дней.
      </p>
      <ErrorBox error={error} />
      <button
        className="primary full"
        onClick={async () => {
          try {
            const s = await request<{ token: string }>(
              `/projects/${projectId}/shares`,
              "POST",
              {},
            );
            setUrl(`${location.origin}/share/${s.token}`);
            setCopied(false);
            await reload();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Plus size={17} /> Создать ссылку для просмотра
      </button>
      {url && (
        <div className="share-link">
          <input
            value={url}
            readOnly
            aria-label="Ссылка для просмотра"
            onFocus={(e) => e.target.select()}
          />
          <button
            className="icon"
            title="Копировать"
            onClick={() => {
              navigator.clipboard
                .writeText(url)
                .then(() => setCopied(true))
                .catch(() => setError("Выдели ссылку и скопируй вручную."));
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      )}
      <div className="share-list">
        {shares.map((s, i) => (
          <div key={s.id}>
            <span>
              Ссылка {i + 1}
              <small>
                До {new Date(s.expiresAt).toLocaleDateString("ru-RU")}
              </small>
            </span>
            <button
              className="danger"
              onClick={async () => {
                try {
                  await request(
                    `/projects/${projectId}/shares/${s.id}`,
                    "DELETE",
                  );
                  setUrl("");
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Отозвать
            </button>
          </div>
        ))}
      </div>
      <p className="micro-note">
        Получатели видят все этажи, варианты и данные списка покупок. Создай
        отдельную копию проекта, если нужно скрыть личные заметки.
      </p>
    </Modal>
  );
}
export function CompareDialog({
  doc,
  floor,
  selected,
  change,
  readOnly,
  close,
}: {
  doc: ProjectDocument;
  floor: Floor;
  selected: string[];
  change: Change;
  readOnly: boolean;
  close: () => void;
}) {
  const [left, setLeft] = useState(doc.activeVariantId),
    [right, setRight] = useState(
      doc.variants.find((v) => v.id !== doc.activeVariantId)?.id ||
        doc.activeVariantId,
    ),
    [zoom, setZoom] = useState(1);
  const b = useMemo(
    () =>
      planBounds(
        floor,
        doc.variants.flatMap((v) => v.items),
      ),
    [floor, doc.variants],
  );
  const view = {
    x: b.x + (b.width * (1 - 1 / zoom)) / 2,
    y: b.y + (b.height * (1 - 1 / zoom)) / 2,
    width: b.width / zoom,
    height: b.height / zoom,
  };
  return (
    <Modal title="Сравнение расстановок" close={close} wide>
      <p className="muted">
        Метрики каждого варианта рассчитаны независимо для «{floor.name}».
        Свободная площадь учитывает объединение физических контуров.
      </p>
      <Field label="Общий масштаб">
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </Field>
      <div className="compare-grid">
        {[left, right].map((id, side) => {
          const variant =
              doc.variants.find((v) => v.id === id) || doc.variants[0],
            metrics = analyzeFloor(
              floor,
              variant.items,
              doc.settings.clearance,
            );
          return (
            <section className="compare-panel" key={side}>
              <select
                aria-label={side ? "Правый вариант" : "Левый вариант"}
                value={variant.id}
                onChange={(e) =>
                  side ? setRight(e.target.value) : setLeft(e.target.value)
                }
              >
                {doc.variants.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}>
                <PlanContent
                  floor={floor}
                  items={variant.items}
                  doc={doc}
                  status={metrics.status}
                />
              </svg>
              <div className="metric-grid">
                <span>
                  <strong>{metrics.errors}</strong>Столкновения
                </span>
                <span>
                  <strong>{metrics.warnings}</strong>Предупреждения
                </span>
                <span>
                  <strong>{(metrics.freeArea / 1e6).toFixed(2)} м²</strong>
                  Свободно
                </span>
                <span>
                  <strong>
                    {metrics.minClearance === null
                      ? "—"
                      : `${Math.round(metrics.minClearance / 10)} см`}
                  </strong>
                  Мин. зазор
                </span>
                <span>
                  <strong>
                    {variant.items.filter((i) => i.floorId === floor.id).length}
                  </strong>
                  Предметы
                </span>
              </div>
              {!readOnly && (
                <div className="variant-actions">
                  <button
                    className={
                      doc.activeVariantId === variant.id ? "primary" : ""
                    }
                    onClick={() =>
                      change((d) => {
                        d.activeVariantId = variant.id;
                      })
                    }
                  >
                    {doc.activeVariantId === variant.id
                      ? "✓ Основной"
                      : "Сделать основным"}
                  </button>
                  <button
                    onClick={() => {
                      const name = prompt("Название варианта", variant.name);
                      if (name?.trim())
                        change((d) => {
                          d.variants.find((v) => v.id === variant.id)!.name =
                            name.trim().slice(0, 120);
                        });
                    }}
                  >
                    Переименовать
                  </button>
                  <button
                    disabled={doc.variants.length >= 30}
                    onClick={() =>
                      change((d) => {
                        const copy = structuredClone(variant);
                        copy.id = uid();
                        copy.name += " — копия";
                        d.variants.push(copy);
                      })
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    disabled={doc.variants.length <= 1}
                    onClick={() => {
                      if (!confirm("Удалить вариант?")) return;
                      change((d) => {
                        d.variants = d.variants.filter(
                          (v) => v.id !== variant.id,
                        );
                        if (d.activeVariantId === variant.id)
                          d.activeVariantId = d.variants[0].id;
                      });
                      side
                        ? setRight(
                            doc.variants.find((v) => v.id !== variant.id)!.id,
                          )
                        : setLeft(
                            doc.variants.find((v) => v.id !== variant.id)!.id,
                          );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {!readOnly && selected.length > 0 && left !== right && (
        <button
          onClick={() =>
            change((d) => {
              const source = d.variants.find((v) => v.id === left)!,
                target = d.variants.find((v) => v.id === right)!;
              const ids = new Set(target.items.map((i) => i.id));
              const items = source.items
                .filter((i) => selected.includes(i.id))
                .map((i) => ({
                  ...structuredClone(i),
                  id: ids.has(i.id) ? uid() : i.id,
                }));
              target.items.push(...items);
            })
          }
        >
          Копировать выделенные предметы из левого варианта в правый
        </button>
      )}
      <p className="micro-note">
        Автоматические варианты — результат ограниченного геометрического
        поиска. Они не гарантируют оптимальную расстановку или удобство.
      </p>
    </Modal>
  );
}
export function ShoppingDialog({
  doc,
  change,
  readOnly,
  close,
}: {
  doc: ProjectDocument;
  change: Change;
  readOnly: boolean;
  close: () => void;
}) {
  const variant = doc.variants.find((v) => v.id === doc.activeVariantId)!,
    budget = variant.items
      .filter((i) => !i.shopping.owned)
      .reduce((s, i) => s + i.shopping.price, 0);
  const groups = useMemo(() => {
    const map = new Map<string, typeof variant.items>();
    for (const i of variant.items) {
      const key = `${i.name}:${i.width}:${i.depth}:${i.height}:${JSON.stringify(i.shopping)}`;
      map.set(key, [...(map.get(key) || []), i]);
    }
    return [...map.values()];
  }, [variant.items]);
  const csv = () => {
    const rows = [
      [
        "Предмет",
        "Кол-во",
        "Ширина мм",
        "Глубина мм",
        "Высота мм",
        "Уже есть",
        "Цена",
        "Магазин",
        "Ссылка",
        "Заметка",
      ],
      ...groups.map((g) => {
        const i = g[0];
        return [
          i.name,
          g.length,
          i.width,
          i.depth,
          i.height,
          i.shopping.owned ? "Да" : "Нет",
          i.shopping.price,
          i.shopping.store,
          i.shopping.url,
          i.shopping.note,
        ];
      }),
    ];
    const quote = (v: unknown) => {
      const value = String(v);
      return (
        '"' +
        (/^[=+\-@]/.test(value) ? "'" : "") +
        value.replace(/"/g, '""') +
        '"'
      );
    };
    download(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(quote).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      `${doc.name}-мебель.csv`,
    );
  };
  return (
    <Modal title="Список мебели" close={close} wide>
      <div className="shopping-head">
        <p className="muted">
          {variant.name} · все этажи · {variant.items.length} предметов
        </p>
        <strong>К покупке: {budget.toLocaleString("ru-RU")}</strong>
        <button onClick={csv}>
          <Download size={16} /> CSV
        </button>
      </div>
      <div className="shopping-list">
        {groups.map((group) => {
          const i = group[0],
            patch = (fn: (shopping: typeof i.shopping) => void) =>
              change((d) =>
                d.variants
                  .find((v) => v.id === d.activeVariantId)!
                  .items.forEach((item) => {
                    if (group.some((g) => g.id === item.id)) fn(item.shopping);
                  }),
              );
          return (
            <fieldset disabled={readOnly} className="shopping-item" key={i.id}>
              <div>
                <h3>
                  {i.name} <span className="count">×{group.length}</span>
                </h3>
                <small>
                  {i.width / 10} × {i.depth / 10} × {i.height / 10} см
                </small>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={i.shopping.owned}
                    onChange={(e) =>
                      patch((s) => {
                        s.owned = e.target.checked;
                      })
                    }
                  />{" "}
                  Уже есть
                </label>
              </div>
              <Field label="Цена за штуку">
                <input
                  type="number"
                  min="0"
                  max="10000000000"
                  value={i.shopping.price}
                  onChange={(e) =>
                    patch((s) => {
                      s.price = Math.max(0, Number(e.target.value));
                    })
                  }
                />
              </Field>
              <Field label="Магазин">
                <input
                  value={i.shopping.store}
                  maxLength={200}
                  onChange={(e) =>
                    patch((s) => {
                      s.store = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="Ссылка">
                <input
                  type="url"
                  value={i.shopping.url}
                  maxLength={2000}
                  placeholder="https://…"
                  onChange={(e) =>
                    patch((s) => {
                      s.url = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="Заметка / размеры замены">
                <input
                  value={i.shopping.note}
                  maxLength={2000}
                  placeholder="Например: ширина 160–180 см"
                  onChange={(e) =>
                    patch((s) => {
                      s.note = e.target.value;
                    })
                  }
                />
              </Field>
            </fieldset>
          );
        })}
      </div>
      <p className="micro-note">
        Все цены в одной выбранной тобой валюте. Стоимость доставки и работ не
        учитывается.
      </p>
    </Modal>
  );
}
export function VersionsDialog({
  projectId,
  change,
  close,
}: {
  projectId: string;
  change: Change;
  close: () => void;
}) {
  const [versions, setVersions] = useState<
      { id: string; version: number; createdAt: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    request<typeof versions>(`/projects/${projectId}/versions`)
      .then(setVersions)
      .catch((e) => setError(e.message));
  }, [projectId]);
  return (
    <Modal title="История сохранений" close={close}>
      <p className="muted">
        Последние 30 версий. Восстановление создаёт новое сохранение и доступно
        для отмены.
      </p>
      <ErrorBox error={error} />
      <div className="share-list">
        {versions.map((v) => (
          <div key={v.id}>
            <span>
              Версия {v.version}
              <small>{new Date(v.createdAt).toLocaleString("ru-RU")}</small>
            </span>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    "Восстановить эту версию? Текущие изменения можно отменить через Undo.",
                  )
                )
                  return;
                try {
                  const r = await request<{ document: ProjectDocument }>(
                    `/projects/${projectId}/versions/${v.id}`,
                  );
                  change((d) => Object.assign(d, r.document));
                  close();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Восстановить
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
export function CustomFurnitureDialog({
  units,
  close,
  save,
}: {
  units: ProjectDocument["units"];
  close: () => void;
  save: (item: CatalogItem) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [shape, setShape] = useState("rectangle");
  return (
    <Modal title="Своя мебель" close={close}>
      <p className="muted">
        Сохраняется в твоём личном каталоге. Размеры в {units}.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const contour =
              shape === "custom"
                ? (JSON.parse(String(f.get("contour"))) as Point[])
                : shape === "l"
                  ? [
                      { x: 0, y: 0 },
                      { x: 1, y: 0 },
                      { x: 1, y: 0.4 },
                      { x: 0.4, y: 0.4 },
                      { x: 0.4, y: 1 },
                      { x: 0, y: 1 },
                    ]
                  : undefined;
            if (
              contour &&
              (contour.length < 3 ||
                contour.length > 200 ||
                contour.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) ||
                selfIntersects(
                  contour.map((p) => ({ x: p.x * 1000, y: p.y * 1000 })),
                ))
            )
              throw Error(
                "Контур должен быть простым многоугольником. Координаты от 0 до 1.",
              );
            await save({
              id: uid(),
              name: String(f.get("name")),
              type: "custom",
              category: "Моя мебель",
              width: fromDisplay(String(f.get("width")), units),
              depth: fromDisplay(String(f.get("depth")), units),
              height: fromDisplay(String(f.get("height")), units),
              color: String(f.get("color")),
              clearance: 0,
              tags: ["Личная мебель"],
              ...(contour ? { contour } : {}),
            });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Название">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Диван из магазина"
          />
        </Field>
        <div className="two-columns">
          <Field label={`Ширина, ${units}`}>
            <input
              name="width"
              type="number"
              step="any"
              min={units === "cm" ? 1 : 0.01}
              max={units === "m" ? 20 : units === "ft" ? 65 : 2000}
              defaultValue={units === "cm" ? 235 : units === "m" ? 2.35 : 7.71}
              required
            />
          </Field>
          <Field label={`Глубина, ${units}`}>
            <input
              name="depth"
              type="number"
              step="any"
              min={0.01}
              max={units === "m" ? 20 : units === "ft" ? 65 : 2000}
              defaultValue={units === "cm" ? 95 : units === "m" ? 0.95 : 3.12}
              required
            />
          </Field>
          <Field label={`Высота, ${units}`}>
            <input
              name="height"
              type="number"
              step="any"
              min={0}
              max={units === "m" ? 20 : units === "ft" ? 65 : 2000}
              defaultValue={units === "cm" ? 85 : units === "m" ? 0.85 : 2.79}
              required
            />
          </Field>
          <Field label="Цвет">
            <input name="color" type="color" defaultValue="#98ad9d" />
          </Field>
        </div>
        <Field label="Форма">
          <select value={shape} onChange={(e) => setShape(e.target.value)}>
            <option value="rectangle">Прямоугольник</option>
            <option value="l">Угловая</option>
            <option value="custom">Свой многоугольник</option>
          </select>
        </Field>
        {shape === "custom" && (
          <Field label="Контур JSON, координаты от 0 до 1">
            <textarea
              name="contour"
              rows={4}
              defaultValue={
                '[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1},{"x":0,"y":1}]'
              }
            />
          </Field>
        )}
        <ErrorBox error={error} />
        <button disabled={busy} className="primary full">
          <Plus size={17} />
          {busy ? "Сохраняем…" : "Сохранить и добавить"}
        </button>
      </form>
    </Modal>
  );
}

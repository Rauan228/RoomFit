import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCw,
  Trash2,
  RefreshCw,
  Clock3,
  WandSparkles,
  X,
  Crop,
} from "lucide-react";
import { type CatalogItem, type PhotoAsset } from "@roomfit/core";
import { Modal, Field, ErrorBox } from "../components";
import { request, uploadPhoto } from "../api";
import "./photo.css";
import PhotoModelPreview from "./PhotoModelPreview";
type View = "front" | "back" | "left" | "right";
type Spec = {
  name: string;
  category: string;
  description: string;
  width: number;
  depth: number;
  height: number;
  yaw: number;
  dimensionsSource: "estimated" | "measured";
};
type Job = {
  id: string;
  status: string;
  spec: Spec;
  images: { view: View; url: string }[];
  progress?: number;
  phase: string;
  error?: string;
  createdAt: string;
  version: number;
  furnitureId?: string;
  creditsConsumed?: number;
  result?: {
    asset: PhotoAsset;
    reviewed: boolean;
    report: {
      proportions_changed: boolean;
      scale_factors: number[];
      silhouette_iou: number;
    };
  };
};
type Photo = { file?: File; url: string; crop: number[] };
type Options = {
  available: boolean;
  reason?: string;
  estimatedCredits: number;
  maxUploadBytes: number;
  categories: Record<string, string>;
};
const views: View[] = ["front", "back", "left", "right"];
const viewNames = {
  front: "Спереди или под углом",
  back: "Сзади",
  left: "Слева",
  right: "Справа",
};
const active = new Set([
  "queued",
  "uploading",
  "generating",
  "downloading",
  "processing",
  "validating",
]);
const presets: { label: string; spec: Spec }[] = [
  {
    label: "Кухонный стул",
    spec: {
      name: "Кухонный стул",
      category: "chair",
      description: "",
      width: 550,
      depth: 600,
      height: 950,
      yaw: 0,
      dimensionsSource: "estimated",
    },
  },
  {
    label: "Шкаф",
    spec: {
      name: "Шкаф в спальне",
      category: "wardrobe",
      description: "",
      width: 2400,
      depth: 600,
      height: 2300,
      yaw: 0,
      dimensionsSource: "estimated",
    },
  },
  {
    label: "Тумба с зеркалом",
    spec: {
      name: "Тумба с зеркалом",
      category: "dresser",
      description: "",
      width: 1200,
      depth: 450,
      height: 1600,
      yaw: 0,
      dimensionsSource: "estimated",
    },
  },
  {
    label: "Обеденный стол",
    spec: {
      name: "Мраморный обеденный стол",
      category: "table",
      description: "",
      width: 1600,
      depth: 900,
      height: 750,
      yaw: 0,
      dimensionsSource: "estimated",
    },
  },
];
const dimensions = (s: Spec) =>
  `${s.width / 10} × ${s.depth / 10} × ${s.height / 10} см`;
const statusName: Record<string, string> = {
  draft: "Черновик",
  queued: "В очереди",
  uploading: "Загружаем фото",
  generating: "Создаём 3D",
  downloading: "Сохраняем модель",
  processing: "Готовим мебель",
  validating: "Проверяем размеры",
  ready_for_review: "Нужно проверить",
  completed: "Готово",
  failed: "Нужна помощь",
  cancelled: "Остановлено",
};
function ModelPreview({ job }: { job: Job }) {
  const [interactive, setInteractive] = useState(false);
  return (
    <div className="photo-model-preview">
      {interactive ? (
        <PhotoModelPreview
          url={`/api/photo-furniture/assets/${job.id}/${job.version}/3d/model.glb`}
        />
      ) : (
        <button className="photo-open-3d" onClick={() => setInteractive(true)}>
          <img
            src={`/api/photo-furniture/assets/${job.id}/${job.version}/previews/isometric.webp`}
            alt="Предпросмотр своей 3D-мебели"
          />
          <span>Вращать модель в 3D</span>
        </button>
      )}
    </div>
  );
}

function PhotoCard({
  view,
  photo,
  set,
  error,
}: {
  view: View;
  photo?: Photo;
  set: (photo?: Photo) => void;
  error: (s: string) => void;
}) {
  const [cropping, setCropping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function select(file?: File) {
    if (!file) return;
    if (!/^(image\/(jpeg|png|webp))$/.test(file.type) || file.size > 8_000_000)
      return error("Выбери JPG, PNG или WebP до 8 МБ");
    if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    set({ file, url: URL.createObjectURL(file), crop: [0, 0, 1, 1] });
  }
  return (
    <div className={`photo-upload ${photo ? "has-photo" : ""}`}>
      <div className="photo-upload-title">
        <strong>{viewNames[view]}</strong>
        <span>{view === "front" ? "Обязательно" : "Необязательно"}</span>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Фото: ${viewNames[view]}`}
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {photo ? (
        <>
          <div className="photo-crop-image">
            <img src={photo.url} alt={`Мебель: ${viewNames[view]}`} />
            {cropping && (
              <span
                className="photo-crop-border"
                style={{
                  left: `${photo.crop[0] * 100}%`,
                  top: `${photo.crop[1] * 100}%`,
                  width: `${photo.crop[2] * 100}%`,
                  height: `${photo.crop[3] * 100}%`,
                }}
              />
            )}
          </div>
          <div className="photo-upload-actions">
            <button onClick={() => input.current?.click()}>Заменить</button>
            {photo.file && (
              <button
                aria-label={`Обрезать фото: ${viewNames[view]}`}
                onClick={() => setCropping(!cropping)}
              >
                <Crop size={15} /> Обрезать
              </button>
            )}
            <button
              className="icon"
              aria-label={`Удалить фото: ${viewNames[view]}`}
              onClick={() => {
                if (photo.url.startsWith("blob:"))
                  URL.revokeObjectURL(photo.url);
                set();
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {cropping && (
            <div className="photo-crop-fields">
              <p>
                Оставь предмет целиком, включая ножки. Значения в процентах.
              </p>
              {["Слева", "Сверху", "Ширина", "Высота"].map((label, i) => (
                <Field key={label} label={label}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(photo.crop[i] * 100)}
                    onChange={(e) => {
                      const crop = [...photo.crop];
                      crop[i] = Math.max(
                        0,
                        Math.min(1, Number(e.target.value) / 100),
                      );
                      set({ ...photo, crop });
                    }}
                  />
                </Field>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <button
            className="photo-dropzone"
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={28} />
            <span>Выбрать фото</span>
            <small>JPG, PNG, WebP · до 8 МБ</small>
          </button>
          {view === "front" && (
            <label className="photo-camera">
              <Camera size={16} /> Снять на камеру
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => select(e.target.files?.[0])}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}

export default function PhotoFurnitureDialog({
  close,
  onSaved,
}: {
  close: () => void;
  onSaved: (item: CatalogItem, add: boolean) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState<Job>(),
    [options, setOptions] = useState<Options>();
  const [screen, setScreen] = useState<"list" | "wizard" | "job">("list"),
    [step, setStep] = useState(0);
  const [spec, setSpec] = useState<Spec>({ ...presets[0].spec }),
    [photos, setPhotos] = useState<Partial<Record<View, Photo>>>({});
  const [unit, setUnit] = useState("cm"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID()),
    photoRef = useRef(photos),
    form = useRef<HTMLFormElement>(null);
  photoRef.current = photos;
  const refresh = async () =>
    setJobs(await request<Job[]>("/photo-furniture/jobs"));
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    void request<Options>("/photo-furniture/options")
      .then(setOptions)
      .catch((e) => setError(e.message));
    return () => {
      for (const photo of Object.values(photoRef.current))
        if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    };
  }, []);
  useEffect(() => {
    if (!selected || !active.has(selected.status)) return;
    let alive = true;
    const timer = setInterval(() => {
      void request<Job>(`/photo-furniture/jobs/${selected.id}`)
        .then((job) => {
          if (alive) {
            setSelected(job);
            if (!active.has(job.status)) {
              setSpec(job.spec);
              void refresh();
            }
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected?.id, selected ? active.has(selected.status) : false]);
  function open(job: Job) {
    for (const photo of Object.values(photoRef.current))
      if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    setError("");
    setSelected(job);
    setSpec(job.spec);
    setConsent(false);
    setPhotos(
      Object.fromEntries(
        job.images.map((image) => [
          image.view,
          { url: image.url, crop: [0, 0, 1, 1] },
        ]),
      ),
    );
    setScreen(job.status === "draft" ? "wizard" : "job");
    setStep(0);
  }
  function createNew() {
    for (const photo of Object.values(photoRef.current))
      if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    setSelected(undefined);
    setSpec({ ...presets[0].spec });
    setPhotos({});
    setConsent(false);
    setError("");
    key.current = crypto.randomUUID();
    setStep(0);
    setScreen("wizard");
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  function next() {
    setError("");
    if (step === 0 && !photos.front)
      return setError("Добавь основное фото предмета спереди или под углом");
    if (!form.current?.reportValidity()) return;
    setStep(Math.min(3, step + 1));
  }
  async function persist(start: boolean) {
    let job = selected;
    if (!job)
      job = await request<Job>("/photo-furniture/jobs", "POST", {
        ...spec,
        idempotencyKey: key.current,
      });
    setSelected(job);
    job = await request<Job>(`/photo-furniture/jobs/${job.id}`, "PUT", spec);
    for (const view of views) {
      const photo = photos[view];
      if (photo?.file) {
        const [x, y, w, h] = photo.crop;
        if (w <= 0 || h <= 0 || x + w > 1 || y + h > 1)
          throw new Error(
            "Проверь границы обрезки: они должны оставаться внутри фото",
          );
        job = await uploadPhoto<Job>(
          `/photo-furniture/jobs/${job.id}/images/${view}?crop=${photo.crop.join(",")}`,
          photo.file,
        );
      } else if (!photo && job.images.some((i) => i.view === view))
        job = await request<Job>(
          `/photo-furniture/jobs/${job.id}/images/${view}`,
          "DELETE",
        );
    }
    if (start)
      job = await request<Job>(
        `/photo-furniture/jobs/${job.id}/start`,
        "POST",
        { confirmCredits: consent },
      );
    setSelected(job);
    setScreen("job");
    await refresh();
  }
  const dimensionFields = (
    <>
      <div className="photo-dimension-heading">
        <span>Ширина × глубина × полная высота</span>
        <select
          aria-label="Единицы размеров мебели"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="cm">см</option>
          <option value="mm">мм</option>
        </select>
      </div>
      <div className="photo-dimension-fields">
        {(
          [
            ["width", "Ширина"],
            ["depth", "Глубина"],
            ["height", "Полная высота"],
          ] as const
        ).map(([field, label]) => (
          <Field key={field} label={label}>
            <input
              required
              aria-label={`${label} своей мебели`}
              type="number"
              min={unit === "cm" ? 1 : 10}
              max={unit === "cm" ? 2000 : 20000}
              step={unit === "cm" ? 0.1 : 1}
              value={spec[field] / (unit === "cm" ? 10 : 1)}
              onChange={(e) =>
                setSpec({
                  ...spec,
                  [field]: Number(e.target.value) * (unit === "cm" ? 10 : 1),
                })
              }
            />
          </Field>
        ))}
      </div>
      <label className="photo-check">
        <input
          type="checkbox"
          checked={spec.dimensionsSource === "measured"}
          onChange={(e) =>
            setSpec({
              ...spec,
              dimensionsSource: e.target.checked ? "measured" : "estimated",
            })
          }
        />{" "}
        Я измерил предмет рулеткой
      </label>
      <p className="photo-note">
        {spec.dimensionsSource === "estimated"
          ? "Сейчас размеры примерные. Для проверки, поместится ли мебель, замени их реальными замерами."
          : "Размеры включают все выступающие части: спинку, подлокотники, раму и зеркало."}
      </p>
    </>
  );
  return (
    <Modal wide title="Моя мебель · 3D по фото" close={close}>
      <div className="photo-furniture">
        <ErrorBox error={error} />
        {screen === "list" && (
          <>
            <div className="photo-intro">
              <div className="photo-intro-icon">
                <Camera size={28} />
              </div>
              <div>
                <h3>Твоя мебель в твоём плане</h3>
                <p>
                  Загрузи фотографии, укажи размеры и добавь предмет в комнату.
                </p>
              </div>
              <button className="primary" onClick={createNew}>
                <Plus size={17} /> Создать мебель по фото
              </button>
            </div>
            {!options?.available && options?.reason && (
              <p className="notice" role="status">
                {options.reason}
              </p>
            )}
            {jobs.length ? (
              <div className="photo-jobs">
                {jobs.map((job) => (
                  <article className="photo-job-card" key={job.id}>
                    <button
                      className="photo-job-open"
                      onClick={() => open(job)}
                    >
                      <img
                        loading="lazy"
                        src={
                          job.result
                            ? `/api/photo-furniture/assets/${job.id}/${job.version}/previews/isometric.webp`
                            : job.images[0]?.url
                        }
                        alt={job.spec.name}
                      />
                      <span className={`photo-status status-${job.status}`}>
                        {statusName[job.status] || job.status}
                      </span>
                      <strong>{job.spec.name}</strong>
                      <small>{dimensions(job.spec)}</small>
                      <time>
                        {new Date(job.createdAt).toLocaleDateString("ru-RU")}
                      </time>
                    </button>
                    <div className="photo-card-actions">
                      <button onClick={() => open(job)}>
                        {job.status === "completed"
                          ? "Открыть / изменить"
                          : "Продолжить"}
                      </button>
                      {job.status === "completed" && (
                        <button
                          onClick={() =>
                            void action(async () => {
                              const saved = await request<{
                                furniture: CatalogItem;
                              }>(
                                `/photo-furniture/jobs/${job.id}/confirm`,
                                "POST",
                                job.spec,
                              );
                              onSaved(saved.furniture, true);
                            })
                          }
                        >
                          В комнату <Plus size={14} />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="photo-empty">
                <WandSparkles size={32} />
                <h3>Здесь появятся твои предметы</h3>
                <p>
                  Начни со стула: добавь фото спереди и сзади для лучшего
                  результата.
                </p>
              </div>
            )}
          </>
        )}
        {screen === "wizard" && (
          <>
            <button className="photo-back" onClick={() => setScreen("list")}>
              <ArrowLeft size={15} /> Моя мебель
            </button>
            <ol className="photo-steps" aria-label="Шаги создания">
              {["Фотографии", "Описание", "Размеры", "Создание"].map(
                (label, i) => (
                  <li
                    key={label}
                    aria-current={step === i ? "step" : undefined}
                    className={step === i ? "current" : step > i ? "done" : ""}
                  >
                    <span>{step > i ? <Check size={14} /> : i + 1}</span>
                    {label}
                  </li>
                ),
              )}
            </ol>
            <form ref={form} onSubmit={(e) => e.preventDefault()}>
              {step === 0 && (
                <>
                  <h3>Загрузи фото своей мебели</h3>
                  <p className="photo-lead">
                    Сфотографируй предмет целиком под углом, чтобы были видны
                    передняя и боковая стороны. Дополнительные ракурсы помогут
                    восстановить форму.
                  </p>
                  <div className="photo-uploads">
                    {views.map((view) => (
                      <PhotoCard
                        key={view}
                        view={view}
                        photo={photos[view]}
                        set={(photo) =>
                          setPhotos((p) => ({ ...p, [view]: photo }))
                        }
                        error={setError}
                      />
                    ))}
                  </div>
                  <p className="photo-note">
                    На всех фото должен быть один и тот же предмет. Убери вещи
                    со столешницы; для шкафа и зеркала учитывай, что отражения
                    могут попасть в текстуру. Фотографии останутся приватными и
                    будут переданы Tripo после подтверждения.
                  </p>
                </>
              )}
              {step === 1 && (
                <>
                  <h3>Как назовём предмет?</h3>
                  <div className="photo-presets">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setSpec({ ...p.spec })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <Field label="Название">
                    <input
                      required
                      maxLength={120}
                      value={spec.name}
                      onChange={(e) =>
                        setSpec({ ...spec, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Категория">
                    <select
                      value={spec.category}
                      onChange={(e) =>
                        setSpec({ ...spec, category: e.target.value })
                      }
                    >
                      {Object.entries(
                        options?.categories || {
                          chair: "Стулья",
                          wardrobe: "Шкафы",
                          dresser: "Комоды",
                          table: "Столы",
                        },
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Описание · необязательно">
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={spec.description}
                      placeholder="Например: синий мягкий стул с тёмными ножками"
                      onChange={(e) =>
                        setSpec({ ...spec, description: e.target.value })
                      }
                    />
                  </Field>
                  <p className="photo-note">
                    Описание поможет найти предмет в каталоге. Форма создаётся
                    по фотографиям.
                  </p>
                </>
              )}
              {step === 2 && (
                <>
                  <h3>Укажи размеры предмета</h3>
                  <svg
                    className="photo-dimension-diagram"
                    viewBox="0 0 400 180"
                    role="img"
                    aria-label="Ширина проходит поперёк фасада, глубина — от передней части к задней, высота — от пола до самой высокой точки"
                  >
                    <path
                      d="M110 65 230 35 300 70 180 105Z M110 65v55l70 35 120-30V70 M180 105v50"
                      fill="#e8e4d8"
                      stroke="#7e8d71"
                      strokeWidth="2"
                    />
                    <path
                      d="M95 125 167 161 M190 164 312 134 M322 70v57"
                      fill="none"
                      stroke="#b98e55"
                      strokeWidth="2"
                    />
                    <text x="69" y="160">
                      Ширина
                    </text>
                    <text x="220" y="174">
                      Глубина
                    </text>
                    <text x="330" y="102">
                      Высота
                    </text>
                  </svg>
                  {dimensionFields}
                </>
              )}
              {step === 3 && (
                <>
                  <h3>Всё готово к созданию</h3>
                  <div className="photo-confirm">
                    <img src={photos.front?.url} alt={spec.name} />
                    <div>
                      <h3>{spec.name}</h3>
                      <p>{dimensions(spec)}</p>
                      <p>
                        {views.filter((v) => photos[v]).length > 1
                          ? "Несколько ракурсов одного предмета"
                          : "Одно фото"}
                      </p>
                      <strong>
                        Ориентировочно {options?.estimatedCredits ?? 40}{" "}
                        кредитов
                      </strong>
                    </div>
                  </div>
                  <p className="photo-note">
                    Невидимые стороны будут восстановлены приблизительно.{" "}
                    {spec.dimensionsSource === "estimated" &&
                      "Размеры сейчас примерные. "}
                    После генерации можно проверить вид сверху и 3D,
                    скорректировать поворот и размеры.
                  </p>
                  <label className="photo-check">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    Передать эти фото Tripo и использовать примерно{" "}
                    {options?.estimatedCredits ?? 40} кредитов на одну генерацию
                  </label>
                  {!options?.available && (
                    <p className="notice">
                      {options?.reason || "Проверяем доступность генерации…"}
                    </p>
                  )}
                </>
              )}
            </form>
            <div className="photo-footer">
              <button
                disabled={busy}
                onClick={() => (step ? setStep(step - 1) : setScreen("list"))}
              >
                <ArrowLeft size={16} /> Назад
              </button>
              <span>Шаг {step + 1} из 4</span>
              {step < 3 ? (
                <button className="primary" onClick={next}>
                  Продолжить <ArrowRight size={16} />
                </button>
              ) : (
                <div className="photo-footer-actions">
                  <button
                    disabled={busy}
                    onClick={() => void action(() => persist(false))}
                  >
                    Сохранить черновик
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !consent || !options?.available}
                    onClick={() => void action(() => persist(true))}
                  >
                    {busy ? "Отправляем…" : "Создать 3D-модель"}
                    <WandSparkles size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {screen === "job" && selected && (
          <>
            <button
              className="photo-back"
              onClick={() => {
                setScreen("list");
                void refresh();
              }}
            >
              <ArrowLeft size={15} /> Моя мебель
            </button>
            {selected.status === "draft" && (
              <div className="photo-processing" role="status">
                <Check size={28} />
                <h3>Черновик сохранён</h3>
                <p>Фото и размеры сохранены. Генерация ещё не запускалась.</p>
                <button className="primary" onClick={() => open(selected)}>
                  Продолжить создание
                </button>
              </div>
            )}
            {active.has(selected.status) && (
              <div className="photo-processing" role="status">
                <div className="photo-processing-orbit">
                  <WandSparkles size={32} />
                </div>
                <span className="photo-eyebrow">{selected.spec.name}</span>
                <h3>{selected.phase || statusName[selected.status]}</h3>
                {selected.status === "generating" &&
                typeof selected.progress === "number" ? (
                  <>
                    <progress max={100} value={selected.progress} />
                    <span>{selected.progress}% · данные Tripo</span>
                  </>
                ) : (
                  <div className="photo-stage-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <p>
                  Можно закрыть окно: обработка продолжится, а результат
                  появится в «Моей мебели».
                </p>
                {selected.error && (
                  <p className="photo-note">{selected.error}</p>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      setSelected(
                        await request<Job>(
                          `/photo-furniture/jobs/${selected.id}/cancel`,
                          "POST",
                          {},
                        ),
                      ),
                    )
                  }
                >
                  Остановить обработку
                </button>
              </div>
            )}
            {(selected.status === "ready_for_review" ||
              selected.status === "completed") &&
              selected.result && (
                <>
                  <div className="photo-result-heading">
                    <div>
                      <span className="photo-eyebrow">
                        {selected.status === "completed"
                          ? "В твоём каталоге"
                          : "Модель готова"}
                      </span>
                      <h3>{selected.spec.name}</h3>
                      <p>{dimensions(selected.spec)}</p>
                    </div>
                    <span className="photo-status status-completed">
                      <Check size={14} /> Проверь со всех сторон
                    </span>
                  </div>
                  <div className="photo-result-grid">
                    <section>
                      <h4>Вид сверху</h4>
                      <div className="photo-top">
                        <img
                          src={`/api/photo-furniture/assets/${selected.id}/${selected.version}/2d/original/top_view_512.webp`}
                          alt="Вид своей мебели сверху"
                        />
                      </div>
                    </section>
                    <section>
                      <h4>3D · вращай мышью или пальцем</h4>
                      <ModelPreview job={selected} />
                    </section>
                  </div>
                  <p className="photo-note">
                    Габариты модели приведены к указанным размерам. Форма
                    восстановлена AI и может отличаться от настоящей мебели.
                    {selected.result.report.proportions_changed &&
                      " Для совпадения габаритов пропорции были заметно изменены: проверь ширину, глубину и поворот."}
                  </p>
                  {typeof selected.creditsConsumed === "number" && (
                    <p className="photo-note">
                      Генерация: {selected.creditsConsumed} кредитов Tripo.
                      Повторная обработка размеров и поворота не расходует
                      кредиты.
                    </p>
                  )}
                  <details className="photo-adjust">
                    <summary>Название, размеры и направление</summary>
                    <Field label="Название предмета">
                      <input
                        value={spec.name}
                        maxLength={120}
                        onChange={(e) =>
                          setSpec({ ...spec, name: e.target.value })
                        }
                      />
                    </Field>
                    {dimensionFields}
                    <div className="photo-orientation">
                      <button
                        disabled={busy}
                        onClick={() =>
                          setSpec({ ...spec, yaw: (spec.yaw - 90) % 360 })
                        }
                      >
                        <RotateCw size={15} /> Влево на 90°
                      </button>
                      <span>{spec.yaw}°</span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          setSpec({ ...spec, yaw: (spec.yaw + 90) % 360 })
                        }
                      >
                        <RotateCw size={15} /> Вправо на 90°
                      </button>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () =>
                          setSelected(
                            await request<Job>(
                              `/photo-furniture/jobs/${selected.id}/reprocess`,
                              "POST",
                              spec,
                            ),
                          ),
                        )
                      }
                    >
                      Применить поворот и размеры · без новых кредитов
                    </button>
                  </details>
                  <div className="photo-footer">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () =>
                          open(
                            await request<Job>(
                              `/photo-furniture/jobs/${selected.id}/copy`,
                              "POST",
                              {},
                            ),
                          ),
                        )
                      }
                    >
                      <RefreshCw size={15} /> Сгенерировать заново
                    </button>
                    <div className="photo-footer-actions">
                      {[false, true].map((add) => (
                        <button
                          key={String(add)}
                          className={add ? "primary" : ""}
                          disabled={
                            busy ||
                            ["width", "depth", "height", "yaw"].some(
                              (k) =>
                                spec[k as keyof Spec] !==
                                selected.spec[k as keyof Spec],
                            )
                          }
                          onClick={() =>
                            void action(async () => {
                              const saved = await request<{
                                job: Job;
                                furniture: CatalogItem;
                              }>(
                                `/photo-furniture/jobs/${selected.id}/confirm`,
                                "POST",
                                spec,
                              );
                              setSelected(saved.job);
                              onSaved(saved.furniture, add);
                              await refresh();
                            })
                          }
                        >
                          {add ? (
                            <>
                              <Plus size={16} /> Добавить в текущую комнату
                            </>
                          ) : (
                            <>
                              <Check size={16} /> Сохранить в мою мебель
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            {(selected.status === "failed" ||
              selected.status === "cancelled") && (
              <div className="photo-failed">
                <h3>{statusName[selected.status]}</h3>
                <p role="alert">
                  {selected.error || "Не удалось завершить обработку"}
                </p>
                <p>Новая платная генерация не запускалась автоматически.</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      setSelected(
                        await request<Job>(
                          `/photo-furniture/jobs/${selected.id}/reprocess`,
                          "POST",
                          spec,
                        ),
                      ),
                    )
                  }
                >
                  Повторить подготовку сохранённой 3D
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      open(
                        await request<Job>(
                          `/photo-furniture/jobs/${selected.id}/copy`,
                          "POST",
                          {},
                        ),
                      ),
                    )
                  }
                >
                  Подготовить новую генерацию
                </button>
              </div>
            )}
            {!active.has(selected.status) && (
              <div className="photo-delete">
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await request(
                        `/photo-furniture/jobs/${selected.id}`,
                        "DELETE",
                      );
                      setSelected(undefined);
                      setScreen("list");
                      await refresh();
                    })
                  }
                >
                  <Trash2 size={15} /> Убрать из моей мебели
                </button>
                <small>
                  Существующие копии в сохранённых комнатах останутся доступны.
                </small>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

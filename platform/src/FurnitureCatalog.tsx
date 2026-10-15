import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Box, Download } from "lucide-react";
import { ASSET_MANIFEST, type AssetMetadata } from "@roomfit/core";
import { Logo } from "./components";
import "./furniture-catalog.css";

const AssetViewer = lazy(() => import("./three/AssetViewer"));

type Extra = AssetMetadata & {
  dimension_notes?: string;
  sleeping_area_mm?: { width_mm: number; length_mm: number };
  mattress_top_mm?: number;
  seat_height_mm?: number;
  primary_material?: string;
  author?: string;
  provenance?: {
    geometry?: string;
    textures?: string;
    visual_references?: { files: string[]; use: string };
  };
};
interface Report {
  status: string;
  dimension_error_mm: number;
  pivot_error_mm: number;
  variants: { id: string; silhouette_iou: number }[];
  checks: Record<string, boolean>;
}

const assets = Object.values(ASSET_MANIFEST) as Extra[];
const url = (asset: AssetMetadata, path: string) => asset.base_url + path;
const mm = (asset: AssetMetadata) => {
  const d = asset.dimensions;
  return `${d.width_mm} × ${d.depth_mm} × ${d.height_mm} мм`;
};
const kb = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} МБ`
    : `${Math.round(bytes / 1024)} КБ`;

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="fc-header">
      <Link to="/" aria-label="RoomFit">
        <Logo />
      </Link>
      <span className="fc-header-title">Библиотека мебели</span>
      <span className="fc-header-spacer" />
      {children}
    </header>
  );
}

export function FurnitureCatalog() {
  const categories = useMemo(
    () => [...new Set(assets.map((a) => a.catalog_category))],
    [],
  );
  const [category, setCategory] = useState<string>();
  const visible = assets.filter(
    (a) => !category || a.catalog_category === category,
  );
  useEffect(() => {
    document.title = "Библиотека мебели · RoomFit";
  }, []);
  return (
    <div className="fc-page">
      <Header />
      <main className="fc-main">
        <div className="fc-intro">
          <h1>Библиотека мебели</h1>
          <p>
            {assets.length} моделей. Одна геометрия для 3D и для плана: открой
            предмет, чтобы покрутить его, сменить материал и посмотреть виды.
          </p>
        </div>
        <div className="fc-chips" role="group" aria-label="Категория">
          <button
            aria-pressed={!category}
            onClick={() => setCategory(undefined)}
          >
            Все · {assets.length}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <ul className="fc-grid">
          {visible.map((a) => (
            <li key={a.asset_id}>
              <Link className="fc-card" to={`/furniture/${a.asset_id}`}>
                <div className="fc-card-image">
                  <img
                    src={url(a, "previews/isometric.webp")}
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="fc-card-body">
                  <strong>{a.name}</strong>
                  <span>{mm(a)}</span>
                  <span className="fc-card-meta">
                    {a.triangles.toLocaleString("ru")} треуг. ·{" "}
                    {kb(a.glb_bytes)}
                  </span>
                  <span className="fc-swatches" aria-hidden>
                    {a.material_variants.map((v) => (
                      <i key={v.id} style={{ background: v.color }} />
                    ))}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

export function FurnitureDetail() {
  const { id } = useParams();
  const index = assets.findIndex((a) => a.asset_id === id);
  const asset = assets[index];
  const [variant, setVariant] = useState("original");
  const [report, setReport] = useState<Report>();
  const [status, setStatus] = useState({ loaded: 0, failed: 0 });
  useEffect(() => {
    if (!asset) return;
    document.title = `${asset.name} · Библиотека мебели · RoomFit`;
    setVariant("original");
    setReport(undefined);
    let current = true;
    fetch(url(asset, "validation.json"))
      .then((r) => r.json())
      .then((value) => current && setReport(value))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [asset]);
  if (!asset) return <Navigate to="/furniture" replace />;
  const prev = assets[(index - 1 + assets.length) % assets.length],
    next = assets[(index + 1) % assets.length];
  const iou =
    report && Math.min(...report.variants.map((v) => v.silhouette_iou));
  const finish = asset.material_variants.find((v) => v.id === variant)!;
  const refs = asset.provenance?.visual_references;
  return (
    <div className="fc-page">
      <Header>
        <Link className="button" to="/furniture">
          <ArrowLeft size={16} /> Все модели
        </Link>
      </Header>
      <main className="fc-main fc-detail">
        <nav className="fc-crumbs" aria-label="Соседние модели">
          <Link to={`/furniture/${prev.asset_id}`}>
            <ArrowLeft size={14} /> {prev.name}
          </Link>
          <span>
            {index + 1} / {assets.length}
          </span>
          <Link to={`/furniture/${next.asset_id}`}>
            {next.name} <ArrowRight size={14} />
          </Link>
        </nav>
        <div className="fc-hero">
          <section className="fc-viewer" aria-label={`3D: ${asset.name}`}>
            <div
              className="fc-canvas"
              data-assets-loaded={status.loaded}
              data-assets-failed={status.failed}
            >
              <Suspense
                fallback={<div className="fc-canvas-wait">Загрузка 3D…</div>}
              >
                <AssetViewer
                  asset={asset}
                  variant={variant}
                  onAssets={(loaded, _loading, failed) =>
                    setStatus({ loaded, failed })
                  }
                />
              </Suspense>
              {status.loaded === 0 && status.failed === 0 && (
                <div className="fc-canvas-wait">
                  <Box size={18} /> Загружается модель…
                </div>
              )}
              <p className="fc-hint">
                Вращай мышью или пальцем, колесо — масштаб
              </p>
            </div>
            <div className="fc-variants" role="group" aria-label="Материал">
              {asset.material_variants.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={variant === v.id}
                  onClick={() => setVariant(v.id)}
                >
                  <i style={{ background: v.color }} />
                  {v.name}
                </button>
              ))}
            </div>
          </section>
          <aside className="fc-info">
            <p className="fc-kicker">
              {asset.catalog_category} · {asset.asset_id}
            </p>
            <h1>{asset.name}</h1>
            <dl className="fc-specs">
              <dt>Габариты</dt>
              <dd>{mm(asset)}</dd>
              {asset.sleeping_area_mm && (
                <>
                  <dt>Спальное место</dt>
                  <dd>
                    {asset.sleeping_area_mm.width_mm} ×{" "}
                    {asset.sleeping_area_mm.length_mm} мм
                  </dd>
                </>
              )}
              {asset.mattress_top_mm && (
                <>
                  <dt>Верх матраса</dt>
                  <dd>{asset.mattress_top_mm} мм</dd>
                </>
              )}
              {asset.seat_height_mm && (
                <>
                  <dt>Высота сиденья</dt>
                  <dd>{asset.seat_height_mm} мм</dd>
                </>
              )}
              <dt>Материал</dt>
              <dd>
                {finish.name} · {finish.color} · шероховатость{" "}
                {finish.roughness}
              </dd>
              <dt>Геометрия</dt>
              <dd>{asset.triangles.toLocaleString("ru")} треугольников</dd>
              <dt>GLB</dt>
              <dd>{kb(asset.glb_bytes)}</dd>
              <dt>Версия</dt>
              <dd>{asset.generation_version}</dd>
              <dt>Проверка</dt>
              <dd>
                {report
                  ? `${report.status === "approved" ? "approved" : report.status} · IoU ${iou?.toFixed(4)} · ошибка габаритов ${report.dimension_error_mm} мм`
                  : "…"}
              </dd>
              <dt>Лицензия</dt>
              <dd>
                {asset.license}
                {asset.author ? ` · ${asset.author}` : ""}
              </dd>
            </dl>
            {asset.dimension_notes && (
              <p className="fc-note">{asset.dimension_notes}</p>
            )}
            {refs && (
              <p className="fc-note">
                Референсы формы: {refs.files.join(", ")}. {refs.use}.
              </p>
            )}
            <div className="fc-downloads">
              <a
                className="button"
                href={url(asset, asset.assets.model_3d)}
                download
              >
                <Download size={15} /> GLB
              </a>
              <a
                className="button"
                href={url(asset, "metadata.json")}
                target="_blank"
                rel="noreferrer"
              >
                Метаданные
              </a>
              <a
                className="button"
                href={url(asset, "validation.json")}
                target="_blank"
                rel="noreferrer"
              >
                Отчёт проверки
              </a>
            </div>
          </aside>
        </div>

        <section className="fc-section">
          <h2>Вид сверху для плана</h2>
          <div className="fc-tops">
            {asset.material_variants.map((v) => (
              <figure key={v.id}>
                <div className="fc-transparent">
                  <img
                    src={url(asset, v.top_2d)}
                    alt={`${asset.name}, ${v.name}, вид сверху`}
                    loading="lazy"
                  />
                </div>
                <figcaption>{v.name}</figcaption>
              </figure>
            ))}
            <figure>
              <div className="fc-transparent fc-technical">
                <img
                  src={url(asset, asset.assets.technical_2d)}
                  alt={`${asset.name}, технический контур`}
                  loading="lazy"
                />
              </div>
              <figcaption>Технический</figcaption>
            </figure>
          </div>
        </section>

        <section className="fc-section">
          <h2>Ракурсы</h2>
          <div className="fc-views">
            {[
              ["front", "Спереди"],
              ["side", "Сбоку"],
              ["back", "Сзади"],
              ["isometric", "Изометрия"],
              ["closeup", "Крупный план"],
            ].map(([view, label]) => (
              <figure key={view}>
                <img
                  src={url(asset, `previews/${view}.webp`)}
                  alt={`${asset.name}: ${label}`}
                  loading="lazy"
                />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

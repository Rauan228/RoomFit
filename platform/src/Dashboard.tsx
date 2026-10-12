import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Star,
  Copy,
  Archive,
  Trash2,
  RotateCcw,
  ArrowUpRight,
  FileUp,
} from "lucide-react";
import {
  createDocument,
  createTemplate,
  TEMPLATE_NAMES,
  documentSchema,
  type ProjectDocument,
} from "@roomfit/core";
import { request, type Project } from "./api";
import { Shell, useAuth } from "./App";
import { MiniPlan, roomSummary } from "./Plan";
import { Modal, Field, ErrorBox, Loading } from "./components";
export function Dashboard() {
  const { user } = useAuth(),
    navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [state, setState] = useState("active"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("updated"),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<
    { id: string; name: string; document: ProjectDocument }[]
  >([]);
  useEffect(() => {
    request<typeof templates>("/templates")
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, []);
  const reload = async () => {
    try {
      setProjects(
        await request<Project[]>(
          `/projects?state=${state === "favorites" ? "active" : state}`,
        ),
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    void reload();
  }, [state]);
  const mutate = async (path: string, method: string, data?: unknown) => {
    try {
      const project = projects.find((p) => path === `/projects/${p.id}`);
      await request(
        path,
        method,
        data && typeof data === "object"
          ? { ...data, version: project?.version }
          : data,
      );
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const newProject = async (document: ProjectDocument) => {
    setBusy(true);
    setError("");
    document.units =
      (user?.preferences.units as ProjectDocument["units"]) || "cm";
    document.settings.clearance = Number(user?.preferences.clearance ?? 800);
    try {
      const p = await request<Project>("/projects", "POST", { document });
      navigate(`/project/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const shown = projects
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) &&
        (state !== "favorites" || p.favorite),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <Shell>
      <header className="page-head">
        <div>
          <span className="eyebrow">
            РАДЫ ВИДЕТЬ, {user!.name.toUpperCase()}
          </span>
          <h1>
            Мои проекты<span className="count">{projects.length}</span>
          </h1>
          <p className="muted">Идеи для твоего дома начинаются здесь.</p>
        </div>
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={19} /> Новый проект
        </button>
      </header>
      <ErrorBox error={error} />
      <section className="dashboard-banner">
        <div>
          <span className="tag">ОТ ИДЕИ К ПЛАНУ</span>
          <h2>
            Место для больших идей.
            <br />И точных размеров.
          </h2>
          <p>
            Выбери шаблон, добавь свою мебель
            <br />и узнай, сколько останется пространства.
          </p>
        </div>
        <div className="banner-plan">
          <MiniPlan doc={createTemplate("Спальня")} />
          <span className="plan-label">Твоя будущая спальня</span>
        </div>
      </section>
      <div className="project-controls">
        <div className="tabs">
          {[
            ["active", "Все проекты"],
            ["favorites", "Избранное"],
            ["archive", "Архив"],
            ["trash", "Корзина"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={state === v ? "active" : ""}
              onClick={() => setState(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Поиск проектов"
            placeholder="Найти проект"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Сортировка"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Сначала новые</option>
          <option value="name">По названию</option>
        </select>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="project-grid">
          {state === "active" && (
            <button
              className="new-project-tile"
              onClick={() => setCreate(true)}
            >
              <span>
                <Plus size={28} />
              </span>
              <strong>Создать проект</strong>
              <small>Чистый лист для новой комнаты</small>
            </button>
          )}
          {shown.map((p) => (
            <article className="project-card" key={p.id}>
              <Link
                to={state === "trash" ? "#" : `/project/${p.id}`}
                tabIndex={state === "trash" ? -1 : 0}
              >
                <MiniPlan doc={p.document} />
              </Link>
              <div className="project-info">
                <div>
                  <Link to={`/project/${p.id}`}>
                    <h3>{p.name}</h3>
                  </Link>
                  <p>
                    {roomSummary(p.document.floors[0]).area.toFixed(1)} м² ·{" "}
                    {p.document.variants.length} вар.
                  </p>
                </div>
                <button
                  className={`icon ${p.favorite ? "favorited" : ""}`}
                  aria-label={
                    p.favorite ? "Убрать из избранного" : "В избранное"
                  }
                  disabled={state === "trash"}
                  onClick={() =>
                    void mutate(`/projects/${p.id}`, "PATCH", {
                      favorite: !p.favorite,
                    })
                  }
                >
                  <Star size={18} fill={p.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              <div className="project-footer">
                <small>
                  {new Date(p.updatedAt).toLocaleDateString("ru-RU")}
                </small>
                <div>
                  {state === "trash" ? (
                    <button
                      className="icon"
                      title="Восстановить"
                      onClick={() =>
                        void mutate(`/projects/${p.id}/restore`, "POST", {})
                      }
                    >
                      <RotateCcw size={17} />
                    </button>
                  ) : (
                    <>
                      <button
                        className="icon"
                        title="Переименовать"
                        onClick={() => {
                          const name = prompt("Название проекта", p.name);
                          if (name?.trim())
                            void mutate(`/projects/${p.id}`, "PATCH", { name });
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className="icon"
                        title="Дублировать"
                        onClick={() =>
                          void newProject({
                            ...structuredClone(p.document),
                            name: `${p.name} — копия`,
                          })
                        }
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        className="icon"
                        title={p.archived ? "Вернуть из архива" : "В архив"}
                        onClick={() =>
                          void mutate(`/projects/${p.id}`, "PATCH", {
                            archived: !p.archived,
                          })
                        }
                      >
                        <Archive size={17} />
                      </button>
                      <button
                        className="icon"
                        title="В корзину"
                        onClick={() => {
                          if (
                            confirm(
                              `Переместить «${p.name}» в корзину? Можно восстановить в течение 30 дней.`,
                            )
                          )
                            void mutate(`/projects/${p.id}`, "DELETE");
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !shown.length && state !== "active" && (
        <div className="empty-state">Здесь пока нет проектов.</div>
      )}
      {state === "active" && (
        <section className="templates-section">
          <div className="section-line">
            <div>
              <h2>Начни с готовой комнаты</h2>
              <p className="muted">Любой шаблон можно изменить под себя.</p>
            </div>
            <label className="button">
              <FileUp size={17} /> Импорт JSON
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 8e6) throw Error("Файл больше 8 МБ");
                    const doc = documentSchema.parse(
                      JSON.parse(await f.text()),
                    );
                    await newProject(doc);
                  } catch (err) {
                    setError(
                      `Не удалось импортировать: ${(err as Error).message}`,
                    );
                  }
                }}
              />
            </label>
          </div>
          <div className="template-grid">
            {templates.map((t) => (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => void newProject(structuredClone(t.document))}
              >
                <MiniPlan doc={t.document} />
                <span>
                  {t.name}
                  <ArrowUpRight size={17} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {create && (
        <Modal title="Новая комната" close={() => setCreate(false)}>
          <p className="muted">
            Укажи внутренние размеры помещения. Их можно изменить в редакторе.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void newProject(
                createDocument(
                  String(f.get("name")),
                  Number(f.get("width")) * 10,
                  Number(f.get("depth")) * 10,
                  String(f.get("shape")),
                ),
              );
            }}
          >
            <Field label="Название проекта">
              <input
                name="name"
                placeholder="Например, спальня"
                defaultValue="Моя комната"
                required
                maxLength={120}
              />
            </Field>
            <div className="two-columns">
              <Field label="Ширина, см">
                <input
                  name="width"
                  type="number"
                  defaultValue={400}
                  min={50}
                  max={5000}
                  required
                />
              </Field>
              <Field label="Глубина, см">
                <input
                  name="depth"
                  type="number"
                  defaultValue={320}
                  min={50}
                  max={5000}
                  required
                />
              </Field>
            </div>
            <Field label="Форма">
              <select name="shape">
                <option value="rectangle">Прямоугольная</option>
                <option value="l">Г-образная</option>
                <option value="u">П-образная</option>
              </select>
            </Field>
            <ErrorBox error={error} />
            <button className="primary full" disabled={busy}>
              {busy ? "Создаём…" : "Создать комнату"}
              <Plus size={18} />
            </button>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

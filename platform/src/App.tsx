import { useEffect, useState, createContext, useContext } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  ArrowRight,
  Check,
  LogOut,
  Settings as SettingsIcon,
  LayoutGrid,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { bootstrap, request, type User } from "./api";
import { Logo, Field, ErrorBox, Loading, Modal } from "./components";
import { Dashboard } from "./Dashboard";
import { EditorPage, SharedPage } from "./Editor";
import { Admin } from "./Admin";
import { FurnitureCatalog, FurnitureDetail } from "./FurnitureCatalog";
import {
  initializeAnalytics,
  starterQuery,
  track,
} from "../../shared/analytics";
const Auth = createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
  resetAvailable: boolean;
}>({ user: null, setUser: () => {}, resetAvailable: false });
export const useAuth = () => useContext(Auth);
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [resetAvailable, setResetAvailable] = useState(false);
  useEffect(() => {
    initializeAnalytics();
    bootstrap()
      .then((r) => {
        setUser(r.user);
        setResetAvailable(r.passwordResetAvailable);
        setReady(true);
      })
      .catch(() =>
        setError("API недоступен. Проверь подключение и запуск сервера."),
      );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme =
      user?.preferences.theme === "dark" ? "dark" : "light";
  }, [user?.preferences.theme]);
  if (error)
    return (
      <div className="loading">
        <ErrorBox error={error} />
        <button onClick={() => location.reload()}>Повторить</button>
      </div>
    );
  if (!ready) return <Loading />;
  return (
    <Auth.Provider value={{ user, setUser, resetAvailable }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={user ? <Dashboard /> : <AuthRedirect to="/login" />}
          />
          <Route
            path="/login"
            element={user ? <AuthRedirect to="/" /> : <AuthPage mode="login" />}
          />
          <Route
            path="/register"
            element={
              user ? <AuthRedirect to="/" /> : <AuthPage mode="register" />
            }
          />
          <Route path="/forgot" element={<AuthPage mode="forgot" />} />
          <Route path="/reset" element={<AuthPage mode="reset" />} />
          <Route
            path="/project/:id"
            element={user ? <EditorPage /> : <Navigate to="/login" replace />}
          />
          <Route path="/share/:token" element={<SharedPage />} />
          <Route path="/furniture" element={<FurnitureCatalog />} />
          <Route path="/furniture/:id" element={<FurnitureDetail />} />
          <Route
            path="/settings"
            element={user ? <Settings /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/admin"
            element={
              user?.role === "admin" ? <Admin /> : <Navigate to="/" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Auth.Provider>
  );
}
function AuthRedirect({ to }: { to: string }) {
  const location = useLocation();
  return (
    <Navigate
      to={to + starterQuery(new URLSearchParams(location.search))}
      replace
    />
  );
}
function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset";
}) {
  const { setUser, resetAvailable } = useAuth(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  const titles = {
    login: "С возвращением",
    register: "Твоя комната. Твой план.",
    forgot: "Вернём доступ",
    reset: "Новый пароль",
  };
  return (
    <div className="auth-layout">
      <aside className="auth-art">
        <Logo />
        <div>
          <span className="eyebrow">Сначала проверь. Потом покупай.</span>
          <h1>
            Хорошая комната
            <br />
            начинается с плана.
          </h1>
          <p>
            Все размеры на одном холсте. Мебель, которая помещается.
            Пространство, в котором удобно жить.
          </p>
          <div className="auth-plan">
            <div className="mini-bed">160 × 200</div>
            <div className="mini-desk" />
            <div className="mini-rug" />
            <span>4,0 × 3,2 м</span>
          </div>
        </div>
        <small>RoomFit · 2D-планировщик пространства</small>
      </aside>
      <main className="auth-form">
        <Link to="/" className="mobile-logo">
          <Logo />
        </Link>
        <div>
          <span className="eyebrow">ROOMFIT WORKSPACE</span>
          <h1>{titles[mode]}</h1>
          <p className="muted">
            {mode === "register"
              ? "Создай аккаунт и спланируй первую комнату."
              : mode === "login"
                ? "Войди, чтобы продолжить свои проекты."
                : "Используй email своего аккаунта."}
          </p>
          {sent ? (
            <div className="success-state">
              <Mail size={32} />
              <p>
                {mode === "reset"
                  ? "Пароль обновлён. Теперь можно войти."
                  : "Если аккаунт существует, письмо уже в пути."}
              </p>
              <Link to="/login">Вернуться ко входу →</Link>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setBusy(true);
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                try {
                  if (mode === "login" || mode === "register") {
                    const r = await request<{ user: User }>(
                      `/auth/${mode}`,
                      "POST",
                      values,
                    );
                    setUser(r.user);
                    if (mode === "register")
                      track("signup_complete", "platform");
                    navigate("/" + starterQuery(params));
                  } else {
                    await request(`/auth/${mode}`, "POST", {
                      ...values,
                      token: params.get("token"),
                    });
                    setSent(true);
                  }
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {mode === "register" && (
                <Field label="Имя">
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                    placeholder="Как к тебе обращаться"
                  />
                </Field>
              )}
              {mode !== "reset" && (
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                </Field>
              )}
              {mode !== "forgot" && (
                <Field label="Пароль">
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={128}
                    required
                    placeholder={
                      mode === "login" ? "Твой пароль" : "Не меньше 10 символов"
                    }
                  />
                </Field>
              )}
              <ErrorBox error={error} />
              {mode === "forgot" && !resetAvailable && (
                <p className="notice">
                  Отправка писем пока не подключена. Настройка SMTP появится
                  после деплоя.
                </p>
              )}
              <button
                className="primary full"
                disabled={busy || (mode === "forgot" && !resetAvailable)}
              >
                {busy
                  ? "Подожди…"
                  : mode === "register"
                    ? "Создать аккаунт"
                    : mode === "login"
                      ? "Войти в RoomFit"
                      : mode === "forgot"
                        ? "Отправить ссылку"
                        : "Сохранить пароль"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {mode === "login" ? (
            <>
              <Link className="quiet-link" to="/forgot">
                Забыл пароль?
              </Link>
              <p className="auth-switch">
                Впервые здесь?{" "}
                <Link to={"/register" + starterQuery(params)}>
                  Создать аккаунт
                </Link>
              </p>
            </>
          ) : (
            <p className="auth-switch">
              Уже есть аккаунт?{" "}
              <Link to={"/login" + starterQuery(params)}>Войти</Link>
            </p>
          )}
          <div className="auth-benefits">
            <span>
              <Check size={15} /> Приватные проекты
            </span>
            <span>
              <Check size={15} /> Точные размеры
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuth(),
    [error, setError] = useState("");
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link to="/">
          <Logo />
        </Link>
        <nav>
          <Link to="/">
            <LayoutGrid size={19} /> Мои проекты
          </Link>
          <Link to="/settings">
            <SettingsIcon size={19} /> Настройки
          </Link>
          {user?.role === "admin" && (
            <Link to="/admin">
              <ShieldCheck size={19} /> Администрирование
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user?.name[0]}</div>
          <div>
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </div>
          <button
            className="icon"
            title="Выйти"
            onClick={async () => {
              try {
                await request("/auth/logout", "POST", {});
                setUser(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="workspace-main">
        <ErrorBox error={error} />
        {children}
      </main>
    </div>
  );
}
function Settings() {
  const { user, setUser } = useAuth(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [remove, setRemove] = useState(false);
  const submit = async (path: string, method: string, data: unknown) => {
    setError("");
    setMessage("");
    try {
      const result = await request<User>(path, method, data);
      if (path === "/profile") setUser(result);
      setMessage("Изменения сохранены");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Shell>
      <header className="page-head">
        <div>
          <span className="eyebrow">ТВОЁ ПРОСТРАНСТВО</span>
          <h1>Настройки</h1>
        </div>
      </header>
      <ErrorBox error={error} />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="settings-grid">
        <section className="card">
          <h2>Профиль и редактор</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit("/profile", "PUT", {
                name: f.get("name"),
                preferences: {
                  units: f.get("units"),
                  clearance: Number(f.get("clearance")) * 10,
                  theme: f.get("theme"),
                },
              });
            }}
          >
            <Field label="Имя">
              <input
                name="name"
                defaultValue={user!.name}
                required
                maxLength={80}
              />
            </Field>
            <Field label="Email">
              <input value={user!.email} disabled />
              <small>Изменение email требует подтверждения по почте.</small>
            </Field>
            <Field label="Единицы новых проектов">
              <select
                name="units"
                defaultValue={String(user!.preferences.units || "cm")}
              >
                <option value="cm">Сантиметры</option>
                <option value="m">Метры</option>
                <option value="ft">Футы</option>
              </select>
            </Field>
            <Field label="Минимум прохода, см">
              <input
                name="clearance"
                type="number"
                min="0"
                max="300"
                defaultValue={Number(user!.preferences.clearance || 800) / 10}
              />
            </Field>
            <Field label="Тема">
              <select
                name="theme"
                defaultValue={String(user!.preferences.theme || "light")}
              >
                <option value="light">Светлая</option>
                <option value="dark">Тёмная</option>
              </select>
            </Field>
            <button className="primary">Сохранить настройки</button>
          </form>
        </section>
        <section className="card">
          <h2>Безопасность</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void submit(
                "/auth/password",
                "POST",
                Object.fromEntries(new FormData(form)),
              ).then(() => form.reset());
            }}
          >
            <Field label="Текущий пароль">
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Новый пароль">
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
              />
            </Field>
            <button>Обновить пароль</button>
          </form>
          <hr />
          <h3>Удалить аккаунт</h3>
          <p className="muted">
            Все проекты и личная мебель будут удалены без возможности
            восстановления.
          </p>
          <button className="danger" onClick={() => setRemove(true)}>
            Удалить мои данные
          </button>
        </section>
      </div>
      {remove && (
        <Modal title="Удалить аккаунт?" close={() => setRemove(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await request(
                  "/profile",
                  "DELETE",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
                setUser(null);
              } catch (err) {
                setError((err as Error).message);
                setRemove(false);
              }
            }}
          >
            <p>Для подтверждения введи свой пароль.</p>
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
            />
            <button className="danger full">
              Удалить аккаунт и все проекты
            </button>
          </form>
        </Modal>
      )}
      <section className="card">
        <h2>Помощь с RoomFit</h2>
        <p className="muted">
          Опиши проблему или пожелание. Обращение появится у администратора
          платформы.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            try {
              await request("/support", "POST", {
                text: new FormData(form).get("text"),
              });
              setMessage("Обращение сохранено");
              form.reset();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <Field label="Твоё сообщение">
            <textarea
              name="text"
              required
              minLength={10}
              maxLength={4000}
              rows={4}
            />
          </Field>
          <button>Отправить обращение</button>
        </form>
      </section>
    </Shell>
  );
}

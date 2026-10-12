import { useEffect, useState } from "react";
import { Shell } from "./App";
import { request, type User } from "./api";
import { ErrorBox, Field } from "./components";
export function Admin() {
  const [users, setUsers] = useState<(User & { enabled: boolean })[]>([]),
    [stats, setStats] = useState<Record<string, number>>({}),
    [audit, setAudit] = useState<
      { actor: string; action: string; entity: string; createdAt: string }[]
    >([]),
    [error, setError] = useState(""),
    [catalog, setCatalog] = useState(""),
    [templates, setTemplates] = useState(""),
    [projectLimit, setProjectLimit] = useState(100),
    [support, setSupport] = useState<
      {
        id: string;
        ownerId: string;
        text: string;
        status: string;
        createdAt: string;
      }[]
    >([]);
  const reload = () =>
    Promise.all([
      request<typeof users>("/admin/users").then(setUsers),
      request<typeof stats>("/admin/stats").then(setStats),
      request<typeof audit>("/admin/audit").then(setAudit),
      request("/catalog").then((v) => setCatalog(JSON.stringify(v, null, 2))),
      request("/templates").then((v) =>
        setTemplates(JSON.stringify(v, null, 2)),
      ),
      request<{ projects: number }>("/admin/limits").then((v) =>
        setProjectLimit(v.projects),
      ),
      request<typeof support>("/admin/support").then(setSupport),
    ]).catch((e) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);
  return (
    <Shell>
      <header className="page-head">
        <div>
          <span className="eyebrow">ROOMFIT ADMIN</span>
          <h1>Управление платформой</h1>
        </div>
      </header>
      <ErrorBox error={error} />
      <div className="admin-stats">
        {Object.entries(stats).map(([key, value]) => (
          <div className="card" key={key}>
            <strong>{value}</strong>
            <span>
              {
                {
                  users: "Пользователи",
                  projects: "Проекты",
                  catalog: "Предметы каталога",
                }[key]
              }
            </span>
          </div>
        ))}
      </div>
      <section className="card">
        <h2>Пользователи</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <button
                      onClick={async () => {
                        try {
                          await request(`/admin/users/${u.id}`, "PATCH", {
                            enabled: !u.enabled,
                          });
                          await reload();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {u.enabled ? "Активен" : "Заблокирован"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Каталог</h2>
        <p className="muted">
          Каждый предмет проверяется сервером перед публикацией. Изменения
          записываются в аудит.
        </p>
        <textarea
          className="code-editor"
          value={catalog}
          onChange={(e) => setCatalog(e.target.value)}
          rows={14}
        />
        <button
          onClick={async () => {
            try {
              const items = JSON.parse(catalog);
              if (!Array.isArray(items)) throw Error("Нужен массив предметов");
              for (const item of items)
                await request(
                  `/admin/catalog/${encodeURIComponent(item.id)}`,
                  "PUT",
                  item,
                );
              await reload();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Опубликовать предметы
        </button>
      </section>
      <section className="card">
        <h2>Шаблоны помещений</h2>
        <p className="muted">
          Опубликованный шаблон появляется в Dashboard. Проекты пользователей
          остаются независимыми копиями.
        </p>
        <textarea
          className="code-editor"
          rows={10}
          value={templates}
          onChange={(e) => setTemplates(e.target.value)}
          aria-label="Шаблоны JSON"
        />
        <button
          onClick={async () => {
            try {
              const list = JSON.parse(templates);
              if (!Array.isArray(list)) throw Error("Нужен массив шаблонов");
              for (const t of list)
                await request(
                  `/admin/templates/${encodeURIComponent(t.id)}`,
                  "PUT",
                  { name: t.name, document: t.document },
                );
              await reload();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Опубликовать шаблоны
        </button>
        <button
          className="danger"
          onClick={async () => {
            const id = prompt("ID шаблона для удаления");
            if (!id) return;
            try {
              await request(
                `/admin/templates/${encodeURIComponent(id)}`,
                "DELETE",
              );
              await reload();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Удалить шаблон по ID
        </button>
      </section>
      <section className="card">
        <h2>Лимиты</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await request("/admin/limits", "PUT", { projects: projectLimit });
              await reload();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <Field label="Проектов на аккаунт">
            <input
              type="number"
              value={projectLimit}
              min={1}
              max={1000}
              onChange={(e) => setProjectLimit(Number(e.target.value))}
            />
          </Field>
          <button>Сохранить лимит</button>
        </form>
        <p className="micro-note">
          Платные тарифы в ТЗ — гипотеза. Списание денег и платёжный провайдер
          не подключены.
        </p>
      </section>
      <section className="card">
        <h2>Обращения пользователей</h2>
        {support.length ? (
          support.map((t) => (
            <div className="support-ticket" key={t.id}>
              <strong>
                {users.find((u) => u.id === t.ownerId)?.email || t.ownerId}
              </strong>
              <p>{t.text}</p>
              <small>{new Date(t.createdAt).toLocaleString("ru-RU")}</small>
              <button
                onClick={async () => {
                  try {
                    await request(`/admin/support/${t.id}`, "PATCH", {
                      status: t.status === "open" ? "closed" : "open",
                    });
                    await reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {t.status === "open" ? "Закрыть обращение" : "Открыть снова"}
              </button>
            </div>
          ))
        ) : (
          <p className="muted">Новых обращений нет.</p>
        )}
      </section>
      <section className="card">
        <h2>Журнал действий</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Действие</th>
                <th>Объект</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{a.action}</td>
                  <td>{a.entity}</td>
                  <td>{new Date(a.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}

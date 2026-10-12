# Деплой RoomFit

Текущие публичные адреса: [лендинг](https://room-fit-gamma.vercel.app/), [платформа](https://roomfitplatform-kappa.vercel.app/login). Production-версия лендинга использует этот адрес платформы по умолчанию; `VITE_PLATFORM_URL` позволяет переопределить его.

## Vercel — сначала платформа

1. Открыть **Add New → Project**, импортировать `Rauan228/RoomFit`.
2. Назвать проект, например `roomfit-platform`.
3. **Root Directory:** `platform`.
4. Включить **Include source files outside of the Root Directory in the Build Step**: платформа использует `packages/core` из этого же репозитория.
5. Framework Preset: **Vite**. Build Command: `npm run build`, Output Directory: `dist`. Install Command уже задан в `platform/vercel.json`: `cd .. && npm ci --include=dev --workspace=@roomfit/platform --workspace=@roomfit/core --include-workspace-root=false`. Он устанавливает зависимости платформы и общей библиотеки из корневого lockfile, включая TypeScript и Vite. Отдельный Override в панели Vercel не нужен.
6. Node.js: **22.x** или более новый поддерживаемый выпуск.
7. Нажать Deploy. Зарегистрировать свой аккаунт на полученном `https://…vercel.app` и проверить сохранение комнаты после перезагрузки.

В `platform/vercel.json` уже есть проксирование `/api/:path*` на `https://roomfit.212.19.134.179.sslip.io/api/:path*`. Браузер обращается к API на своём Vercel-адресе; HttpOnly Secure cookie и CSRF работают через этот же адрес. Не заменять это прямыми запросами браузера к другому домену.

Если предыдущая сборка завершилась с `tsc: command not found`, развернуть последний коммит `main`, содержащий исправление зависимостей, а не повторять старую сборку. Инструменты сборки теперь объявлены непосредственно в `platform/package.json`, поэтому платформа не зависит от установки devDependencies корневого workspace.

## Vercel — лендинг

1. Снова импортировать **тот же репозиторий** как второй проект, например `roomfit-landing`.
2. **Root Directory:** `landing`.
3. Framework Preset **Vite**, Build Command `npm run build`, Output Directory `dist`.
4. При необходимости добавить Environment Variable **`VITE_PLATFORM_URL`** со значением адреса платформы `https://roomfitplatform-kappa.vercel.app`, без завершающего `/`. Выбрать нужные окружения Production/Preview. Если переменная уже задана, проверить, что в ней нет localhost или старого адреса: она имеет приоритет над production-адресом в коде.
5. Deploy. «Начать бесплатно» открывает `/register`, «Войти» — `/login`. Демо на самом лендинге продолжает работать.

После изменения `VITE_PLATFORM_URL` нужен Redeploy: Vite подставляет её при сборке. Vercel будет автоматически пересобирать проекты после новых коммитов в `main`.

Настройки монорепозиториев описаны в [документации Vercel](https://vercel.com/docs/monorepos). Внешний API подключается через [external rewrites](https://vercel.com/docs/rewrites).

## Что уже работает на VPS

- Каталог установки: `/opt/roomfit`; служебный пользователь `roomfit`.
- API слушает **только** `127.0.0.1:4182`.
- PostgreSQL: отдельная БД и роль `roomfit`, доступ локальный.
- Настройки и случайные серверные ключи: `/opt/roomfit/api/.env`, `root:roomfit`, права `640`.
- Systemd: `roomfit-api.service`, `roomfit-backup.timer`.
- Отдельный Nginx-конфиг: `/etc/nginx/sites-available/roomfit`.
- HTTPS: Let's Encrypt, временный адрес `roomfit.212.19.134.179.sslip.io`.
- Ежедневный PostgreSQL dump и копия `.env`: `/var/backups/roomfit`, права закрыты, хранение 14 дней.
- Существующие конфиги и приложения других проектов не используются RoomFit.

После того как появится Vercel-адрес, заменить `FRONTEND_URL` в `.env` на этот адрес и перезапустить **только** `roomfit-api`. Это важно для ссылок восстановления пароля после подключения SMTP. `ALLOWED_ORIGINS` нужен при прямом CORS-доступе; штатный фронт использует rewrite.

```bash
systemctl status roomfit-api --no-pager
journalctl -u roomfit-api -n 50 --no-pager
curl -fsS https://roomfit.212.19.134.179.sslip.io/api/health
systemctl list-timers roomfit-backup.timer
```

## Обновление backend

Сначала выполнить проверки локально. Загрузить исходники **только** в каталог RoomFit, не перезаписывая `.env`, `.venv`, `data`. Затем:

```bash
cd /opt/roomfit/api
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m alembic upgrade head
systemctl restart roomfit-api
curl -fsS http://127.0.0.1:4182/api/health
```

Для первоначальной установки приложены `deploy/bootstrap.sh` и `deploy/provision-database.py`. Bootstrap рассчитан на подготовленный архив `/tmp/roomfit-deploy.tgz`, запускается как root, останавливается при обнаружении неизвестного `/opt/roomfit` и сохраняет уже существующий RoomFit `.env`. Временный просмотр фронта на VPS обновляется копированием `platform/dist` только в `/opt/roomfit/platform/dist`.

NumPy ограничен версией `<2.4`: процессор этого VPS не поддерживает x86-64-v2, требуемый новыми стандартными колёсами. Причина изменения описана в [официальных release notes NumPy](https://numpy.org/doc/stable/release/2.4.0-notes.html). Системный Python и окружения других приложений не заменялись.

## SMTP и администратор

Заполнить `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD` в серверном `.env`. Нужен SMTP с STARTTLS. После `systemctl restart roomfit-api` восстановление пароля включится автоматически. До этого интерфейс сообщает, что почта не подключена; токены в ответ API и логи не выдаются.

Администратор назначается вручную через CLI; первый зарегистрировавшийся пользователь не получает административные права:

```bash
cd /opt/roomfit/api
.venv/bin/python -m roomfit.admin --email your-email@example.com
```

У существующего аккаунта изменяется роль. При создании нового CLI запросит пароль скрытым вводом.

## Собственный API-домен

Создать DNS A-запись `api.yourdomain` → VPS. Выпустить сертификат через webroot, добавить этот домен в **RoomFit** Nginx-конфиг, проверить `nginx -t` и выполнить reload. Обновить внешний адрес в `platform/vercel.json`, закоммитить и передеплоить платформу. Старый адрес можно оставить на переходный период.

## Резервное копирование и восстановление

Ручная копия: `/usr/local/sbin/roomfit-backup`. Копии на том же VPS не защищают от потери самого сервера: для публичного продукта их нужно дополнительно отправлять в выбранное внешнее хранилище.

Для проверки восстановления создать **отдельную временную БД**, восстановить туда dump и сверить таблицы/число проектов; рабочую БД для проверки не заменять. Процедура проверки приложена в `deploy/verify-restore.sh`.

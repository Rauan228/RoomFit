# Деплой RoomFit на VPS

RoomFit размещён на **212.19.134.179**. Namecheap обслуживает DNS; Nginx отдаёт оба React-приложения, FastAPI работает отдельным сервисом, данные хранятся в PostgreSQL.

Старые Vercel-проекты RoomFit остановлены, автоматические сборки отключены, привязки roomfit.art и platform.roomfit.art удалены из Vercel. Рабочее размещение полностью на VPS.

| Адрес | Назначение | Каталог / сервис |
| --- | --- | --- |
| https://roomfit.art | Лендинг | /opt/roomfit/web-current/landing/dist |
| https://www.roomfit.art | Перенаправление на основной домен | Nginx, 301 |
| https://platform.roomfit.art | Платформа | /opt/roomfit/web-current/platform/dist |
| https://platform.roomfit.art/api | API на том же домене | 127.0.0.1:4182, roomfit-api |

## DNS в Namecheap

**Domain List → Manage → Advanced DNS → Host Records**:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A Record | @ | 212.19.134.179 | Automatic |
| A Record | platform | 212.19.134.179 | Automatic |
| CNAME Record | www | roomfit.art | Automatic |

Парковочный CNAME и URL Redirect заменены этими записями. Nameservers остаются Namecheap BasicDNS. [Описание DNS-записей Namecheap](https://www.namecheap.com/support/knowledgebase/article.aspx/579/2237/which-record-type-option-should-i-choose-for-the-information-im-about-to-enter/).

Авторитетные серверы Namecheap уже отдают IP VPS. Рекурсивные DNS-серверы могут ещё возвращать старую парковку до истечения TTL; повторно менять правильные записи для этого не нужно.

## Обновление лендинга и платформы из Windows

Нужны Node.js 22.12+ и PuTTY с plink.exe и pscp.exe в стандартной папке Program Files.

```powershell
npm ci
./scripts/deploy-web.ps1
```

Скрипт собирает оба приложения с VITE_PLATFORM_URL=https://platform.roomfit.art, создаёт архив, проверяет его SHA-256 на VPS и активирует новый релиз. PuTTY запрашивает пароль при загрузке и подключении. Пароль не записывается в скрипт или репозиторий.

Проверки приложения выполнять до обновления:

```powershell
npm test
npm run test:api
npm run test:e2e
npm run test:landing
```

Готовые сборки можно загрузить с ./scripts/deploy-web.ps1 -SkipBuild. Они должны быть собраны для production-адреса платформы.

Релизы находятся в /opt/roomfit/web-releases; /opt/roomfit/web-current переключается атомарно после полной распаковки и проверки обоих index.html. Хешированные файлы предыдущих сборок доступны открытым вкладкам. Обновление фронтендов не заменяет API, .env, базу или пользовательские проекты.

## Nginx и HTTPS

Основной конфиг доменов: /etc/nginx/sites-available/roomfit-domains. Его шаблоны находятся в deploy/nginx-domains-http.conf и deploy/nginx-domains-https.conf.

Первичная настройка после загрузки фронтендов и DNS:

```bash
bash /opt/roomfit/deploy/configure-domains.sh
```

Скрипт включает HTTP-маршрут ACME, получает сертификат roomfit.art для всех трёх имён и включает HTTPS. Nginx проверяется перед каждым reload; неизвестный конфиг RoomFit не перезаписывается.

Сертификат: /etc/letsencrypt/live/roomfit.art/. Продление выполняет существующий certbot.timer. Отдельный hook проверяет Nginx и делает reload при продлении сертификатов RoomFit. [Режим webroot Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

```bash
nginx -t
systemctl status roomfit-api --no-pager
systemctl list-timers certbot.timer
certbot renew --cert-name roomfit.art --dry-run --no-random-sleep-on-renew
curl -fsS https://platform.roomfit.art/api/health
```

Лендинг собирается в готовые HTML-страницы: известные маршруты имеют собственный index.html, неизвестные адреса возвращают HTTP 404. Платформа использует SPA fallback на index.html и noindex. HTML отдаётся с no-cache, файлы с хешами — с длительным кешированием. API использует proxy_pass без удаления префикса /api/. Cookies HttpOnly Secure и CSRF работают на домене платформы. Настройка индексации и Search Console: [seo.md](seo.md).

## API и данные

- Каталог установки: /opt/roomfit, служебный пользователь roomfit.
- API слушает только 127.0.0.1:4182.
- PostgreSQL: отдельная БД и роль roomfit, доступ локальный.
- Секреты: /opt/roomfit/api/.env, root:roomfit, права 640.
- FRONTEND_URL=https://platform.roomfit.art — адрес для почтовых ссылок восстановления.
- API обращается к базе и сохранённым проектам, существовавшим до переноса фронтендов.
- Backup: roomfit-backup.timer, закрытый каталог /var/backups/roomfit, хранение 14 дней.
- Отдельный старый hostname sslip.io остаётся служебным адресом VPS; приложения используют основные домены.

После изменения backend загрузить исходники в каталог RoomFit, затем:

```bash
cd /opt/roomfit/api
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m alembic upgrade head
systemctl restart roomfit-api
curl -fsS http://127.0.0.1:4182/api/health
```

Для проверки нового сервера сохранён deploy/bootstrap.sh: он разворачивает API и его служебный адрес из /tmp/roomfit-deploy.tgz. После этого фронтенды загружаются через deploy-web.ps1 и домены подключаются через configure-domains.sh.

NumPy ограничен версией <2.4: процессор этого VPS не поддерживает x86-64-v2, требуемый новыми стандартными колёсами. [Release notes NumPy](https://numpy.org/doc/stable/release/2.4.0-notes.html).

## SMTP и администратор

Заполнить SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD в серверном .env. Используется SMTP с STARTTLS. После перезапуска roomfit-api восстановление пароля включится автоматически. До этого интерфейс сообщает, что почта не подключена; токены не выдаются в ответах API или логах.

Администратор назначается вручную:

```bash
cd /opt/roomfit/api
.venv/bin/python -m roomfit.admin --email your-email@example.com
```

У существующего аккаунта меняется роль. При создании нового CLI запрашивает пароль скрытым вводом.

## Резервные копии и откат

Ручная копия БД и настроек: /usr/local/sbin/roomfit-backup. Для проверки восстановления использовать отдельную временную БД; процедура находится в deploy/verify-restore.sh. Копии на VPS дополнительно стоит отправлять в внешнее хранилище.

Откат фронтендов: выбрать предыдущий каталог в /opt/roomfit/web-releases, создать временную ссылку внутри /opt/roomfit и атомарно заменить web-current. База и сохранённые проекты при этом не меняются. Перед переключением проверить, что выбранный путь принадлежит RoomFit.

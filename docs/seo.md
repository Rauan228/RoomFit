# SEO RoomFit

Публичный сайт: https://roomfit.art/. Редактор и аккаунты: https://platform.roomfit.art/.

## Что подготовлено

- Готовый HTML главной, каталога инструкций, пяти разборов и трёх информационных страниц. React подключает интерактивность к этому HTML; отдельный Node-сервер на VPS не нужен.
- Уникальные title/description, canonical, Open Graph и Twitter Cards. Реальные PNG-превью 1200 × 630 и небольшие WebP-иллюстрации генерируются из схем комнат.
- JSON-LD Organization, WebSite, WebPage, SoftwareApplication, Article и BreadcrumbList. Вымышленных оценок, отзывов и авторов нет. Разметка не гарантирует расширенные результаты; для некоторых типов у Google есть дополнительные требования.
- Настоящие robots.txt и XML sitemap, HTTP 404 для неизвестных адресов, один основной HTTPS-домен и перенаправление www. Nginx сжимает HTML и код.
- Платформа отдаёт noindex в HTML и HTTP-заголовке. robots.txt разрешает чтение HTML, чтобы робот увидел noindex; авторизация продолжает защищать личные проекты.
- Публичные страницы доступны OAI-SearchBot. GPTBot и поисковый бот имеют разное назначение; настройки обучения отдельно не менялись.
- Четыре шаблона можно скачать как JSON или открыть в платформе. Вход/регистрация сохраняют выбор. Копия создаётся по явному нажатию кнопки.

## Google Search Console

Ресурс должен быть **Домен → roomfit.art**. В Namecheap → Domain List → Manage → Advanced DNS → Host Records:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| TXT Record | @ | google-site-verification=jekTtMun0yw_GLTzUHqhU_ldKkmsTPawSZMoUR1o6Po | Automatic |

Это публичный токен подтверждения. Существующие A/CNAME и SPF сохраняются. TXT нужно оставить после успешного подтверждения.

После публикации сайта:

1. Нажать «Перейти к ресурсу».
2. Открыть «Файлы Sitemap» и отправить **полный адрес** https://roomfit.art/sitemap.xml.
3. В верхней строке проверки URL указать https://roomfit.art/, запустить проверку опубликованной страницы и запросить индексирование.
4. Аналогично проверить каталог https://roomfit.art/rukovodstva/ и важные разборы. Обычная отправка карты не гарантирует включение каждой страницы в индекс.
5. В отчётах проверять причины исключения страниц, запросы, показы и переходы. Первые данные появляются после обхода и обработки; обещать дату или позиции нельзя.

Подтверждение и работа с ресурсом выполняются в Google-аккаунте владельца, а не из репозитория. [Подтверждение домена Google](https://support.google.com/webmasters/answer/9008080), [TXT в Namecheap](https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/).

## Bing и IndexNow

В https://www.bing.com/webmasters/ войти своим аккаунтом, выбрать импорт сайта из Google Search Console и подтвердить доступ. Затем проверить карту https://roomfit.art/sitemap.xml. Если импорт недоступен, выбрать обычное добавление сайта и выданный Bing способ подтверждения. Секреты и токены аккаунта в репозиторий не добавлять.

Уведомить поисковики, участвующие в IndexNow, можно после деплоя:

```powershell
node scripts/submit-indexnow.mjs --dry-run
node scripts/submit-indexnow.mjs
```

Ключ IndexNow намеренно публичный: поисковик проверяет файл на домене. Скрипт проверяет его доступность, читает настоящую опубликованную карту и отправляет только её URL. IndexNow не является запросом индексации Google и не гарантирует позиции. [Протокол IndexNow](https://www.indexnow.org/documentation), [карты сайта Bing](https://blogs.bing.com/webmaster/2025/7/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search/).

## Статистика продукта

Оба домена отправляют небольшие GET-события на /events. Nginx принимает только известные значения event/page/source и записывает отдельный JSON-журнал **без IP, User-Agent, Referer, email и ID аккаунтов/проектов**. Обычные технические access logs Nginx существуют отдельно.

События: page_view, platform_click, signup_complete, project_created, project_saved. Сохранение засчитывается после успешного ответа API; событие дедуплицируется по проекту в браузерной сессии. Do Not Track и Global Privacy Control отключают измерение. Аналитических cookie нет.

Источник определяется по Referer или ограниченному rf_source и переносится с лендинга в платформу. Если браузер/ИИ-приложение скрывает Referer, источник может оказаться direct. Это агрегаты событий, **не уникальные посетители и не точная конверсионная воронка**. Не делить их напрямую для утверждений о конверсии пользователей.

На VPS:

```bash
python3 /opt/roomfit/web-current/scripts/seo-report.py --days 30
```

Отчёт читает текущий активный журнал. Данные за пределами периода ротации текущего журнала могут отсутствовать. Уровень роста оценивать вместе с Search Console, регистрациями и сохранёнными проектами.

## Контент и настоящие упоминания

Начальные темы выбраны по задачам продукта, без заявлений о частотности. Фактический спрос уточнять по Search Console и исследованию запросов. Дальше добавлять примеры с отличающимися исходными условиями, а не копии одной статьи под разные формулировки.

Черновики внешних публикаций и очередь новых разборов: [seo-content-plan.md](seo-content-plan.md). Публиковать их от своего аккаунта и использовать реальные планы с разрешением автора. Внешние сообщения и публикации автоматически не отправлялись.

Google рекомендует обычные основы SEO и уникальный полезный контент для своих ИИ-функций; специальный llms.txt для Google не требуется. Доступ OAI-SearchBot позволяет рассматривать страницы для поиска ChatGPT, но не гарантирует рекомендации. [Google: ИИ-поиск](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [OpenAI: поисковые роботы](https://developers.openai.com/api/docs/bots).

## Проверка и обновление

```powershell
npm run build
npm test
npm run test:seo --workspace @roomfit/landing
npm run test:e2e -- --grep "public template"
./scripts/deploy-web.ps1 -SkipBuild
node scripts/submit-indexnow.mjs
```

Генератор создаёт sitemap только из публичных маршрутов; пользовательских URL там нет. lastmod не подделывается временем каждой сборки. Новую инструкцию добавлять в landing/src/content/guides.ts, при необходимости — шаблон в shared/starter-rooms.ts. Не менять опубликованные slug без перенаправления старого адреса.

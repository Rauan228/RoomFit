import { ArrowRight, ArrowUpRight, Check, Menu, X } from "lucide-react";
import { useState } from "react";
import GuidePlan from "./components/GuidePlan";
import GuideCards from "./components/GuideCards";
import { GUIDES, guidePath, type Guide } from "./content/guides";
import { STARTER_ROOMS, type StarterKey } from "../../shared/starter-rooms";

export const platformUrl = (
  import.meta.env.VITE_PLATFORM_URL ||
  (import.meta.env.PROD
    ? "https://platform.roomfit.art"
    : "http://127.0.0.1:4181")
)
  .trim()
  .replace(/\/$/, "");
export function PlatformLink({
  template,
  children = "Открыть свой план",
}: {
  template?: StarterKey;
  children?: React.ReactNode;
}) {
  return (
    <a
      className="button button-gold"
      data-analytics="platform_click"
      href={`${platformUrl}/register${template ? `?template=${template}` : ""}`}
    >
      {children}
      <ArrowUpRight size={18} />
    </a>
  );
}
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className="public-header">
        <div className="container header-inner">
          <a href="/" className="logo" aria-label="RoomFit — на главную">
            <img
              src="/assets/logo-mark-dark.png"
              width="38"
              height="38"
              alt=""
            />
            <span>
              Room<span>Fit</span>
            </span>
          </a>
          <nav className="public-desktop-nav" aria-label="Главная навигация">
            <a href="/#demo">Попробовать демо</a>
            <a href="/rukovodstva/">Планы и инструкции</a>
            <a href="/o-proekte/">О проекте</a>
          </nav>
          <div className="header-actions">
            <PlatformLink>Начать бесплатно</PlatformLink>
            <button
              className="icon-button menu-toggle"
              aria-label={open ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={open}
              aria-controls="public-menu"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            id="public-menu"
            className="mobile-nav"
            aria-label="Мобильная навигация"
          >
            <a href="/">Главная</a>
            <a href="/#demo">Попробовать демо</a>
            <a href="/rukovodstva/">Планы и инструкции</a>
            <a href="/o-proekte/">О проекте</a>
          </nav>
        )}
      </header>
    </>
  );
}
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="container">
        <div>
          <a className="logo" href="/">
            Room<span>Fit</span>
          </a>
          <p>Сначала план. Потом уют.</p>
        </div>
        <nav aria-label="Навигация внизу страницы">
          <a href="/rukovodstva/">Планы и инструкции</a>
          <a href="/o-proekte/">О проекте</a>
          <a href="/konfidencialnost/">Конфиденциальность</a>
          <a href="/usloviya/">Условия использования</a>
        </nav>
        <small>© 2026 RoomFit</small>
      </div>
    </footer>
  );
}
export default function GuidePage({ guide }: { guide: Guide }) {
  const room = STARTER_ROOMS[guide.template];
  return (
    <div className="public-site">
      <PublicHeader />
      <main id="main">
        <section className="guide-hero">
          <div className="container guide-hero-grid">
            <div>
              <nav className="breadcrumbs" aria-label="Хлебные крошки">
                <a href="/">Главная</a>
                <span>/</span>
                <a href="/rukovodstva/">Планы и инструкции</a>
              </nav>
              <span className="eyebrow">{guide.label}</span>
              <h1>{guide.heading}</h1>
              <p className="guide-lead">{guide.intro}</p>
              <div className="guide-actions">
                <PlatformLink template={guide.template}>
                  Изменить этот план
                </PlatformLink>
                <a className="text-link" href="#instructions">
                  Читать инструкцию <ArrowRight size={17} />
                </a>
              </div>
              <p className="guide-byline">
                Команда RoomFit · {guide.minutes} минут чтения · Учебный пример
              </p>
            </div>
            <figure className="guide-figure">
              <GuidePlan template={guide.template} />
              <figcaption>
                {room.w} × {room.h} см ·{" "}
                {((room.w * room.h) / 10000).toLocaleString("ru-RU")} м² ·
                Размеры по внутренним стенам
              </figcaption>
            </figure>
          </div>
        </section>
        <div className="container guide-content" id="instructions">
          <article>
            <div className="guide-takeaway">
              <span className="eyebrow">Что проверить в первую очередь</span>
              <p>{guide.takeaway}</p>
            </div>
            {guide.sections.map((section) => (
              <section
                className="guide-section"
                id={section.id}
                key={section.id}
              >
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.checklist && (
                  <ul className="guide-checklist">
                    {section.checklist.map((item) => (
                      <li key={item}>
                        <Check size={18} aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <section className="guide-section guide-questions">
              <h2>Частые вопросы</h2>
              {guide.questions.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </section>
            <section className="guide-next">
              <span className="eyebrow">От примера к твоей комнате</span>
              <h2>Подставь свои размеры.</h2>
              <p>
                После входа увидишь выбранный шаблон. Создай свою копию, измени
                стены, проёмы и мебель. Исходный пример останется доступным
                здесь.
              </p>
              <PlatformLink template={guide.template}>
                Продолжить с этим планом
              </PlatformLink>
              <a
                className="text-link"
                href={`/templates/${guide.template}.json`}
                download
              >
                Скачать шаблон JSON
              </a>
            </section>
          </article>
          <aside className="guide-toc">
            <span className="eyebrow">В этом разборе</span>
            <nav aria-label="Содержание статьи">
              {guide.sections.map((section) => (
                <a href={`#${section.id}`} key={section.id}>
                  {section.title}
                </a>
              ))}
            </nav>
            <a href="/#demo">
              Сначала попробовать демо <ArrowRight size={16} />
            </a>
          </aside>
        </div>
        <section className="container guides-related">
          <h2>Другие задачи комнаты</h2>
          <GuideCards exclude={guide.slug} />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
export function GuidesIndex() {
  return (
    <div className="public-site">
      <PublicHeader />
      <main id="main" className="container guides-index">
        <span className="eyebrow">Практика RoomFit</span>
        <h1>Место для хороших решений.</h1>
        <p className="guide-lead">
          Планы с размерами, разборы расстановок и инструкции. Каждый пример
          можно открыть в редакторе и изменить под свою комнату.
        </p>
        <GuideCards />
      </main>
      <PublicFooter />
    </div>
  );
}
export const INFO_PAGES = {
  "o-proekte": {
    title: "О проекте RoomFit",
    description:
      "RoomFit — веб-платформа для создания 2D-планов комнат и проверки расстановки мебели.",
    sections: [
      [
        "Сначала проверь. Потом покупай.",
        "RoomFit помогает создать план комнаты с размерами, расположить мебель и проверить, что она помещается. Проект вырос из простой задачи: принять решение о расстановке до покупки и ремонта.",
      ],
      [
        "Что уже работает",
        "Доступны комнаты с редактируемым контуром, двери и окна, каталог и собственная мебель, проверка пересечений, варианты расстановки, облачное сохранение, подложки PNG/JPG/PDF, экспорт и ссылки на просмотр. На главной есть демо без регистрации. Текущая версия платформы доступна бесплатно.",
      ],
      [
        "Что пока в разработке",
        "В платформе доступен базовый 3D-просмотр с общими размерами, выбором предметов и панелью свойств. Подробные GLB-модели, перетаскивание в 3D и прогулка по комнате ещё в разработке. Иллюстрации на лендинге показывают концепцию оформления. RoomFit предназначен для предварительного планирования и не заменяет строительный проект.",
      ],
      [
        "Связаться с командой",
        "После входа в платформу открой «Настройки» → «Помощь с RoomFit». Сообщение попадёт администратору проекта. Исходный код проекта открыт на GitHub: github.com/Rauan228/RoomFit.",
      ],
    ],
  },
  konfidencialnost: {
    title: "Конфиденциальность RoomFit",
    description:
      "Какие данные используются в демо, аккаунте и статистике RoomFit, и как удалить свои проекты.",
    sections: [
      [
        "Демо в браузере",
        "План из демо сохраняется в локальном хранилище устройства, когда ты нажимаешь «Сохранить». Его можно удалить через очистку данных сайта в браузере. Демо не требует аккаунта.",
      ],
      [
        "Аккаунт и проекты",
        "Платформа хранит имя, email, хеш пароля, настройки, проекты и обращения в поддержку на сервере RoomFit. Пароль не хранится открытым текстом. Для входа используются служебные cookie сессии. Личные планы доступны после авторизации; отдельная ссылка на просмотр открывает выбранный проект тому, у кого есть эта ссылка.",
      ],
      [
        "Статистика и технические журналы",
        "Для оценки полезности сайта RoomFit считает просмотры, переходы в платформу, регистрации и успешные сохранения проектов. В журнал статистики не записываются email, содержимое планов, идентификаторы пользователей или проектов; отдельные аналитические cookie не создаются. Соблюдаются настройки Do Not Track и Global Privacy Control. Технические журналы веб-сервера могут содержать IP-адреса и запрошенные адреса для диагностики и защиты сервиса.",
      ],
      [
        "Удаление данных",
        "В настройках платформы можно удалить аккаунт вместе с проектами и личной мебелью. Для вопросов о данных используй форму помощи в настройках. Резервные копии сервера имеют отдельный цикл хранения до 14 дней.",
      ],
    ],
  },
  usloviya: {
    title: "Условия использования RoomFit",
    description:
      "Назначение 2D-планировщика RoomFit, сохранение проектов и границы предварительной проверки размеров.",
    sections: [
      [
        "Назначение сервиса",
        "RoomFit предназначен для предварительного планирования комнат и расстановки мебели. Результат зависит от введённых размеров, положения стен и проёмов, выбранных габаритов предметов и настроек проверки.",
      ],
      [
        "Проверка перед покупкой",
        "Сверяй внешние размеры мебели с производителем и повторяй замеры помещения. Проверка на плане не рассчитывает все эксплуатационные, строительные и транспортные условия. Доставку, безопасность установки и требования конкретной мебели нужно проверить отдельно.",
      ],
      [
        "Сохранение и доступ",
        "Демо сохраняет план на устройстве. Платформа сохраняет проекты в аккаунте на сервере. Экспортируй важные варианты дополнительно. Ссылка на просмотр предназначена для передачи выбранного проекта другим людям; делись ею осознанно.",
      ],
      [
        "Обратная связь",
        "Сообщить об ошибке или предложить улучшение можно через «Настройки» → «Помощь с RoomFit». Базовый 3D-просмотр находится в раннем доступе; действующие возможности и ограничения описаны на странице о проекте.",
      ],
    ],
  },
};
export type InfoKey = keyof typeof INFO_PAGES;
export function InfoPage({ page }: { page: InfoKey }) {
  const info = INFO_PAGES[page];
  return (
    <div className="public-site">
      <PublicHeader />
      <main id="main" className="container info-page">
        <nav className="breadcrumbs" aria-label="Хлебные крошки">
          <a href="/">Главная</a>
          <span>/</span>
          <span>{info.title}</span>
        </nav>
        <h1>{info.title}</h1>
        <p className="guide-lead">{info.description}</p>
        {info.sections.map(([title, text]) => (
          <section className="guide-section" key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        {page === "o-proekte" && (
          <a className="text-link" href="https://github.com/Rauan228/RoomFit">
            Открыть репозиторий проекта <ArrowUpRight size={18} />
          </a>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
export function NotFound() {
  return (
    <div className="public-site">
      <PublicHeader />
      <main id="main" className="container info-page">
        <span className="eyebrow">404</span>
        <h1>Здесь пока пусто.</h1>
        <p className="guide-lead">
          Такой страницы нет. Можно вернуться к планированию или выбрать готовый
          пример.
        </p>
        <a href="/" className="button button-gold">
          На главную <ArrowRight size={18} />
        </a>
        <p className="guide-lead">
          <a className="text-link" href="/rukovodstva/">
            Посмотреть планы и инструкции
          </a>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

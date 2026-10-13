import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bookmark,
  BookMarked,
  Check,
  CheckCircle2,
  CircleAlert,
  FileImage,
  FileText,
  Home,
  Menu,
  Move,
  Play,
  Plus,
  Ruler,
  Sofa,
  X,
} from "lucide-react";
import { CATALOG, ROOMS } from "./lib/data";
import { analyze } from "./lib/geometry";
import { Furn, FurnThumb } from "./lib/plan-visuals";
import DemoEditor from "./components/DemoEditor";
import EditorPreview, { heroTemplate } from "./components/EditorPreview";
import PlanPreview from "./components/PlanPreview";
import ComparisonSlider from "./components/ComparisonSlider";
import Modal from "./components/Modal";
import useLandingMotion from "./hooks/useLandingMotion";
import GuideCards from "./components/GuideCards";

const navigation = [
  ["features", "Возможности"],
  ["how", "Как это работает"],
  ["examples", "Примеры"],
  ["faq", "FAQ"],
];
const heroFeatures = [
  [Ruler, "2D-план с размерами"],
  [Sofa, "Каталог мебели"],
  [CircleAlert, "Проверка столкновений"],
  [BookMarked, "Сохранение вариантов"],
  [ArrowDownToLine, "Экспорт плана"],
] as const;
const gallery = [
  ["bedroom", "Спальня"],
  ["living", "Гостиная"],
  ["kids", "Детская"],
  ["office", "Домашний кабинет"],
  ["kitchen", "Кухня"],
  ["studio", "Студия"],
];
const faq = [
  [
    "Нужно ли устанавливать программу?",
    "Нет. RoomFit работает прямо в браузере на компьютере и телефоне. Чтобы попробовать демо, не нужно ничего скачивать или регистрироваться.",
  ],
  [
    "Можно ли пользоваться с телефона?",
    "Да. Лендинг, демо и платформа адаптированы для телефона. Предметы можно перемещать пальцем, а размеры и проёмы — редактировать через панель свойств.",
  ],
  [
    "Можно ли пользоваться бесплатно?",
    "Да. Текущая версия платформы доступна бесплатно: создай аккаунт, нарисуй свою комнату и сохраняй проекты. Демо на этой странице работает без регистрации и сохраняет план на устройстве.",
  ],
  [
    "Можно ли загрузить план квартиры?",
    "Да. В платформе можно загрузить PNG, JPG или PDF как подложку и откалибровать масштаб по известному расстоянию. Затем нарисуй стены, добавь двери и окна и расставь мебель.",
  ],
  [
    "Насколько точные размеры?",
    "Размеры мебели и комнаты заданы в сантиметрах и отображаются в одном масштабе. Демо оценивает прямоугольные границы мебели и зону открывания двери. Перед покупкой проверь реальные замеры.",
  ],
  [
    "Есть ли 3D-режим?",
    "Да, в платформе доступен базовый 3D-просмотр: объёмная комната, двери, окна и мебель по размерам твоего проекта. Можно вращать обзор, выбирать предметы и менять их свойства. Перетаскивание в 3D, GLB-модели и прогулка по комнате появятся позже. Слайдер на странице показывает концепцию оформления, а не снимок редактора.",
  ],
  [
    "Можно ли добавить свою мебель?",
    "Да. В платформе можно создать свою мебель с точными размерами или изменить габариты предмета из каталога. В демо на лендинге используется ограниченный каталог.",
  ],
  [
    "Подходит ли RoomFit для профессионалов?",
    "RoomFit подходит для предварительной проверки размеров и вариантов расстановки. Можно сравнивать планы, экспортировать результат и делиться ссылкой на просмотр. Для строительной документации нужен специализированный инструмент.",
  ],
];

function Logo() {
  return (
    <span className="logo">
      <img src="/assets/logo-mark-dark.png" width={38} height={38} alt="" />
      <span>
        Room<span>Fit</span>
      </span>
    </span>
  );
}
const platformUrl = (
  import.meta.env.VITE_PLATFORM_URL ||
  (import.meta.env.PROD
    ? "https://platform.roomfit.art"
    : "http://127.0.0.1:4181")
)
  .trim()
  .replace(/\/$/, "");
function StartLink({
  children = "Начать бесплатно",
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={`button button-gold ${className}`}
      href={`${platformUrl}/register`}
    >
      {children}
      <ArrowRight size={18} />
    </a>
  );
}
function SectionHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

function FeatureArt({ index }: { index: number }) {
  if (index === 3)
    return (
      <div className="feature-plans">
        <PlanPreview template={ROOMS.bedroomB} />
        <PlanPreview template={ROOMS.bedroom} />
      </div>
    );
  return (
    <div className={`feature-furniture feature-furniture-${index}`}>
      <div>
        <Furn type="sofa" w={122} h={62} tone="#c9c4ba" />
      </div>
      {index === 1 && <span className="feature-dimension">95 см</span>}
      {index === 2 && (
        <>
          <div className="feature-dresser">
            <Furn type="dresser" w={50} h={74} />
          </div>
          <span className="feature-collision" />
        </>
      )}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ["Создай комнату", "Введи размеры комнаты и начни с точного плана."],
    ["Добавь мебель", "Выбери из каталога или задай свои размеры."],
    ["Проверь расположение", "Перемещай мебель и следи за расстояниями."],
    ["Сохрани результат", "Возьми план в магазин или покажи семье."],
  ];
  return (
    <section id="how" className="how-section section-dark">
      <div className="container section-space">
        <SectionHeading title="Как это работает?">
          Создай свой первый план всего за несколько минут.
        </SectionHeading>
        <div className="steps-grid">
          {steps.map(([title, text], i) => (
            <article className="step" key={title}>
              <div className="step-heading">
                <span>{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
              <div className="step-visual">
                {i === 0 && (
                  <div className="step-form">
                    <b>Размеры комнаты</b>
                    <div className="step-inputs">
                      <span>
                        <small>Ширина</small>
                        <b>
                          400 <small>см</small>
                        </b>
                      </span>
                      <span>
                        <small>Длина</small>
                        <b>
                          320 <small>см</small>
                        </b>
                      </span>
                    </div>
                    <small>Единицы измерения</small>
                    <div className="step-units">
                      <span>
                        <i />
                        Сантиметры
                      </span>
                      <span>Метры</span>
                    </div>
                    <span className="step-faux-button">Создать комнату</span>
                  </div>
                )}
                {i === 1 && (
                  <div className="step-catalog">
                    <b>Каталог мебели</b>
                    <div>
                      {["bed1", "bed2", "sofa2", "sofa3"].map((key, k) => {
                        const c = CATALOG.find((c) => c.key === key)!;
                        return (
                          <span className={k === 1 ? "chosen" : ""} key={key}>
                            <FurnThumb
                              type={c.type}
                              w={c.w}
                              h={c.h}
                              size={67}
                            />
                            {k === 1 && (
                              <i>
                                <Plus size={13} />
                              </i>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {i === 2 && (
                  <>
                    <PlanPreview template={ROOMS.bedroom} selected="b1" />
                    <span className="pass-badge">
                      <CheckCircle2 size={27} />
                      <span>
                        <b>Проход: 85 см</b>
                        <small>Всё в порядке</small>
                      </span>
                    </span>
                  </>
                )}
                {i === 3 && (
                  <div className="step-export">
                    <b>Экспорт</b>
                    <div>
                      <FileImage size={25} />
                      <span>
                        <b>PNG</b>
                        <small>План в виде изображения</small>
                      </span>
                    </div>
                    <div>
                      <FileText size={25} />
                      <span>
                        <b>
                          PDF <em>в планах</em>
                        </b>
                        <small>План с размерами и мебелью</small>
                      </span>
                    </div>
                    <span className="step-faux-button">Скачать</span>
                  </div>
                )}
              </div>
              {i < 3 && <ArrowRight className="step-arrow" size={22} />}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeviceComposition() {
  return (
    <div
      className="devices"
      aria-label="RoomFit адаптируется к компьютеру, планшету и телефону"
    >
      <div className="device-laptop">
        <div className="device-top">
          <Logo />
        </div>
        <PlanPreview template={heroTemplate} dimensions />
      </div>
      <div className="device-base" />
      <div className="device-tablet">
        <PlanPreview template={ROOMS.bedroom} />
      </div>
      <div className="device-phone">
        <span />
        <PlanPreview template={ROOMS.bedroom} />
        <i />
      </div>
    </div>
  );
}

export default function App() {
  const mainRef = useLandingMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [modal, setModal] = useState<
    "login" | "roadmap" | "about" | "privacy" | "terms" | "editor" | null
  >(null);
  const [templateKey, setTemplateKey] = useState<string | undefined>();
  const [demoStatus, setDemoStatus] = useState(() =>
    analyze(ROOMS.bedroom.room, [], ROOMS.bedroom.doors),
  );
  const handleStatus = useCallback(
    (status: ReturnType<typeof analyze>) => setDemoStatus(status),
    [],
  );
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    const close = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const statusText =
    demoStatus.issues.find((i) => i.level === "error")?.text ??
    demoStatus.issues[0]?.text ??
    "Столкновений нет, проходы от 60 см";
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className={`site-header ${scrolled || menu ? "scrolled" : ""}`}>
        <span className="scroll-progress" aria-hidden="true" />
        <div className="container header-inner">
          <a href="#top" aria-label="RoomFit — на главную">
            <Logo />
          </a>
          <nav className="desktop-nav" aria-label="Главная навигация">
            {navigation.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <a
              className="button button-outline login-button"
              href={`${platformUrl}/login`}
            >
              Войти
            </a>
            <StartLink className="header-start" />
            <button
              className="icon-button menu-toggle"
              aria-label={menu ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={menu}
              aria-controls="mobile-navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {menu && (
          <nav
            className="mobile-nav"
            id="mobile-navigation"
            aria-label="Мобильная навигация"
          >
            {navigation.map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>
                {label}
                <ArrowRight size={16} />
              </a>
            ))}
            <a href={`${platformUrl}/login`} onClick={() => setMenu(false)}>
              Войти
              <ArrowRight size={16} />
            </a>
            <a href={`${platformUrl}/register`} onClick={() => setMenu(false)}>
              Начать бесплатно
              <ArrowRight size={16} />
            </a>
          </nav>
        )}
      </header>
      <main
        id="main"
        ref={mainRef}
        data-prerendered={import.meta.env.PROD ? "true" : undefined}
      >
        <section id="top" className="hero section-dark">
          <img
            className="hero-background"
            src="/assets/living-room.webp"
            srcSet={
              import.meta.env.PROD
                ? "/assets/living-room-400.webp 400w, /assets/living-room-800.webp 800w, /assets/living-room-1200.webp 1200w, /assets/living-room-1600.webp 1600w"
                : undefined
            }
            sizes="100vw"
            alt=""
            fetchPriority="high"
            width={1672}
            height={941}
          />
          <div className="hero-scrim" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="hero-tag">
                Планируй
                <i />
                Проверяй
                <i />
                Создавай уют
              </div>
              <h1>
                <span className="hero-title-desktop">
                  Проверь, поместится ли мебель в{" "}
                </span>
                <span className="hero-title-mobile">
                  Поместится ли мебель в{" "}
                </span>
                <span className="hero-title-accent">
                  твою комнату<span className="hero-title-mobile">?</span>
                </span>
              </h1>
              <p>
                Планировщик комнаты онлайн: создай план, расставь мебель в
                реальных размерах и убедись, что всё влезет — ещё до покупки.
              </p>
              <div className="hero-actions">
                <StartLink />
                <a className="watch-link" href="#demo">
                  <span>
                    <Play size={18} fill="currentColor" />
                  </span>
                  Смотреть, как работает
                </a>
              </div>
              <div className="hero-features">
                {heroFeatures.map(([Icon, text]) => (
                  <div key={text}>
                    <Icon size={26} strokeWidth={1.5} />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="hero-visual">
              <EditorPreview />
              <div className="hero-float">
                <span>
                  <Check size={16} />
                </span>
                <div>
                  <b>Всё поместится</b>
                  <small>Столкновений нет</small>
                </div>
              </div>
            </div>
            <div className="mobile-hero-benefits">
              <span>
                <Ruler size={17} />
                Точные размеры
              </span>
              <span>
                <Sofa size={17} />
                Каталог мебели
              </span>
              <span>
                <CheckCircle2 size={17} />
                Без пересечений
              </span>
            </div>
          </div>
        </section>
        <section id="features" className="section-light">
          <div className="container section-space">
            <SectionHeading title="Почему RoomFit?">
              Простой инструмент для реальных задач. Экономь время, деньги и
              нервы.
            </SectionHeading>
            <div className="features-grid">
              {[
                [
                  Home,
                  "Реальные размеры",
                  "Вся мебель и комнаты отображаются в точном масштабе.",
                ],
                [
                  Move,
                  "Удобный 2D-редактор",
                  "Перемещай, поворачивай и изменяй расположение предметов.",
                ],
                [
                  CircleAlert,
                  "Проверка пространства",
                  "Узнавай, где мебель пересекается и сколько места остаётся.",
                ],
                [
                  Bookmark,
                  "Сохраняй варианты",
                  "Планируй разные расстановки и выбирай удобную.",
                ],
              ].map(([Icon, title, description], i) => {
                const ArtIcon = Icon as typeof Home;
                return (
                  <article className="feature-card" key={String(title)}>
                    <div className="feature-art">
                      <span className="feature-icon">
                        <ArtIcon size={24} strokeWidth={1.6} />
                      </span>
                      <FeatureArt index={i} />
                    </div>
                    <h3>{String(title)}</h3>
                    <p>{String(description)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
        <HowItWorks />
        <section id="demo" className="demo-section section-light">
          <div className="container split-layout section-space">
            <div className="section-copy">
              <Eyebrow>Попробуй прямо сейчас</Eyebrow>
              <h2>Интерактивное демо</h2>
              <p>
                Перетащи кровать, шкаф или стол и посмотри, сколько места
                останется. Двойной клик поворачивает предмет, а нажатие на
                карточку в каталоге добавляет новый.
              </p>
              <p className="demo-description">
                Это демоверсия редактора RoomFit. План можно сохранить на этом
                устройстве.
              </p>
              <div
                className={`status-card ${demoStatus.errors ? "error" : demoStatus.warnings ? "warning" : "ok"}`}
                role="status"
              >
                {demoStatus.errors || demoStatus.warnings ? (
                  <CircleAlert size={21} />
                ) : (
                  <CheckCircle2 size={21} />
                )}
                <span>{statusText}</span>
              </div>
              <button
                className="button button-gold"
                onClick={() => setModal("editor")}
              >
                Открыть демо-редактор
                <ArrowRight size={18} />
              </button>
            </div>
            <DemoEditor templateKey={templateKey} onStatus={handleStatus} />
          </div>
        </section>
        <section id="examples" className="examples-section section-light">
          <div className="container section-space">
            <SectionHeading title="Примеры комнат">
              Готовые решения для разных помещений. Используй как шаблон или
              вдохновение.
            </SectionHeading>
            <div className="gallery-grid">
              {gallery.map(([key, name]) => {
                const t = ROOMS[key];
                return (
                  <a
                    className="gallery-card"
                    key={key}
                    href="#demo"
                    onClick={() => setTemplateKey(key)}
                  >
                    <PlanPreview template={t} />
                    <div className="gallery-caption">
                      <div>
                        <h3>{name}</h3>
                        <span>
                          {(t.room.w / 100).toFixed(1).replace(".", ",")} ×{" "}
                          {(t.room.h / 100).toFixed(1).replace(".", ",")} м
                        </span>
                      </div>
                      <span className="gallery-arrow">
                        <ArrowRight size={17} />
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
        <section className="compare-section section-dark">
          <div className="container compare-layout section-space">
            <div className="section-copy">
              <Eyebrow>Сравнивай и выбирай</Eyebrow>
              <h2>Несколько вариантов одной комнаты</h2>
              <p>
                Сравни разные расстановки и выбери лучший вариант. Удобно для
                семьи, ремонта или покупки новой мебели.
              </p>
              <StartLink>Попробовать расстановку</StartLink>
            </div>
            <div className="compare-cards">
              {[false, true].map((good) => {
                const t = ROOMS[good ? "bedroom" : "bedroomB"];
                return (
                  <article
                    className={`compare-card ${good ? "good" : "bad"}`}
                    key={String(good)}
                  >
                    <span className="compare-badge">
                      {good ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <CircleAlert size={16} />
                      )}
                      {good ? "Оптимально" : "Неудобно"}
                    </span>
                    <PlanPreview
                      template={t}
                      dimensions
                      status={
                        good
                          ? undefined
                          : analyze(t.room, t.items, t.doors).status
                      }
                    />
                    <div className="compare-notes">
                      <span>
                        {good ? <CheckCircle2 /> : <CircleAlert />}
                        {good
                          ? "Все проходы от 60 см"
                          : "Проход 40 см — слишком мало"}
                      </span>
                      <span>
                        {good ? <CheckCircle2 /> : <CircleAlert />}
                        {good
                          ? "Дверь свободно открывается"
                          : "Кресло мешает открыть дверь"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
        <section className="roadmap-section section-dark">
          <div className="container split-layout section-space">
            <div className="section-copy">
              <Eyebrow>3D · ранний доступ</Eyebrow>
              <h2>Увидь свою комнату в&nbsp;3D</h2>
              <p>
                Построй точный план в 2D и переключись в 3D внутри своего
                проекта. Вращай обзор, выбирай мебель и меняй размеры через
                общую панель свойств.
              </p>
              <p className="roadmap-note">
                Слайдер показывает концепцию оформления. Базовый 3D-просмотр уже
                работает в платформе; подробные модели ещё в разработке.
              </p>
              <button
                className="button button-gold"
                onClick={() => setModal("roadmap")}
              >
                Что будет в 3D
                <ArrowRight size={18} />
              </button>
            </div>
            <ComparisonSlider />
          </div>
        </section>
        <section id="faq" className="faq-section section-light">
          <div className="container section-space">
            <SectionHeading title="Часто задаваемые вопросы">
              Всё, что нужно знать перед первым планом.
            </SectionHeading>
            <div className="faq-grid">
              {faq.map(([question, answer], i) => (
                <div
                  className={`faq-item ${openFaq === i ? "open" : ""}`}
                  key={question}
                >
                  <h3>
                    <button
                      id={`faq-q-${i}`}
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      aria-expanded={openFaq === i}
                      aria-controls={`faq-a-${i}`}
                    >
                      {question}
                      <Plus size={20} />
                    </button>
                  </h3>
                  <div
                    className="faq-answer"
                    id={`faq-a-${i}`}
                    role="region"
                    aria-labelledby={`faq-q-${i}`}
                    aria-hidden={openFaq !== i}
                    inert={openFaq !== i}
                  >
                    <div className="faq-answer-inner">
                      <p>{answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-guides section-light">
          <div className="container section-space">
            <SectionHeading title="Планы, которые можно примерить">
              Разбираем размеры, двери и мебель на конкретных примерах.{" "}
              <a href="/rukovodstva/">Все планы и инструкции →</a>
            </SectionHeading>
            <GuideCards />
          </div>
        </section>
        <section className="final-cta section-dark">
          <div className="container split-layout section-space">
            <div className="section-copy">
              <h2>
                Твоя идеальная расстановка{" "}
                <span>начинается с точного плана</span>
              </h2>
              <p>
                Создай первую комнату бесплатно и убедись, что всё поместится.
              </p>
              <StartLink>Создать первую комнату</StartLink>
            </div>
            <DeviceComposition />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <a href="#top">
              <Logo />
            </a>
            <p>Твой дом в правильных размерах.</p>
          </div>
          <nav aria-label="Навигация внизу страницы">
            <a href="/o-proekte/">О проекте</a>
            <a href="#features">Возможности</a>
            <a href="#examples">Примеры</a>
            <a href="#faq">Помощь</a>
            <a href="/rukovodstva/">Планы и инструкции</a>
          </nav>
          <div className="footer-legal">
            <span>© 2026 RoomFit</span>
            <div>
              <a href="/konfidencialnost/">Конфиденциальность</a>
              <a href="/usloviya/">Условия использования</a>
            </div>
          </div>
        </div>
      </footer>
      {modal && (
        <Modal
          title={
            modal === "editor"
              ? "План комнаты · демо"
              : modal === "login"
                ? "Добро пожаловать в RoomFit"
                : modal === "roadmap"
                  ? "3D: сейчас и дальше"
                  : modal === "privacy"
                    ? "Конфиденциальность демо"
                    : modal === "terms"
                      ? "Условия использования демо"
                      : "О проекте RoomFit"
          }
          wide={modal === "editor"}
          onClose={() => setModal(null)}
        >
          {modal === "editor" ? (
            <DemoEditor templateKey={templateKey} />
          ) : (
            <div className="modal-copy">
              {modal === "login" && (
                <>
                  <p>
                    Сейчас RoomFit можно попробовать без регистрации. Аккаунты и
                    облачное сохранение появятся вместе с полноценной
                    платформой.
                  </p>
                  <p>
                    В демо уже доступны расстановка мебели, проверка пересечений
                    и скачивание плана.
                  </p>
                </>
              )}
              {modal === "roadmap" && (
                <>
                  <p>
                    Уже доступен базовый 3D-просмотр комнаты, стен, дверей, окон
                    и мебели. Размеры, выбор предметов, Undo/Redo и сохранение
                    общие с 2D.
                  </p>
                  <p>
                    Следующие этапы — подробные GLB-модели, перетаскивание
                    мебели в 3D, прогулка по комнате и совместный вид 2D/3D.
                    Точной даты пока нет. Для текущего 3D открой свой проект в
                    платформе и нажми «3D».
                  </p>
                </>
              )}
              {modal === "about" && (
                <>
                  <p>
                    RoomFit — пет-проект для планирования комнат и расстановки
                    мебели. Его главная задача — помочь ответить на вопрос:
                    «Поместится ли эта мебель в мою комнату?»
                  </p>
                  <p>
                    Создай план, добавь мебель, проверь расстояния и сохрани
                    результат. Просто. Точно. Удобно.
                  </p>
                </>
              )}
              {modal === "privacy" && (
                <>
                  <p>
                    Эта версия работает в твоём браузере. При нажатии
                    «Сохранить» план записывается в локальное хранилище этого
                    устройства и не отправляется на сервер.
                  </p>
                  <p>
                    Чтобы удалить сохранённый план, очисти данные сайта в
                    настройках браузера. Форм регистрации, аналитики и подписки
                    на рассылку в демо нет.
                  </p>
                </>
              )}
              {modal === "terms" && (
                <>
                  <p>
                    Демо предназначено для предварительной проверки расстановки.
                    Размеры задаются в сантиметрах; пересечения оцениваются по
                    прямоугольным границам предметов.
                  </p>
                  <p>
                    Перед покупкой мебели проверь замеры комнаты, дверей и
                    предметов. Аккаунты, PDF, загрузка планов и базовый
                    3D-просмотр доступны в отдельной платформе.
                  </p>
                </>
              )}
              <a
                className="button button-gold"
                href="#demo"
                onClick={() => setModal(null)}
              >
                Попробовать демо
                <ArrowRight size={18} />
              </a>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

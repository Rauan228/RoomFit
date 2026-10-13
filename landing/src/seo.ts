import { GUIDES, guidePath } from "./content/guides";
import { INFO_PAGES, type InfoKey } from "./GuidePage";
export const ORIGIN = "https://roomfit.art";
export const PUBLIC_PATHS = [
  "/",
  "/rukovodstva/",
  ...GUIDES.map(guidePath),
  ...Object.keys(INFO_PAGES).map((key) => `/${key}/`),
];
export function normalizedPath(path: string) {
  const clean = path.split("?")[0];
  return clean === "/" ? "/" : `/${clean.replace(/^\/+|\/+$/g, "")}/`;
}
export function metadata(path: string) {
  const route = normalizedPath(path);
  const guide = GUIDES.find((g) => guidePath(g) === route);
  const info = INFO_PAGES[route.slice(1, -1) as InfoKey];
  const notFound = !PUBLIC_PATHS.includes(route);
  const title =
    guide?.title ||
    (info
      ? `${info.title} — RoomFit`
      : route === "/rukovodstva/"
        ? "Планы комнат и инструкции по расстановке мебели — RoomFit"
        : notFound
          ? "Страница не найдена — RoomFit"
          : "RoomFit — планировщик комнаты онлайн и расстановка мебели");
  const description =
    guide?.description ||
    info?.description ||
    (route === "/rukovodstva/"
      ? "Практические инструкции и готовые планы RoomFit: спальня 12 м², маленькая комната, расстановка мебели, проверка дивана и замеры."
      : "Создай 2D-план комнаты онлайн, добавь двери и окна, расставь мебель по реальным размерам. Проверь пересечения и сохрани варианты бесплатно в RoomFit.");
  const url = ORIGIN + route;
  const image = `${ORIGIN}/assets/guides/${guide?.slug || "roomfit-cover"}.png`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      name: "RoomFit",
      url: ORIGIN,
      logo: `${ORIGIN}/assets/logo-mark-dark.png`,
      sameAs: ["https://github.com/Rauan228/RoomFit"],
    },
    {
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      name: "RoomFit",
      url: `${ORIGIN}/`,
      inLanguage: "ru",
      publisher: { "@id": `${ORIGIN}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: title,
      description,
      inLanguage: "ru",
      isPartOf: { "@id": `${ORIGIN}/#website` },
    },
  ];
  if (route === "/")
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${ORIGIN}/#app`,
      name: "RoomFit",
      url: "https://platform.roomfit.art",
      applicationCategory: "DesignApplication",
      operatingSystem: "Web browser",
      description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
      featureList: [
        "2D-план комнаты с размерами",
        "Двери и окна",
        "Расстановка мебели",
        "Проверка пересечений",
        "Сохранение вариантов",
        "Экспорт плана",
      ],
      publisher: { "@id": `${ORIGIN}/#organization` },
    });
  if (guide)
    graph.push({
      "@type": "Article",
      "@id": `${url}#article`,
      headline: guide.label,
      description,
      image,
      inLanguage: "ru",
      author: { "@id": `${ORIGIN}/#organization` },
      publisher: { "@id": `${ORIGIN}/#organization` },
      mainEntityOfPage: { "@id": `${url}#webpage` },
    });
  if (route !== "/" && !notFound)
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Главная",
          item: `${ORIGIN}/`,
        },
        ...(guide
          ? [
              {
                "@type": "ListItem",
                position: 2,
                name: "Планы и инструкции",
                item: `${ORIGIN}/rukovodstva/`,
              },
            ]
          : []),
        {
          "@type": "ListItem",
          position: guide ? 3 : 2,
          name: guide?.label || info?.title || "Планы и инструкции",
          item: url,
        },
      ],
    });
  return { route, title, description, url, image, notFound, graph };
}

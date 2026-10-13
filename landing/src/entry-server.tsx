import { renderToString, renderToStaticMarkup } from "react-dom/server";
import { StrictMode } from "react";
import Site from "./Site";
import GuidePlan from "./components/GuidePlan";
import { metadata, PUBLIC_PATHS } from "./seo";
import { GUIDES } from "./content/guides";
import { STARTER_ROOMS, type StarterKey } from "../../shared/starter-rooms";
import { createStarter } from "../../shared/create-starter";
export { PUBLIC_PATHS, GUIDES };
export function render(path: string) {
  const meta = metadata(path);
  const head = renderToStaticMarkup(
    <>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <meta
        name="robots"
        content={
          meta.notFound
            ? "noindex,follow"
            : "index,follow,max-image-preview:large"
        }
      />
      {!meta.notFound && <link rel="canonical" href={meta.url} />}
      <meta property="og:site_name" content="RoomFit" />
      <meta property="og:locale" content="ru_RU" />
      <meta
        property="og:type"
        content={meta.route === "/" ? "website" : "article"}
      />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={meta.url} />
      <meta property="og:image" content={meta.image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content="RoomFit — план комнаты с мебелью и размерами"
      />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={meta.image} />
      {!meta.notFound && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": meta.graph,
            }).replace(/</g, "\\u003c"),
          }}
        />
      )}
    </>,
  );
  return {
    html: renderToString(
      <StrictMode>
        <Site path={path} />
      </StrictMode>,
    ),
    head,
  };
}
export function planSvg(template: StarterKey) {
  return renderToStaticMarkup(<GuidePlan template={template} cover />);
}
export function starterDocuments() {
  return Object.fromEntries(
    Object.keys(STARTER_ROOMS).map((key) => [
      key,
      createStarter(key as StarterKey),
    ]),
  );
}

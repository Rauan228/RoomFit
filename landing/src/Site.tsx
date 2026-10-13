import { useEffect } from "react";
import App from "./App";
import GuidePage, {
  GuidesIndex,
  INFO_PAGES,
  InfoPage,
  NotFound,
  type InfoKey,
} from "./GuidePage";
import { GUIDES, guidePath } from "./content/guides";
import { metadata } from "./seo";

export default function Site({ path }: { path: string }) {
  const meta = metadata(path);
  useEffect(() => {
    document.title = meta.title;
  }, [meta.title]);
  const guide = GUIDES.find((g) => guidePath(g) === meta.route);
  if (guide) return <GuidePage guide={guide} />;
  if (meta.route === "/rukovodstva/") return <GuidesIndex />;
  const key = meta.route.slice(1, -1) as InfoKey;
  if (Object.hasOwn(INFO_PAGES, key)) return <InfoPage page={key} />;
  return meta.notFound ? <NotFound /> : <App />;
}

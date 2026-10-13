import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import Site from "./Site";
import "./styles.css";
import "./motion.css";
import "./guides.css";
import { initializeAnalytics } from "../../shared/analytics";

const root = document.getElementById("root")!;
const site = (
  <StrictMode>
    <Site path={window.location.pathname} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, site);
else createRoot(root).render(site);
initializeAnalytics();

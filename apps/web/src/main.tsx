import "@fontsource-variable/nunito";
import "./styles/global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { initI18n } from "./i18n";

// Browser language for now; the config locale is applied via `applyLocale` (T-13).
initI18n();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

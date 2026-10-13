import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// React DOM mounts browser components into the HTML page's root element
const container = document.getElementById("root");
if (!container) throw new Error("The page is missing its React root element");

// reuse the root during Bun hot reloads so React does not mount it twice
const root = import.meta.hot
  ? (import.meta.hot.data.root ??= createRoot(container))
  : createRoot(container);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing.");
document.documentElement.classList.toggle(
  "overlay-mode",
  window.location.pathname.startsWith("/overlay"),
);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

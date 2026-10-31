import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

console.log("[web] booting");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

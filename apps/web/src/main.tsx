import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@karaoke-tube/ui/styles";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

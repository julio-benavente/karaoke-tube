import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@karaoke-tube/ui/styles";
import { Gallery } from "./dev/Gallery";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);

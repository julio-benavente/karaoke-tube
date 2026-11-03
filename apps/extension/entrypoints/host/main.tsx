import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@karaoke-tube/ui/styles";
import { HostApp } from "./HostApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HostApp />
  </StrictMode>,
);

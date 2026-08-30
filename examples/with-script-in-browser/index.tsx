import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@causcape/causcape/index.css";

import type * as TCauscape from "@causcape/causcape";

import App from "./components/ExampleApp";

declare global {
  interface Window {
    CauscapeLib: typeof TCauscape;
  }
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
const { Causcape } = window.CauscapeLib;
root.render(
  <StrictMode>
    <App
      appTitle={"Causcape Example"}
      useCustom={(api: any, args?: any[]) => {}}
      causcapeLib={window.CauscapeLib}
    >
      <Causcape />
    </App>
  </StrictMode>,
);

import React from "react";
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import initialData from "@site/src/initialData";
import { useColorMode } from "@docusaurus/theme-common";

import "@causcape/causcape/index.css";

let CauscapeComp = {};
if (ExecutionEnvironment.canUseDOM) {
  CauscapeComp = require("@causcape/causcape");
}
const Causcape = React.forwardRef((props, ref) => {
  if (!window.CAUSCAPE_ASSET_PATH) {
    window.CAUSCAPE_ASSET_PATH =
      "https://esm.sh/@causcape/causcape@0.18.0/dist/prod/";
  }

  const { colorMode } = useColorMode();
  return <CauscapeComp.Causcape theme={colorMode} {...props} ref={ref} />;
});
// Add react-live imports you need here
const CauscapeScope = {
  React,
  ...React,
  Causcape,
  Footer: CauscapeComp.Footer,
  useDevice: CauscapeComp.useDevice,
  MainMenu: CauscapeComp.MainMenu,
  WelcomeScreen: CauscapeComp.WelcomeScreen,
  LiveCollaborationTrigger: CauscapeComp.LiveCollaborationTrigger,
  Sidebar: CauscapeComp.Sidebar,
  exportToCanvas: CauscapeComp.exportToCanvas,
  initialData,
  useI18n: CauscapeComp.useI18n,
  convertToCauscapeElements: CauscapeComp.convertToCauscapeElements,
  CaptureUpdateAction: CauscapeComp.CaptureUpdateAction,
};

export default CauscapeScope;

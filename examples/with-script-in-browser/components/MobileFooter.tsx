import React from "react";

import type * as TCauscape from "@causcape/causcape";
import type { CauscapeImperativeAPI } from "@causcape/causcape/types";

import CustomFooter from "./CustomFooter";

const MobileFooter = ({
  causcapeAPI,
  causcapeLib,
}: {
  causcapeAPI: CauscapeImperativeAPI;
  causcapeLib: typeof TCauscape;
}) => {
  const { useEditorInterface, Footer } = causcapeLib;

  const editorInterface = useEditorInterface();
  if (editorInterface.formFactor === "phone") {
    return (
      <Footer>
        <CustomFooter causcapeAPI={causcapeAPI} causcapeLib={causcapeLib} />
      </Footer>
    );
  }
  return null;
};
export default MobileFooter;

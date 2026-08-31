import { useState, useLayoutEffect } from "react";

import { THEME } from "@causcape/common";

import { useEditorInterface, useCauscapeContainer } from "../components/App";
import { useUIAppState } from "../context/ui-appState";

export const useCreatePortalContainer = (opts?: {
  className?: string;
  parentSelector?: string;
}) => {
  const [div, setDiv] = useState<HTMLDivElement | null>(null);

  const editorInterface = useEditorInterface();
  const { theme } = useUIAppState();

  const { container: causcapeContainer } = useCauscapeContainer();

  useLayoutEffect(() => {
    if (div) {
      div.className = "";
      div.classList.add("causcape", ...(opts?.className?.split(/\s+/) || []));
      div.classList.toggle(
        "causcape--mobile",
        editorInterface.formFactor === "phone",
      );
      div.classList.toggle("theme--dark", theme === THEME.DARK);
    }
  }, [div, theme, editorInterface.formFactor, opts?.className]);

  useLayoutEffect(() => {
    const ownerDocument = causcapeContainer?.ownerDocument;
    const container = opts?.parentSelector
      ? causcapeContainer?.querySelector(opts.parentSelector)
      : ownerDocument?.body;

    if (!container || !ownerDocument) {
      return;
    }

    const div = ownerDocument.createElement("div");

    container.appendChild(div);

    setDiv(div);

    return () => {
      container.removeChild(div);
    };
  }, [causcapeContainer, opts?.parentSelector]);

  return div;
};

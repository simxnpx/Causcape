import { getDefaultAppState } from "../../excalidraw/appState";
import {
  restoreAppState,
  restoreElements,
} from "../../excalidraw/data/restore";
import { exportToSvg } from "../../excalidraw/scene/export";

import type { Project } from "@causcape/core";
import type { BinaryFiles } from "../../excalidraw/types";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "../../element/src/types";

declare global {
  interface Window {
    renderCauscapeProject(project: Project): Promise<string>;
  }
}

window.renderCauscapeProject = async (project) => {
  const elements = restoreElements(
    project.canvas.scene.elements as unknown as ExcalidrawElement[],
    null,
    { repairBindings: true },
  ).filter((element) => !element.isDeleted) as NonDeletedExcalidrawElement[];
  const appState = restoreAppState(
    project.canvas.scene.appState as never,
    getDefaultAppState(),
  );
  const svg = await exportToSvg(
    elements,
    {
      ...appState,
      exportBackground: true,
      exportPadding: 24,
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    },
    project.canvas.scene.files as unknown as BinaryFiles,
    { skipInliningFonts: true },
  );
  return svg.outerHTML;
};

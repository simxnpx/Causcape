import type { Project } from "@causcape/core";

import { getDefaultAppState } from "../../causcape/appState";
import { restoreAppState, restoreElements } from "../../causcape/data/restore";
import { exportToSvg } from "../../causcape/scene/export";

import type { BinaryFiles } from "../../causcape/types";
import type {
  CauscapeElement,
  NonDeletedCauscapeElement,
} from "../../element/src/types";

declare global {
  interface Window {
    renderCauscapeProject(project: Project): Promise<string>;
  }
}

window.renderCauscapeProject = async (project) => {
  const elements = restoreElements(
    project.canvas.scene.elements as unknown as CauscapeElement[],
    null,
    { repairBindings: true },
  ).filter((element) => !element.isDeleted) as NonDeletedCauscapeElement[];
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

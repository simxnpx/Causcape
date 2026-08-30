import { sceneCoordsToViewportCoords } from "@causcape/common";
import { getElementAbsoluteCoords } from "@causcape/element";

import type {
  ElementsMap,
  NonDeletedCauscapeElement,
} from "@causcape/element/types";

import { useCauscapeAppState } from "../components/App";

import "./ElementCanvasButtons.scss";

import type { AppState } from "../types";

const CONTAINER_PADDING = 5;

const getContainerCoords = (
  element: NonDeletedCauscapeElement,
  appState: AppState,
  elementsMap: ElementsMap,
) => {
  const [x1, y1] = getElementAbsoluteCoords(element, elementsMap);
  const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
    { sceneX: x1 + element.width, sceneY: y1 },
    appState,
  );
  const x = viewportX - appState.offsetLeft + 10;
  const y = viewportY - appState.offsetTop;
  return { x, y };
};

export const ElementCanvasButtons = ({
  children,
  element,
  elementsMap,
}: {
  children: React.ReactNode;
  element: NonDeletedCauscapeElement;
  elementsMap: ElementsMap;
}) => {
  const appState = useCauscapeAppState();

  if (
    appState.contextMenu ||
    appState.newElement ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled
  ) {
    return null;
  }

  const { x, y } = getContainerCoords(element, appState, elementsMap);

  return (
    <div
      className="causcape-canvas-buttons"
      style={{
        top: `${y}px`,
        left: `${x}px`,
        // width: CONTAINER_WIDTH,
        padding: CONTAINER_PADDING,
      }}
    >
      {children}
    </div>
  );
};

import rough from "roughjs/bin/rough";

import {
  type GlobalPoint,
  isRightAngleRads,
  lineSegment,
  pointFrom,
  pointRotateRads,
  type Radians,
} from "@excalidraw/math";

import {
  BOUND_TEXT_PADDING,
  DEFAULT_REDUCED_GLOBAL_ALPHA,
  ELEMENT_READY_TO_ERASE_OPACITY,
  FRAME_STYLE,
  DARK_THEME_FILTER,
  MIME_TYPES,
  THEME,
  distance,
  getFontString,
  isRTL,
  getVerticalOffset,
  invariant,
  applyDarkModeFilter,
  isSafari,
} from "@excalidraw/common";

import type {
  AppState,
  StaticCanvasAppState,
  Zoom,
  InteractiveCanvasAppState,
  ElementsPendingErasure,
  PendingExcalidrawElements,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";

import type {
  StaticCanvasRenderConfig,
  RenderableElementsMap,
  InteractiveCanvasRenderConfig,
} from "@excalidraw/excalidraw/scene/types";

import { getElementAbsoluteCoords, getElementBounds } from "./bounds";
import { getUncroppedImageElement } from "./cropElement";
import { LinearElementEditor } from "./linearElementEditor";
import {
  getBoundTextElement,
  getContainerCoords,
  getContainerElement,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
} from "./textElement";
import { getLineHeightInPx } from "./textMeasurements";
import {
  isTextElement,
  isLinearElement,
  isFreeDrawElement,
  isInitializedImageElement,
  isArrowElement,
  hasBoundTextElement,
  isMagicFrameElement,
  isImageElement,
} from "./typeChecks";
import { getContainingFrame } from "./frame";
import { getCornerRadius } from "./utils";

import { ShapeCache } from "./shape";
import {
  CAUSCAPE_NODE_STYLE,
  getCauscapeEdgeLabel,
  getCauscapeEdgeLabelBounds,
  getCauscapeEdgeLabelAnchor,
  getCauscapeNodeRenderData,
  getCauscapeReferenceLabel,
  wrapCauscapeEdgeLabel,
  wrapCauscapeText,
} from "./causcape";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElementWithContainer,
  ExcalidrawFrameLikeElement,
  NonDeletedSceneElementsMap,
  ElementsMap,
  ExcalidrawCauscapeNodeElement,
  ExcalidrawCauscapeEdgeElement,
} from "./types";

import type { RoughCanvas } from "roughjs/bin/canvas";

const isPendingImageElement = (
  element: ExcalidrawElement,
  renderConfig: StaticCanvasRenderConfig,
) =>
  isInitializedImageElement(element) &&
  !renderConfig.imageCache.has(element.fileId);

const getCauscapeEdgeLabelPadding = (
  element: ExcalidrawCauscapeEdgeElement,
): number => {
  const bounds = getCauscapeEdgeLabelBounds(
    element.points.map(([x, y]) => [x, y] as [number, number]),
    element.causcape,
    // Use a conservative estimate here because the element canvas is clipped
    // before the real font metrics are available to drawCauscapeEdgeOnCanvas.
    { offset: 16, characterWidth: 8 },
  );
  if (!bounds) {
    return 20;
  }
  return Math.max(
    20,
    -bounds.x,
    bounds.x + bounds.width - element.width,
    -bounds.y,
    bounds.y + bounds.height - element.height,
  );
};

const getCanvasPadding = (element: ExcalidrawElement) => {
  switch (element.type) {
    case "freedraw":
      return element.strokeWidth * 12;
    case "text":
      return element.fontSize / 2;
    case "arrow":
      if (element.endArrowhead || element.endArrowhead) {
        return 40;
      }
      return 20;
    case "causcape-edge":
      return getCauscapeEdgeLabelPadding(element);
    default:
      return 20;
  }
};

export const getRenderOpacity = (
  element: ExcalidrawElement,
  containingFrame: ExcalidrawFrameLikeElement | null,
  elementsPendingErasure: ElementsPendingErasure,
  pendingNodes: Readonly<PendingExcalidrawElements> | null,
  globalAlpha: number = 1,
) => {
  // multiplying frame opacity with element opacity to combine them
  // (e.g. frame 50% and element 50% opacity should result in 25% opacity)
  let opacity =
    (((containingFrame?.opacity ?? 100) * element.opacity) / 10000) *
    globalAlpha;

  // if pending erasure, multiply again to combine further
  // (so that erasing always results in lower opacity than original)
  if (
    elementsPendingErasure.has(element.id) ||
    (pendingNodes && pendingNodes.some((node) => node.id === element.id)) ||
    (containingFrame && elementsPendingErasure.has(containingFrame.id))
  ) {
    opacity *= ELEMENT_READY_TO_ERASE_OPACITY / 100;
  }

  return opacity;
};

export interface ExcalidrawElementWithCanvas {
  element: ExcalidrawElement | ExcalidrawTextElement;
  canvas: HTMLCanvasElement;
  theme: AppState["theme"];
  scale: number;
  zoomValue: AppState["zoom"]["value"];
  canvasOffsetX: number;
  canvasOffsetY: number;
  imageCrop: ExcalidrawImageElement["crop"] | null;
  containingFrameOpacity: number;
}

const cappedElementCanvasSize = (
  element: NonDeletedExcalidrawElement,
  elementsMap: ElementsMap,
  zoom: Zoom,
): {
  width: number;
  height: number;
  scale: number;
} => {
  // these limits are ballpark, they depend on specific browsers and device.
  // We've chosen lower limits to be safe. We might want to change these limits
  // based on browser/device type, if we get reports of low quality rendering
  // on zoom.
  //
  // ~ safari mobile canvas area limit
  const AREA_LIMIT = 16777216;
  // ~ safari width/height limit based on developer.mozilla.org.
  const WIDTH_HEIGHT_LIMIT = 32767;

  const padding = getCanvasPadding(element);

  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  const elementWidth =
    isLinearElement(element) || isFreeDrawElement(element)
      ? distance(x1, x2)
      : element.width;
  const elementHeight =
    isLinearElement(element) || isFreeDrawElement(element)
      ? distance(y1, y2)
      : element.height;

  let width = elementWidth * window.devicePixelRatio + padding * 2;
  let height = elementHeight * window.devicePixelRatio + padding * 2;

  let scale: number = zoom.value;

  // rescale to ensure width and height is within limits
  if (
    width * scale > WIDTH_HEIGHT_LIMIT ||
    height * scale > WIDTH_HEIGHT_LIMIT
  ) {
    scale = Math.min(WIDTH_HEIGHT_LIMIT / width, WIDTH_HEIGHT_LIMIT / height);
  }

  // rescale to ensure canvas area is within limits
  if (width * height * scale * scale > AREA_LIMIT) {
    scale = Math.sqrt(AREA_LIMIT / (width * height));
  }

  width = Math.floor(width * scale);
  height = Math.floor(height * scale);

  return { width, height, scale };
};

const generateElementCanvas = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedSceneElementsMap,
  zoom: Zoom,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
): ExcalidrawElementWithCanvas | null => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const padding = getCanvasPadding(element);

  const { width, height, scale } = cappedElementCanvasSize(
    element,
    elementsMap,
    zoom,
  );

  if (!width || !height) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;

  let canvasOffsetX = -100;
  let canvasOffsetY = 0;

  if (isLinearElement(element) || isFreeDrawElement(element)) {
    const [x1, y1] = getElementAbsoluteCoords(element, elementsMap);

    canvasOffsetX =
      element.x > x1
        ? distance(element.x, x1) * window.devicePixelRatio * scale
        : 0;

    canvasOffsetY =
      element.y > y1
        ? distance(element.y, y1) * window.devicePixelRatio * scale
        : 0;

    context.translate(canvasOffsetX, canvasOffsetY);
  }

  context.save();
  context.translate(padding * scale, padding * scale);
  context.scale(
    window.devicePixelRatio * scale,
    window.devicePixelRatio * scale,
  );

  const rc = rough.canvas(canvas);

  drawElementOnCanvas(element, rc, context, renderConfig);

  context.restore();

  return {
    element,
    canvas,
    theme: appState.theme,
    scale,
    zoomValue: zoom.value,
    canvasOffsetX,
    canvasOffsetY,
    containingFrameOpacity:
      getContainingFrame(element, elementsMap)?.opacity || 100,
    imageCrop: isImageElement(element) ? element.crop : null,
  };
};

export const DEFAULT_LINK_SIZE = 14;

const IMAGE_PLACEHOLDER_IMG =
  typeof document !== "undefined"
    ? document.createElement("img")
    : ({ src: "" } as HTMLImageElement); // mock image element outside of browser

IMAGE_PLACEHOLDER_IMG.src = `data:${MIME_TYPES.svg},${encodeURIComponent(
  `<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="image" class="svg-inline--fa fa-image fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#888" d="M464 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48zM112 120c-30.928 0-56 25.072-56 56s25.072 56 56 56 56-25.072 56-56-25.072-56-56-56zM64 384h384V272l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L208 320l-55.515-55.515c-4.686-4.686-12.284-4.686-16.971 0L64 336v48z"></path></svg>`,
)}`;

const IMAGE_ERROR_PLACEHOLDER_IMG =
  typeof document !== "undefined"
    ? document.createElement("img")
    : ({ src: "" } as HTMLImageElement); // mock image element outside of browser

IMAGE_ERROR_PLACEHOLDER_IMG.src = `data:${MIME_TYPES.svg},${encodeURIComponent(
  `<svg viewBox="0 0 668 668" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2"><path d="M464 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48ZM112 120c-30.928 0-56 25.072-56 56s25.072 56 56 56 56-25.072 56-56-25.072-56-56-56ZM64 384h384V272l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L208 320l-55.515-55.515c-4.686-4.686-12.284-4.686-16.971 0L64 336v48Z" style="fill:#888;fill-rule:nonzero" transform="matrix(.81709 0 0 .81709 124.825 145.825)"/><path d="M256 8C119.034 8 8 119.033 8 256c0 136.967 111.034 248 248 248s248-111.034 248-248S392.967 8 256 8Zm130.108 117.892c65.448 65.448 70 165.481 20.677 235.637L150.47 105.216c70.204-49.356 170.226-44.735 235.638 20.676ZM125.892 386.108c-65.448-65.448-70-165.481-20.677-235.637L361.53 406.784c-70.203 49.356-170.226 44.736-235.638-20.676Z" style="fill:#888;fill-rule:nonzero" transform="matrix(.30366 0 0 .30366 506.822 60.065)"/></svg>`,
)}`;

const drawImagePlaceholder = (
  element: ExcalidrawImageElement,
  context: CanvasRenderingContext2D,
  theme: StaticCanvasRenderConfig["theme"],
) => {
  context.fillStyle = theme === THEME.DARK ? "#2E2E2E" : "#E7E7E7";
  context.fillRect(0, 0, element.width, element.height);

  const imageMinWidthOrHeight = Math.min(element.width, element.height);

  const size = Math.min(
    imageMinWidthOrHeight,
    Math.min(imageMinWidthOrHeight * 0.4, 100),
  );

  context.drawImage(
    element.status === "error"
      ? IMAGE_ERROR_PLACEHOLDER_IMG
      : IMAGE_PLACEHOLDER_IMG,
    element.width / 2 - size / 2,
    element.height / 2 - size / 2,
    size,
    size,
  );
};

// ---------------------------------------------------------------------------
// Causcape node github rendering — cache Path2D, no per-frame allocation
// ---------------------------------------------------------------------------
const GITHUB_OCTICON_PATH =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";

let _githubIconPath2D: Path2D | null = null;
const getGithubIconPath2D = (): Path2D => {
  if (_githubIconPath2D) {
    return _githubIconPath2D;
  }
  _githubIconPath2D = new Path2D(GITHUB_OCTICON_PATH);
  return _githubIconPath2D;
};

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
};

const drawPill = (
  context: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  options: {
    color: string;
    background: string;
    border?: string;
    prefix?: string;
    height?: number;
    radius?: number;
    horizontalPadding?: number;
  },
): number => {
  const prefix = options.prefix ? `${options.prefix} ` : "";
  const text = `${prefix}${label}`;
  const height = options.height ?? 19;
  const horizontalPadding = options.horizontalPadding ?? 9;
  const width = Math.max(
    height + 2,
    context.measureText(text).width + horizontalPadding * 2,
  );
  drawRoundedRect(context, x, y, width, height, options.radius ?? 6);
  context.fillStyle = options.background;
  context.fill();
  context.strokeStyle = options.border ?? options.color;
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = options.color;
  context.fillText(
    text,
    x + horizontalPadding,
    y + height / 2 + (height >= 28 ? 5 : 4),
  );
  return width;
};

const drawArchitectureIcon = (
  context: CanvasRenderingContext2D,
  kind: ExcalidrawCauscapeNodeElement["causcape"]["kind"],
  x: number,
  y: number,
  size: number,
  color: string,
) => {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  const cx = x + size / 2;
  const cy = y + size / 2;

  switch (kind) {
    case "service": {
      drawRoundedRect(context, x + 7, y + 10, size - 14, size - 20, 3);
      context.stroke();
      context.beginPath();
      context.moveTo(x + 7, y + 19);
      context.lineTo(x + size - 7, y + 19);
      context.moveTo(x + 13, y + 14.5);
      context.lineTo(x + 14, y + 14.5);
      context.stroke();
      break;
    }
    case "datastore": {
      context.beginPath();
      context.ellipse(cx, y + 8, size / 2 - 6, 4, 0, 0, Math.PI * 2);
      context.moveTo(x + 6, y + 8);
      context.lineTo(x + 6, y + size - 8);
      context.moveTo(x + size - 6, y + 8);
      context.lineTo(x + size - 6, y + size - 8);
      context.ellipse(cx, y + size - 8, size / 2 - 6, 4, 0, 0, Math.PI * 2);
      context.stroke();
      break;
    }
    case "queue": {
      for (let index = 0; index < 3; index += 1) {
        drawRoundedRect(context, x + 5, y + 6 + index * 8, size - 10, 5, 2);
        context.stroke();
      }
      break;
    }
    case "external-system": {
      context.beginPath();
      context.arc(cx, cy, size / 2 - 6, 0, Math.PI * 2);
      context.moveTo(x + 7, cy);
      context.lineTo(x + size - 7, cy);
      context.moveTo(cx, y + 6);
      context.bezierCurveTo(
        x + 8,
        y + 12,
        x + 8,
        y + size - 12,
        cx,
        y + size - 6,
      );
      context.moveTo(cx, y + 6);
      context.bezierCurveTo(
        x + size - 8,
        y + 12,
        x + size - 8,
        y + size - 12,
        cx,
        y + size - 6,
      );
      context.stroke();
      break;
    }
    case "user": {
      context.beginPath();
      context.arc(cx, y + 10, 4, 0, Math.PI * 2);
      context.moveTo(x + 7, y + size - 6);
      context.bezierCurveTo(
        x + 8,
        y + 18,
        x + size - 8,
        y + 18,
        x + size - 7,
        y + size - 6,
      );
      context.stroke();
      break;
    }
    default:
      break;
  }
  context.restore();
};

const drawArchitectureChips = (
  context: CanvasRenderingContext2D,
  labels: readonly string[],
  x: number,
  y: number,
  availableWidth: number,
  color: string,
  background: string,
  border: string,
  prefix?: string,
) => {
  let cursorX = x;
  let cursorY = y;
  const chipHeight = CAUSCAPE_NODE_STYLE.chipHeight;
  context.font = `500 ${CAUSCAPE_NODE_STYLE.badgeFontSize}px system-ui, -apple-system, sans-serif`;
  for (const label of labels) {
    const maxLabelWidth = Math.max(42, availableWidth - 24);
    let visibleLabel = label;
    while (
      visibleLabel.length > 1 &&
      context.measureText(`${prefix ? `${prefix} ` : ""}${visibleLabel}`)
        .width +
        18 >
        maxLabelWidth
    ) {
      visibleLabel = `${visibleLabel.slice(0, -2)}…`;
    }
    const chipWidth = Math.min(
      availableWidth,
      Math.max(
        74,
        context.measureText(`${prefix ? `${prefix} ` : ""}${visibleLabel}`)
          .width + 24,
      ),
    );
    if (cursorX !== x && cursorX + chipWidth > x + availableWidth) {
      cursorX = x;
      cursorY += chipHeight + CAUSCAPE_NODE_STYLE.technologyRowGap;
    }
    drawPill(context, visibleLabel, cursorX, cursorY, {
      color,
      background,
      border,
      prefix,
      height: chipHeight,
      radius: 8,
      horizontalPadding: 12,
    });
    cursorX += chipWidth + CAUSCAPE_NODE_STYLE.technologyChipGap;
  }
};

type ArchitectureMetadataIcon =
  | "environment"
  | "repository"
  | "dashboard"
  | "documentation"
  | "runbook";

const drawArchitectureMetadataIcon = (
  context: CanvasRenderingContext2D,
  kind: ArchitectureMetadataIcon,
  x: number,
  y: number,
  color: string,
) => {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  switch (kind) {
    case "environment": {
      drawRoundedRect(context, x + 4, y + 4, 12, 12, 1);
      context.stroke();
      break;
    }
    case "repository": {
      context.beginPath();
      context.moveTo(x + 5, y + 15);
      context.lineTo(x + 15, y + 5);
      context.moveTo(x + 8, y + 5);
      context.lineTo(x + 15, y + 5);
      context.lineTo(x + 15, y + 12);
      context.stroke();
      break;
    }
    case "dashboard": {
      context.beginPath();
      context.moveTo(x + 5, y + 15);
      context.lineTo(x + 15, y + 5);
      context.moveTo(x + 8, y + 5);
      context.lineTo(x + 15, y + 5);
      context.lineTo(x + 15, y + 12);
      context.stroke();
      break;
    }
    case "documentation": {
      context.beginPath();
      context.moveTo(x + 5, y + 15);
      context.lineTo(x + 15, y + 5);
      context.moveTo(x + 8, y + 5);
      context.lineTo(x + 15, y + 5);
      context.lineTo(x + 15, y + 12);
      context.stroke();
      break;
    }
    case "runbook": {
      context.beginPath();
      context.moveTo(x + 5, y + 15);
      context.lineTo(x + 15, y + 5);
      context.moveTo(x + 8, y + 5);
      context.lineTo(x + 15, y + 5);
      context.lineTo(x + 15, y + 12);
      context.stroke();
      break;
    }
  }
  context.restore();
};

const drawArchitectureCard = (
  element: ExcalidrawCauscapeNodeElement,
  context: CanvasRenderingContext2D,
  data: ReturnType<typeof getCauscapeNodeRenderData>,
  isDark: boolean,
) => {
  const {
    architecturePadding: padding,
    architectureIconSize: iconSize,
    architectureIconTileSize: iconTileSize,
    architectureIconGap: iconGap,
    architectureTitleFontSize: titleFontSize,
    headerHeight,
    sectionGap,
    lineHeight,
    descriptionTopGap,
    metadataRowHeight,
    metadataPanelPadding,
    technologyChipTopPadding,
    sectionRuleGap,
    architecturePillHeight,
  } = CAUSCAPE_NODE_STYLE;
  const foreground = applyDarkModeFilter(data.foreground, isDark);
  const secondary = applyDarkModeFilter(data.secondary, isDark);
  const accent = data.isArchitecture ? data.kindAccent : secondary;
  const surface = isDark
    ? CAUSCAPE_NODE_STYLE.darkSurface
    : CAUSCAPE_NODE_STYLE.lightSurface;
  const panel = isDark ? "#263449" : "#fbfcfe";
  const rule = isDark
    ? CAUSCAPE_NODE_STYLE.darkRule
    : CAUSCAPE_NODE_STYLE.lightRule;
  const chipBackground = isDark ? "#33445d" : "#ffffff";
  const contentWidth = element.width - padding * 2;
  const titleX = padding + iconTileSize + iconGap;
  const titleMaxWidth = Math.max(60, element.width - titleX - padding);
  let cursorY = padding + headerHeight;

  context.save();
  context.textBaseline = "alphabetic";
  context.fillStyle = surface;
  context.globalAlpha = 0.96;
  drawRoundedRect(context, padding, padding, iconTileSize, iconTileSize, 8);
  context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = `${accent}55`;
  context.lineWidth = 1;
  context.stroke();
  drawArchitectureIcon(
    context,
    data.kind as ExcalidrawCauscapeNodeElement["causcape"]["kind"],
    padding + (iconTileSize - iconSize) / 2,
    padding + (iconTileSize - iconSize) / 2,
    iconSize,
    accent,
  );

  context.font = `700 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  context.fillStyle = foreground;
  const titleLines = wrapCauscapeText(
    data.title,
    Math.floor(titleMaxWidth / 14),
  );
  context.fillText(titleLines[0], titleX, padding + 38);
  if (titleLines[1]) {
    context.fillText(titleLines[1], titleX, padding + 69);
  }

  context.font = `600 ${CAUSCAPE_NODE_STYLE.kindFontSize}px system-ui, -apple-system, sans-serif`;
  let pillX = titleX;
  const pillY = padding + (titleLines[1] ? 80 : 58);
  pillX +=
    drawPill(context, data.kindLabel ?? "Component", pillX, pillY, {
      color: accent,
      background: `${accent}15`,
      border: `${accent}66`,
      height: architecturePillHeight,
      radius: 9,
      horizontalPadding: 14,
    }) + 10;
  if (data.health) {
    drawPill(context, data.health.label, pillX, pillY, {
      color: data.health.color,
      background: `${data.health.color}15`,
      border: `${data.health.color}66`,
      prefix: data.health.glyph,
      height: architecturePillHeight,
      radius: 9,
      horizontalPadding: 14,
    });
  }

  const drawRule = (y: number) => {
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(element.width - padding, y);
    context.strokeStyle = rule;
    context.lineWidth = 1;
    context.stroke();
  };

  if (data.description) {
    cursorY += descriptionTopGap;
    context.font = `500 ${CAUSCAPE_NODE_STYLE.bodyFontSize}px system-ui, -apple-system, sans-serif`;
    context.fillStyle = secondary;
    const descriptionLines = wrapCauscapeText(
      data.description,
      Math.floor(contentWidth / 8.2),
    );
    context.fillText(descriptionLines[0], padding, cursorY + lineHeight);
    if (descriptionLines[1]) {
      context.fillText(descriptionLines[1], padding, cursorY + lineHeight * 2);
    }
    cursorY += lineHeight * (descriptionLines[1] ? 2 : 1);
  }

  if (data.environment || data.references.length > 0) {
    cursorY += sectionGap;
    const rows = [
      ...(data.environment
        ? [
            {
              label: "Environment",
              value: data.environment,
              icon: "environment" as const,
            },
          ]
        : []),
      ...data.references.map((reference) => ({
        label:
          reference.type === "repository"
            ? "Repository"
            : reference.type === "dashboard"
            ? "Dashboard"
            : reference.type === "documentation"
            ? "Documentation"
            : "Runbook",
        value: getCauscapeReferenceLabel(reference),
        icon: reference.type,
      })),
    ];
    const panelHeight =
      metadataPanelPadding * 2 + rows.length * metadataRowHeight;
    drawRoundedRect(context, padding, cursorY, contentWidth, panelHeight, 12);
    context.fillStyle = panel;
    context.fill();
    context.strokeStyle = rule;
    context.lineWidth = 1;
    context.stroke();

    context.font = `500 ${CAUSCAPE_NODE_STYLE.bodyFontSize}px system-ui, -apple-system, sans-serif`;
    rows.forEach((row, index) => {
      const rowTop = cursorY + metadataPanelPadding + index * metadataRowHeight;
      const baseline = rowTop + 30;
      drawArchitectureMetadataIcon(
        context,
        row.icon,
        padding + 16,
        baseline - 16,
        accent,
      );
      context.fillStyle = secondary;
      context.font = `500 ${CAUSCAPE_NODE_STYLE.bodyFontSize}px system-ui, -apple-system, sans-serif`;
      context.fillText(row.label, padding + 52, baseline);
      if (row.label !== "Environment") {
        context.fillStyle = accent;
        context.fillText(row.value, padding + 230, baseline);
      } else {
        context.fillStyle = foreground;
        context.fillText(row.value, padding + 230, baseline);
      }
      if (index < rows.length - 1) {
        context.beginPath();
        context.moveTo(padding + 16, rowTop + metadataRowHeight);
        context.lineTo(padding + contentWidth - 16, rowTop + metadataRowHeight);
        context.strokeStyle = rule;
        context.lineWidth = 1;
        context.stroke();
      }
    });
    cursorY += panelHeight;
  }

  if (data.technologies.length > 0) {
    if (data.environment || data.references.length > 0) {
      drawRule(cursorY + sectionRuleGap);
      cursorY += sectionRuleGap + 1 + sectionRuleGap;
    } else {
      cursorY += sectionGap;
    }
    drawArchitectureChips(
      context,
      data.technologies,
      padding,
      cursorY + technologyChipTopPadding,
      contentWidth,
      secondary,
      chipBackground,
      rule,
    );
  }
  context.restore();
};

export const drawCauscapeNodeOnCanvas = (
  element: ExcalidrawCauscapeNodeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
): void => {
  const data = getCauscapeNodeRenderData(element.causcape, renderConfig.theme);
  const isDark = renderConfig.theme === THEME.DARK;
  const foreground = applyDarkModeFilter(data.foreground, isDark);
  const secondary = applyDarkModeFilter(data.secondary, isDark);
  const { padding, iconSize, iconGap, staleColor, variableAccent } =
    CAUSCAPE_NODE_STYLE;

  context.save();
  context.textBaseline = "alphabetic";

  if (data.isArchitecture) {
    drawArchitectureCard(element, context, data, isDark);
  } else if (data.isGithub) {
    const textX = padding + iconSize + iconGap;
    const maxWidth = Math.max(1, element.width - textX - padding);

    context.save();
    context.translate(padding, padding);
    context.scale(iconSize / 16, iconSize / 16);
    context.fillStyle = foreground;
    context.fill(getGithubIconPath2D());
    context.restore();

    context.beginPath();
    context.arc(
      padding + iconSize - 2,
      padding + iconSize - 2,
      5,
      0,
      Math.PI * 2,
    );
    context.fillStyle = data.badgeColor;
    context.fill();

    context.font = `600 ${
      data.meta ? 11 : 12
    }px system-ui, -apple-system, sans-serif`;
    const titleLines = wrapCauscapeText(data.title, Math.floor(maxWidth / 6.5));
    context.fillStyle = foreground;
    context.fillText(titleLines[0], textX, padding + 11);
    if (data.meta) {
      context.font = "10px system-ui, -apple-system, sans-serif";
      context.fillStyle = secondary;
      context.fillText(
        wrapCauscapeText(data.meta, Math.floor(maxWidth / 6))[0],
        textX,
        padding + 23,
      );
    } else if (titleLines[1]) {
      context.fillText(titleLines[1], textX, padding + 25);
    }

    if (data.stale) {
      context.fillStyle = staleColor;
      context.font = "700 16px system-ui, -apple-system, sans-serif";
      context.fillText("•", element.width - padding - 8, padding + 11);
    }
  } else if (data.title) {
    const maxWidth = element.width - padding * 2;
    context.font = `500 ${CAUSCAPE_NODE_STYLE.variableFontSize}px system-ui, -apple-system, sans-serif`;
    const lines = wrapCauscapeText(data.title, Math.floor(maxWidth / 6.5));
    context.textAlign = "center";
    context.fillStyle = foreground;
    const firstBaseline = lines[1]
      ? element.height / 2 - 3
      : element.height / 2 + 4;
    context.fillText(lines[0], element.width / 2, firstBaseline);
    if (lines[1]) {
      context.fillText(lines[1], element.width / 2, firstBaseline + 14);
    }
    context.textAlign = "start";

    context.beginPath();
    context.arc(element.width - 9, 9, 6, 0, Math.PI * 2);
    context.fillStyle = applyDarkModeFilter(variableAccent, isDark);
    context.fill();
  }

  context.restore();
};

/** Paints the relationship text on the edge while keeping the line selectable as one element. */
export const drawCauscapeEdgeOnCanvas = (
  element: ExcalidrawCauscapeEdgeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
): void => {
  const label = getCauscapeEdgeLabel(element.causcape);
  if (!label) {
    return;
  }
  const points = element.points.map(([x, y]) => [x, y] as [number, number]);
  const anchor = getCauscapeEdgeLabelAnchor(points);
  if (!anchor) {
    return;
  }

  const isDark = renderConfig.theme === THEME.DARK;
  const textColor = applyDarkModeFilter(
    isDark
      ? CAUSCAPE_NODE_STYLE.darkSecondary
      : CAUSCAPE_NODE_STYLE.lightSecondary,
    isDark,
  );
  const background = isDark
    ? CAUSCAPE_NODE_STYLE.darkSurface
    : CAUSCAPE_NODE_STYLE.lightSurface;
  const border = isDark
    ? CAUSCAPE_NODE_STYLE.darkRule
    : CAUSCAPE_NODE_STYLE.lightRule;
  const fontSize = 13;
  const lineHeight = 18;
  const horizontalPadding = 8;
  const verticalPadding = 5;
  const maxChars = Math.max(
    14,
    Math.floor(Math.max(anchor.length - 16, 100) / 7),
  );
  const lines = wrapCauscapeEdgeLabel(label, maxChars);

  context.save();
  context.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const textWidth = Math.max(
    ...lines.map((line) => context.measureText(line).width),
  );
  const boxWidth = textWidth + horizontalPadding * 2;
  const boxHeight = lines.length * lineHeight + verticalPadding * 2;
  const labelX = anchor.x + anchor.normalX * 16;
  const labelY = anchor.y + anchor.normalY * 16;
  drawRoundedRect(
    context,
    labelX - boxWidth / 2,
    labelY - boxHeight / 2,
    boxWidth,
    boxHeight,
    6,
  );
  context.fillStyle = background;
  context.fill();
  context.strokeStyle = border;
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    context.fillText(
      line,
      labelX,
      labelY + (index - (lines.length - 1) / 2) * lineHeight,
    );
  });
  context.restore();
};

const drawElementOnCanvas = (
  element: NonDeletedExcalidrawElement,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable":
    case "diamond":
    case "ellipse":
    case "causcape-node": {
      context.lineJoin = "round";
      context.lineCap = "round";
      rc.draw(ShapeCache.generateElementShape(element, renderConfig));
      if (element.type === "causcape-node") {
        drawCauscapeNodeOnCanvas(element, context, renderConfig);
      }
      break;
    }
    case "arrow":
    case "line":
    case "causcape-edge": {
      context.lineJoin = "round";
      context.lineCap = "round";

      ShapeCache.generateElementShape(element, renderConfig).forEach(
        (shape) => {
          rc.draw(shape);
        },
      );
      if (element.type === "causcape-edge") {
        drawCauscapeEdgeOnCanvas(element, context, renderConfig);
      }
      break;
    }
    case "freedraw": {
      // Draw directly to canvas
      context.save();

      const shapes = ShapeCache.generateElementShape(element, renderConfig);

      for (const shape of shapes) {
        if (typeof shape === "string") {
          context.fillStyle = applyDarkModeFilter(
            element.strokeColor,
            renderConfig.theme === THEME.DARK,
          );
          context.fill(new Path2D(shape));
        } else {
          rc.draw(shape);
        }
      }

      context.restore();
      break;
    }
    case "image": {
      context.save();
      const cacheEntry =
        element.fileId !== null
          ? renderConfig.imageCache.get(element.fileId)
          : null;
      const img = isInitializedImageElement(element)
        ? cacheEntry?.image
        : undefined;

      if (img != null && !(img instanceof Promise)) {
        if (element.roundness && context.roundRect) {
          context.beginPath();
          context.roundRect(
            0,
            0,
            element.width,
            element.height,
            getCornerRadius(Math.min(element.width, element.height), element),
          );
          context.clip();
        }

        const { x, y, width, height } = element.crop
          ? element.crop
          : {
              x: 0,
              y: 0,
              width: img.naturalWidth,
              height: img.naturalHeight,
            };

        const shouldInvertImage =
          renderConfig.theme === THEME.DARK &&
          cacheEntry?.mimeType === MIME_TYPES.svg;

        if (shouldInvertImage && isSafari) {
          const devicePixelRatio = window.devicePixelRatio || 1;
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = element.width * devicePixelRatio;
          tempCanvas.height = element.height * devicePixelRatio;
          const tempContext = tempCanvas.getContext("2d");

          if (tempContext) {
            tempContext.scale(devicePixelRatio, devicePixelRatio);
            tempContext.drawImage(
              img,
              x,
              y,
              width,
              height,
              0,
              0,
              element.width,
              element.height,
            );

            const imageData = tempContext.getImageData(
              0,
              0,
              tempCanvas.width,
              tempCanvas.height,
            );

            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
              data[i] = 255 - data[i];
              data[i + 1] = 255 - data[i + 1];
              data[i + 2] = 255 - data[i + 2];
            }

            tempContext.putImageData(imageData, 0, 0);
            context.drawImage(
              tempCanvas,
              0,
              0,
              tempCanvas.width,
              tempCanvas.height,
              0,
              0,
              element.width,
              element.height,
            );
          }
        } else {
          if (shouldInvertImage) {
            context.filter = DARK_THEME_FILTER;
          }

          context.drawImage(
            img,
            x,
            y,
            width,
            height,
            0 /* hardcoded for the selection box*/,
            0,
            element.width,
            element.height,
          );
        }
      } else {
        drawImagePlaceholder(element, context, renderConfig.theme);
      }
      context.restore();
      break;
    }
    default: {
      if (isTextElement(element)) {
        const rtl = isRTL(element.text);
        const shouldTemporarilyAttach = rtl && !context.canvas.isConnected;
        if (shouldTemporarilyAttach) {
          // to correctly render RTL text mixed with LTR, we have to append it
          // to the DOM
          document.body.appendChild(context.canvas);
        }
        context.canvas.setAttribute("dir", rtl ? "rtl" : "ltr");
        context.save();
        context.font = getFontString(element);
        context.fillStyle = applyDarkModeFilter(
          element.strokeColor,
          renderConfig.theme === THEME.DARK,
        );
        context.textAlign = element.textAlign as CanvasTextAlign;

        // Canvas does not support multiline text by default
        const lines = element.text.replace(/\r\n?/g, "\n").split("\n");

        const horizontalOffset =
          element.textAlign === "center"
            ? element.width / 2
            : element.textAlign === "right"
            ? element.width
            : 0;

        const lineHeightPx = getLineHeightInPx(
          element.fontSize,
          element.lineHeight,
        );

        const verticalOffset = getVerticalOffset(
          element.fontFamily,
          element.fontSize,
          lineHeightPx,
        );

        for (let index = 0; index < lines.length; index++) {
          context.fillText(
            lines[index],
            horizontalOffset,
            index * lineHeightPx + verticalOffset,
          );
        }
        context.restore();
        if (shouldTemporarilyAttach) {
          context.canvas.remove();
        }
      } else {
        throw new Error(`Unimplemented type ${element.type}`);
      }
    }
  }
};

export const elementWithCanvasCache = new WeakMap<
  ExcalidrawElement,
  ExcalidrawElementWithCanvas
>();

const generateElementWithCanvas = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedSceneElementsMap,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
) => {
  const zoom: Zoom = renderConfig
    ? appState.zoom
    : {
        value: 1 as NormalizedZoomValue,
      };
  const prevElementWithCanvas = elementWithCanvasCache.get(element);
  const shouldRegenerateBecauseZoom =
    prevElementWithCanvas &&
    prevElementWithCanvas.zoomValue !== zoom.value &&
    !appState?.shouldCacheIgnoreZoom;
  const imageCrop = isImageElement(element) ? element.crop : null;

  const containingFrameOpacity =
    getContainingFrame(element, elementsMap)?.opacity || 100;

  if (
    !prevElementWithCanvas ||
    shouldRegenerateBecauseZoom ||
    prevElementWithCanvas.theme !== appState.theme ||
    prevElementWithCanvas.imageCrop !== imageCrop ||
    prevElementWithCanvas.containingFrameOpacity !== containingFrameOpacity
  ) {
    const elementWithCanvas = generateElementCanvas(
      element,
      elementsMap,
      zoom,
      renderConfig,
      appState,
    );

    if (!elementWithCanvas) {
      return null;
    }

    elementWithCanvasCache.set(element, elementWithCanvas);

    return elementWithCanvas;
  }
  return prevElementWithCanvas;
};

const drawElementFromCanvas = (
  elementWithCanvas: ExcalidrawElementWithCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
  allElementsMap: NonDeletedSceneElementsMap,
) => {
  const element = elementWithCanvas.element;
  const padding = getCanvasPadding(element);
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, allElementsMap);
  const cx = ((x1 + x2) / 2 + appState.scrollX) * window.devicePixelRatio;
  const cy = ((y1 + y2) / 2 + appState.scrollY) * window.devicePixelRatio;

  context.save();
  context.scale(1 / window.devicePixelRatio, 1 / window.devicePixelRatio);

  const boundTextElement = getBoundTextElement(element, allElementsMap);

  if (isArrowElement(element) && boundTextElement) {
    // punch the label "hole" by clipping the arrow's blit out of the label
    // rect (even-odd) instead of baking a rotated arrow copy with a cleared
    // hole into a separate (`maxDim`-squared!) canvas. The hole stays
    // axis-aligned in scene space while the blit below rotates.
    const [, , , , boundTextCx, boundTextCy] = getElementAbsoluteCoords(
      boundTextElement,
      allElementsMap,
    );
    // generously covers the arrow's blit at any rotation
    const outerHalf =
      Math.max(distance(x1, x2), distance(y1, y2)) * window.devicePixelRatio +
      padding * 10;
    context.beginPath();
    context.rect(cx - outerHalf, cy - outerHalf, outerHalf * 2, outerHalf * 2);
    context.rect(
      (boundTextCx -
        boundTextElement.width / 2 -
        BOUND_TEXT_PADDING +
        appState.scrollX) *
        window.devicePixelRatio,
      (boundTextCy -
        boundTextElement.height / 2 -
        BOUND_TEXT_PADDING +
        appState.scrollY) *
        window.devicePixelRatio,
      (boundTextElement.width + BOUND_TEXT_PADDING * 2) *
        window.devicePixelRatio,
      (boundTextElement.height + BOUND_TEXT_PADDING * 2) *
        window.devicePixelRatio,
    );
    context.clip("evenodd");
  }

  // we translate context to element center so that rotation and scale
  // originates from the element center
  context.translate(cx, cy);

  context.rotate(element.angle);

  if (
    "scale" in elementWithCanvas.element &&
    !isPendingImageElement(element, renderConfig)
  ) {
    context.scale(
      elementWithCanvas.element.scale[0],
      elementWithCanvas.element.scale[1],
    );
  }

  // revert afterwards we don't have account for it during drawing
  context.translate(-cx, -cy);

  context.drawImage(
    elementWithCanvas.canvas!,
    (x1 + appState.scrollX) * window.devicePixelRatio -
      (padding * elementWithCanvas.scale) / elementWithCanvas.scale,
    (y1 + appState.scrollY) * window.devicePixelRatio -
      (padding * elementWithCanvas.scale) / elementWithCanvas.scale,
    elementWithCanvas.canvas!.width / elementWithCanvas.scale,
    elementWithCanvas.canvas!.height / elementWithCanvas.scale,
  );

  if (
    import.meta.env.VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX ===
      "true" &&
    hasBoundTextElement(element)
  ) {
    const textElement = getBoundTextElement(
      element,
      allElementsMap,
    ) as ExcalidrawTextElementWithContainer;
    const coords = getContainerCoords(element);
    context.strokeStyle = "#c92a2a";
    context.lineWidth = 3;
    context.strokeRect(
      (coords.x + appState.scrollX) * window.devicePixelRatio,
      (coords.y + appState.scrollY) * window.devicePixelRatio,
      getBoundTextMaxWidth(element, textElement) * window.devicePixelRatio,
      getBoundTextMaxHeight(element, textElement) * window.devicePixelRatio,
    );
  }
  context.restore();

  // Clear the nested element we appended to the DOM
};

export const renderSelectionElement = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  selectionColor: InteractiveCanvasRenderConfig["selectionColor"],
) => {
  context.save();
  context.translate(element.x + appState.scrollX, element.y + appState.scrollY);
  context.fillStyle = "rgba(0, 0, 200, 0.04)";

  // render from 0.5px offset  to get 1px wide line
  // https://stackoverflow.com/questions/7530593/html5-canvas-and-line-width/7531540#7531540
  // TODO can be be improved by offseting to the negative when user selects
  // from right to left
  const offset = 0.5 / appState.zoom.value;

  context.fillRect(offset, offset, element.width, element.height);
  context.lineWidth = 1 / appState.zoom.value;
  context.strokeStyle = selectionColor;
  context.strokeRect(offset, offset, element.width, element.height);

  context.restore();
};

export const renderElement = (
  element: NonDeletedExcalidrawElement,
  elementsMap: RenderableElementsMap,
  allElementsMap: NonDeletedSceneElementsMap,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
) => {
  const reduceAlphaForSelection =
    appState.openDialog?.name === "elementLinkSelector" &&
    !appState.selectedElementIds[element.id] &&
    !appState.hoveredElementIds[element.id];

  context.globalAlpha = getRenderOpacity(
    element,
    getContainingFrame(element, elementsMap),
    renderConfig.elementsPendingErasure,
    renderConfig.pendingFlowchartNodes,
    reduceAlphaForSelection ? DEFAULT_REDUCED_GLOBAL_ALPHA : 1,
  );

  switch (element.type) {
    case "magicframe":
    case "frame": {
      if (appState.frameRendering.enabled && appState.frameRendering.outline) {
        context.save();
        context.translate(
          element.x + appState.scrollX,
          element.y + appState.scrollY,
        );
        context.fillStyle = "rgba(0, 0, 200, 0.04)";

        context.lineWidth = FRAME_STYLE.strokeWidth / appState.zoom.value;
        context.strokeStyle = applyDarkModeFilter(
          FRAME_STYLE.strokeColor,
          appState.theme === THEME.DARK,
        );

        // TODO change later to only affect AI frames
        if (isMagicFrameElement(element)) {
          context.strokeStyle =
            appState.theme === THEME.LIGHT
              ? "#7affd7"
              : applyDarkModeFilter("#1d8264");
        }

        if (FRAME_STYLE.radius && context.roundRect) {
          context.beginPath();
          context.roundRect(
            0,
            0,
            element.width,
            element.height,
            FRAME_STYLE.radius / appState.zoom.value,
          );
          context.stroke();
          context.closePath();
        } else {
          context.strokeRect(0, 0, element.width, element.height);
        }

        context.restore();
      }
      break;
    }
    case "freedraw": {
      if (renderConfig.isExporting) {
        const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
        const cx = (x1 + x2) / 2 + appState.scrollX;
        const cy = (y1 + y2) / 2 + appState.scrollY;
        const shiftX = (x2 - x1) / 2 - (element.x - x1);
        const shiftY = (y2 - y1) / 2 - (element.y - y1);
        context.save();
        context.translate(cx, cy);
        context.rotate(element.angle);
        context.translate(-shiftX, -shiftY);
        drawElementOnCanvas(element, rc, context, renderConfig);
        context.restore();
      } else {
        const elementWithCanvas = generateElementWithCanvas(
          element,
          allElementsMap,
          renderConfig,
          appState,
        );
        if (!elementWithCanvas) {
          return;
        }

        drawElementFromCanvas(
          elementWithCanvas,
          context,
          renderConfig,
          appState,
          allElementsMap,
        );
      }

      break;
    }
    case "rectangle":
    case "causcape-node":
    case "causcape-edge":
    case "diamond":
    case "ellipse":
    case "line":
    case "arrow":
    case "image":
    case "text":
    case "iframe":
    case "embeddable": {
      if (renderConfig.isExporting) {
        const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const cx = centerX + appState.scrollX;
        const cy = centerY + appState.scrollY;
        let shiftX = (x2 - x1) / 2 - (element.x - x1);
        let shiftY = (y2 - y1) / 2 - (element.y - y1);
        if (isTextElement(element)) {
          const container = getContainerElement(element, elementsMap);
          if (isArrowElement(container)) {
            const boundTextCoords =
              LinearElementEditor.getBoundTextElementPosition(
                container,
                element as ExcalidrawTextElementWithContainer,
                elementsMap,
              );
            shiftX = (x2 - x1) / 2 - (boundTextCoords.x - x1);
            shiftY = (y2 - y1) / 2 - (boundTextCoords.y - y1);
          }
        }
        context.save();
        context.translate(cx, cy);

        const boundTextElement = getBoundTextElement(element, elementsMap);

        if (isArrowElement(element) && boundTextElement) {
          // Draw arrow directly as vector (no temp-canvas bitmap blit which
          // introduces resampling blur). The label "hole" is cut by clipping
          // the arrow's own strokes out of the label rect (even-odd clip)
          // so that elements rendered beneath the arrow keep showing through
          // the gap.
          shiftX = element.width / 2 - (element.x - x1);
          shiftY = element.height / 2 - (element.y - y1);

          const [, , , , boundTextCx, boundTextCy] = getElementAbsoluteCoords(
            boundTextElement,
            elementsMap,
          );
          const holeX =
            boundTextCx -
            centerX -
            boundTextElement.width / 2 -
            BOUND_TEXT_PADDING;
          const holeY =
            boundTextCy -
            centerY -
            boundTextElement.height / 2 -
            BOUND_TEXT_PADDING;
          const holeWidth = boundTextElement.width + BOUND_TEXT_PADDING * 2;
          const holeHeight = boundTextElement.height + BOUND_TEXT_PADDING * 2;

          // generously covers the arrow's painted extent at any rotation
          // (the hole rect stays axis-aligned in scene space)
          const outerHalf =
            Math.max(distance(x1, x2), distance(y1, y2)) +
            getCanvasPadding(element) * 10;

          context.save();
          context.beginPath();
          context.rect(-outerHalf, -outerHalf, outerHalf * 2, outerHalf * 2);
          context.rect(holeX, holeY, holeWidth, holeHeight);
          context.clip("evenodd");
          context.rotate(element.angle);
          context.translate(-shiftX, -shiftY);
          drawElementOnCanvas(element, rc, context, renderConfig);
          context.restore();
        } else {
          context.rotate(element.angle);

          if (element.type === "image") {
            // note: scale must be applied *after* rotating
            context.scale(element.scale[0], element.scale[1]);
          }

          context.translate(-shiftX, -shiftY);
          drawElementOnCanvas(element, rc, context, renderConfig);
        }

        context.restore();
        // not exporting → optimized rendering (cache & render from element
        // canvases)
      } else {
        const elementWithCanvas = generateElementWithCanvas(
          element,
          allElementsMap,
          renderConfig,
          appState,
        );

        if (!elementWithCanvas) {
          return;
        }

        const currentImageSmoothingStatus = context.imageSmoothingEnabled;

        if (
          // do not disable smoothing during zoom as blurry shapes look better
          // on low resolution (while still zooming in) than sharp ones
          !appState?.shouldCacheIgnoreZoom &&
          // angle is 0 -> always disable smoothing
          (!element.angle ||
            // or check if angle is a right angle in which case we can still
            // disable smoothing without adversely affecting the result
            // We need less-than comparison because of FP artihmetic
            isRightAngleRads(element.angle))
        ) {
          // Disabling smoothing makes output much sharper, especially for
          // text. Unless for non-right angles, where the aliasing is really
          // terrible on Chromium.
          //
          // Note that `context.imageSmoothingQuality="high"` has almost
          // zero effect.
          //
          context.imageSmoothingEnabled = false;
        }

        if (
          element.id === appState.croppingElementId &&
          isImageElement(elementWithCanvas.element) &&
          elementWithCanvas.element.crop !== null
        ) {
          context.save();
          context.globalAlpha = 0.1;

          const uncroppedElementCanvas = generateElementCanvas(
            getUncroppedImageElement(
              elementWithCanvas.element,
              elementsMap,
            ) as NonDeleted<ExcalidrawImageElement>,
            allElementsMap,
            appState.zoom,
            renderConfig,
            appState,
          );

          if (uncroppedElementCanvas) {
            drawElementFromCanvas(
              uncroppedElementCanvas,
              context,
              renderConfig,
              appState,
              allElementsMap,
            );
          }

          context.restore();
        }

        drawElementFromCanvas(
          elementWithCanvas,
          context,
          renderConfig,
          appState,
          allElementsMap,
        );

        // reset
        context.imageSmoothingEnabled = currentImageSmoothingStatus;
      }
      break;
    }
    default: {
      // @ts-ignore
      throw new Error(`Unimplemented type ${element.type}`);
    }
  }

  context.globalAlpha = 1;
};

export function getFreedrawOutlineAsSegments(
  element: ExcalidrawFreeDrawElement,
  points: [number, number][],
  elementsMap: ElementsMap,
) {
  const bounds = getElementBounds(
    {
      ...element,
      angle: 0 as Radians,
    },
    elementsMap,
  );
  const center = pointFrom<GlobalPoint>(
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2,
  );

  invariant(points.length >= 2, "Freepath outline must have at least 2 points");

  return points.slice(2).reduce(
    (acc, curr) => {
      acc.push(
        lineSegment<GlobalPoint>(
          acc[acc.length - 1][1],
          pointRotateRads(
            pointFrom<GlobalPoint>(curr[0] + element.x, curr[1] + element.y),
            center,
            element.angle,
          ),
        ),
      );
      return acc;
    },
    [
      lineSegment<GlobalPoint>(
        pointRotateRads(
          pointFrom<GlobalPoint>(
            points[0][0] + element.x,
            points[0][1] + element.y,
          ),
          center,
          element.angle,
        ),
        pointRotateRads(
          pointFrom<GlobalPoint>(
            points[1][0] + element.x,
            points[1][1] + element.y,
          ),
          center,
          element.angle,
        ),
      ),
    ],
  );
}

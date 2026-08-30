import {
  DEFAULT_ELEMENT_PROPS,
  COLOR_PALETTE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_VERTICAL_ALIGN,
  DEFAULT_STROKE_STREAMLINE,
  getSizeFromPoints,
  ROUNDNESS,
  VERTICAL_ALIGN,
  randomInteger,
  randomId,
  getFontString,
  getUpdatedTimestamp,
  getLineHeight,
} from "@causcape/common";

import {
  isValidPoint,
  pointFrom,
  type LocalPoint,
  type Radians,
} from "@causcape/math";

import type { MarkOptional, Merge } from "@causcape/common/utility-types";

import {
  getElementAbsoluteCoords,
  getResizedElementAbsoluteCoords,
} from "./bounds";
import { newElementWith } from "./mutateElement";
import { getBoundTextMaxWidth } from "./textElement";
import { normalizeText, measureText } from "./textMeasurements";
import { wrapText } from "./textWrapping";
import {
  getCauscapeNodeSize,
  isCauscapeArchitectureNodeKind,
  normalizeCauscapeEdgeData,
  normalizeCauscapeNodeData,
} from "./causcape";

import { isLineElement } from "./typeChecks";

import type {
  CauscapeElement,
  CauscapeImageElement,
  CauscapeTextElement,
  CauscapeLinearElement,
  CauscapeGenericElement,
  NonDeleted,
  TextAlign,
  VerticalAlign,
  Arrowhead,
  CauscapeFreeDrawElement,
  FontFamilyValues,
  CauscapeTextContainer,
  CauscapeFrameElement,
  CauscapeEmbeddableElement,
  CauscapeMagicFrameElement,
  CauscapeIframeElement,
  ElementsMap,
  CauscapeArrowElement,
  CauscapeElbowArrowElement,
  CauscapeLineElement,
  CauscapeNodeElement,
  CauscapeEdgeElement,
  CauscapeNodeKind,
  CauscapeArchitectureNodeMetadata,
  GithubRef,
  GithubCache,
  FixedPointBinding,
} from "./types";

export type ElementConstructorOpts = MarkOptional<
  Omit<CauscapeGenericElement, "id" | "type" | "isDeleted" | "updated">,
  | "width"
  | "height"
  | "angle"
  | "groupIds"
  | "frameId"
  | "index"
  | "boundElements"
  | "seed"
  | "version"
  | "versionNonce"
  | "link"
  | "strokeStyle"
  | "fillStyle"
  | "strokeColor"
  | "backgroundColor"
  | "roughness"
  | "strokeWidth"
  | "roundness"
  | "locked"
  | "opacity"
  | "customData"
>;

const _newElementBase = <T extends CauscapeElement>(
  type: T["type"],
  {
    x,
    y,
    strokeColor = DEFAULT_ELEMENT_PROPS.strokeColor,
    backgroundColor = DEFAULT_ELEMENT_PROPS.backgroundColor,
    fillStyle = DEFAULT_ELEMENT_PROPS.fillStyle,
    strokeWidth = DEFAULT_ELEMENT_PROPS.strokeWidth,
    strokeStyle = DEFAULT_ELEMENT_PROPS.strokeStyle,
    roughness = DEFAULT_ELEMENT_PROPS.roughness,
    opacity = DEFAULT_ELEMENT_PROPS.opacity,
    width = 0,
    height = 0,
    angle = 0 as Radians,
    groupIds = [],
    frameId = null,
    index = null,
    roundness = null,
    boundElements = null,
    link = null,
    locked = DEFAULT_ELEMENT_PROPS.locked,
    ...rest
  }: ElementConstructorOpts & Omit<Partial<CauscapeGenericElement>, "type">,
) => {
  // NOTE (mtolmacs): This is a temporary check to detect extremely large
  // element position or sizing
  if (
    x < -1e6 ||
    x > 1e6 ||
    y < -1e6 ||
    y > 1e6 ||
    width < -1e6 ||
    width > 1e6 ||
    height < -1e6 ||
    height > 1e6
  ) {
    console.error("New element size or position is too large", {
      x,
      y,
      width,
      height,
      // @ts-ignore
      points: rest.points,
    });
  }

  // assign type to guard against excess properties
  const element: Merge<
    CauscapeGenericElement,
    { type: T["type"]; isDeleted: false }
  > = {
    id: rest.id || randomId(),
    type,
    x,
    y,
    width,
    height,
    angle,
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    groupIds,
    frameId,
    index,
    roundness,
    seed: rest.seed ?? randomInteger(),
    version: rest.version || 1,
    versionNonce: rest.versionNonce ?? 0,
    isDeleted: false as false,
    boundElements,
    updated: getUpdatedTimestamp(),
    link,
    locked,
    customData: rest.customData,
  };
  return element;
};

export const newElement = (
  opts: {
    type: CauscapeGenericElement["type"];
  } & ElementConstructorOpts,
): NonDeleted<CauscapeGenericElement> =>
  _newElementBase<CauscapeGenericElement>(opts.type, opts);

export const newEmbeddableElement = (
  opts: {
    type: "embeddable";
  } & ElementConstructorOpts,
): NonDeleted<CauscapeEmbeddableElement> => {
  return _newElementBase<CauscapeEmbeddableElement>("embeddable", opts);
};

export const newIframeElement = (
  opts: {
    type: "iframe";
  } & ElementConstructorOpts,
): NonDeleted<CauscapeIframeElement> => {
  return {
    ..._newElementBase<CauscapeIframeElement>("iframe", opts),
  };
};

export const newFrameElement = (
  opts: {
    name?: string;
  } & ElementConstructorOpts,
): NonDeleted<CauscapeFrameElement> => {
  const frameElement = newElementWith(
    {
      ..._newElementBase<CauscapeFrameElement>("frame", opts),
      type: "frame",
      name: opts?.name || null,
    },
    {},
  );

  return frameElement;
};

export const newMagicFrameElement = (
  opts: {
    name?: string;
  } & ElementConstructorOpts,
): NonDeleted<CauscapeMagicFrameElement> => {
  const frameElement = newElementWith(
    {
      ..._newElementBase<CauscapeMagicFrameElement>("magicframe", opts),
      type: "magicframe",
      name: opts?.name || null,
    },
    {},
  );

  return frameElement;
};

/**
 * The point of the text box its alignment pins, as ratios of width/height.
 *
 * This is the point that stays put as the text grows — see the sides passed to
 * `adjustXYWithRotation` in `getAdjustedDimensions`.
 */
export const getTextAnchorRatios = (opts: {
  textAlign: CauscapeTextElement["textAlign"];
  verticalAlign: CauscapeTextElement["verticalAlign"];
}) => ({
  x: opts.textAlign === "center" ? 0.5 : opts.textAlign === "right" ? 1 : 0,
  y:
    opts.verticalAlign === VERTICAL_ALIGN.MIDDLE
      ? 0.5
      : opts.verticalAlign === VERTICAL_ALIGN.BOTTOM
      ? 1
      : 0,
});

/** computes element x/y offset based on textAlign/verticalAlign */
const getTextElementPositionOffsets = (
  opts: {
    textAlign: CauscapeTextElement["textAlign"];
    verticalAlign: CauscapeTextElement["verticalAlign"];
  },
  metrics: {
    width: number;
    height: number;
  },
) => {
  const ratios = getTextAnchorRatios(opts);

  return {
    x: metrics.width * ratios.x,
    y: metrics.height * ratios.y,
  };
};

export const newTextElement = (
  opts: {
    text: string;
    originalText?: string;
    fontSize?: number;
    fontFamily?: FontFamilyValues;
    textAlign?: TextAlign;
    verticalAlign?: VerticalAlign;
    containerId?: CauscapeTextContainer["id"] | null;
    lineHeight?: CauscapeTextElement["lineHeight"];
    autoResize?: CauscapeTextElement["autoResize"];
  } & ElementConstructorOpts,
): NonDeleted<CauscapeTextElement> => {
  const fontFamily = opts.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = opts.fontSize || DEFAULT_FONT_SIZE;
  const lineHeight = opts.lineHeight || getLineHeight(fontFamily);
  const text = normalizeText(opts.text);
  const metrics = measureText(
    text,
    getFontString({ fontFamily, fontSize }),
    lineHeight,
  );
  const textAlign = opts.textAlign || DEFAULT_TEXT_ALIGN;
  const verticalAlign = opts.verticalAlign || DEFAULT_VERTICAL_ALIGN;
  const offsets = getTextElementPositionOffsets(
    { textAlign, verticalAlign },
    metrics,
  );

  const textElementProps: NonDeleted<CauscapeTextElement> = {
    ..._newElementBase<CauscapeTextElement>("text", opts),
    text,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign,
    x: opts.x - offsets.x,
    y: opts.y - offsets.y,
    width: metrics.width,
    height: metrics.height,
    containerId: opts.containerId || null,
    originalText: opts.originalText ?? text,
    autoResize: opts.autoResize ?? true,
    lineHeight,
  };

  const textElement: NonDeleted<CauscapeTextElement> = newElementWith(
    textElementProps,
    {},
  );

  return textElement;
};

const getAdjustedDimensions = (
  element: CauscapeTextElement,
  elementsMap: ElementsMap,
  nextText: string,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} => {
  let { width: nextWidth, height: nextHeight } = measureText(
    nextText,
    getFontString(element),
    element.lineHeight,
  );

  // wrapped text
  if (!element.autoResize) {
    nextWidth = element.width;
  }

  const { textAlign, verticalAlign } = element;
  let x: number;
  let y: number;
  if (
    textAlign === "center" &&
    verticalAlign === VERTICAL_ALIGN.MIDDLE &&
    !element.containerId &&
    element.autoResize
  ) {
    const prevMetrics = measureText(
      element.text,
      getFontString(element),
      element.lineHeight,
    );
    const offsets = getTextElementPositionOffsets(element, {
      width: nextWidth - prevMetrics.width,
      height: nextHeight - prevMetrics.height,
    });

    x = element.x - offsets.x;
    y = element.y - offsets.y;
  } else {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);

    const [nextX1, nextY1, nextX2, nextY2] = getResizedElementAbsoluteCoords(
      element,
      nextWidth,
      nextHeight,
      false,
    );
    const deltaX1 = (x1 - nextX1) / 2;
    const deltaY1 = (y1 - nextY1) / 2;
    const deltaX2 = (x2 - nextX2) / 2;
    const deltaY2 = (y2 - nextY2) / 2;

    // grow away from the edge(s) the alignment anchors the text to, so that
    // the anchor stays put as the text is edited. `verticalAlign` has no
    // visual effect on unbound text, but standalone text bound to an arrow
    // endpoint uses it to pin the side the arrow attaches to.
    [x, y] = adjustXYWithRotation(
      {
        n:
          verticalAlign === VERTICAL_ALIGN.MIDDLE ||
          verticalAlign === VERTICAL_ALIGN.BOTTOM,
        s:
          verticalAlign === VERTICAL_ALIGN.MIDDLE ||
          verticalAlign === VERTICAL_ALIGN.TOP,
        e: textAlign === "center" || textAlign === "left",
        w: textAlign === "center" || textAlign === "right",
      },
      element.x,
      element.y,
      element.angle,
      deltaX1,
      deltaY1,
      deltaX2,
      deltaY2,
    );
  }

  return {
    width: nextWidth,
    height: nextHeight,
    x: Number.isFinite(x) ? x : element.x,
    y: Number.isFinite(y) ? y : element.y,
  };
};

const adjustXYWithRotation = (
  sides: {
    n?: boolean;
    e?: boolean;
    s?: boolean;
    w?: boolean;
  },
  x: number,
  y: number,
  angle: number,
  deltaX1: number,
  deltaY1: number,
  deltaX2: number,
  deltaY2: number,
): [number, number] => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (sides.e && sides.w) {
    x += deltaX1 + deltaX2;
  } else if (sides.e) {
    x += deltaX1 * (1 + cos);
    y += deltaX1 * sin;
    x += deltaX2 * (1 - cos);
    y += deltaX2 * -sin;
  } else if (sides.w) {
    x += deltaX1 * (1 - cos);
    y += deltaX1 * -sin;
    x += deltaX2 * (1 + cos);
    y += deltaX2 * sin;
  }

  if (sides.n && sides.s) {
    y += deltaY1 + deltaY2;
  } else if (sides.n) {
    x += deltaY1 * sin;
    y += deltaY1 * (1 - cos);
    x += deltaY2 * -sin;
    y += deltaY2 * (1 + cos);
  } else if (sides.s) {
    x += deltaY1 * -sin;
    y += deltaY1 * (1 + cos);
    x += deltaY2 * sin;
    y += deltaY2 * (1 - cos);
  }
  return [x, y];
};

export const refreshTextDimensions = (
  textElement: CauscapeTextElement,
  container: CauscapeTextContainer | null,
  elementsMap: ElementsMap,
  text = textElement.text,
) => {
  if (textElement.isDeleted) {
    return;
  }
  if (container || !textElement.autoResize) {
    text = wrapText(
      text,
      getFontString(textElement),
      container
        ? getBoundTextMaxWidth(container, textElement)
        : textElement.width,
    );
  }
  const dimensions = getAdjustedDimensions(textElement, elementsMap, text);
  return { text, ...dimensions };
};

export const newFreeDrawElement = (
  opts: {
    type: "freedraw";
    points?: CauscapeFreeDrawElement["points"];
    simulatePressure: boolean;
    strokeOptions?: CauscapeFreeDrawElement["strokeOptions"];
    pressures?: CauscapeFreeDrawElement["pressures"];
  } & ElementConstructorOpts,
): NonDeleted<CauscapeFreeDrawElement> => {
  return {
    ..._newElementBase<CauscapeFreeDrawElement>(opts.type, opts),
    points: opts.points || [],
    pressures: opts.pressures || [],
    simulatePressure: opts.simulatePressure,
    strokeOptions: opts.strokeOptions ?? {
      variability: "variable",
      streamline: DEFAULT_STROKE_STREAMLINE,
    },
  };
};

export const newLinearElement = (
  opts: {
    type: CauscapeLinearElement["type"];
    points?: CauscapeLinearElement["points"];
    polygon?: CauscapeLineElement["polygon"];
  } & ElementConstructorOpts,
): NonDeleted<CauscapeLinearElement> => {
  const element = {
    ..._newElementBase<CauscapeLinearElement>(opts.type, opts),
    points: opts.points || [],

    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };

  if (isLineElement(element)) {
    const lineElement: NonDeleted<CauscapeLineElement> = {
      ...element,
      polygon: opts.polygon ?? false,
    };

    return lineElement;
  }

  return element;
};

export const newArrowElement = <T extends boolean>(
  opts: {
    type: CauscapeArrowElement["type"];
    startArrowhead?: Arrowhead | null;
    endArrowhead?: Arrowhead | null;
    points?: CauscapeArrowElement["points"];
    elbowed?: T;
    fixedSegments?: CauscapeElbowArrowElement["fixedSegments"] | null;
  } & ElementConstructorOpts,
): T extends true
  ? NonDeleted<CauscapeElbowArrowElement>
  : NonDeleted<CauscapeArrowElement> => {
  if (opts.elbowed) {
    return {
      ..._newElementBase<CauscapeElbowArrowElement>(opts.type, opts),
      points: opts.points || [],
      startBinding: null,
      endBinding: null,
      startArrowhead: opts.startArrowhead || null,
      endArrowhead: opts.endArrowhead || null,
      elbowed: true,
      fixedSegments: opts.fixedSegments || [],
      startIsSpecial: false,
      endIsSpecial: false,
    } as NonDeleted<CauscapeElbowArrowElement>;
  }

  return {
    ..._newElementBase<CauscapeArrowElement>(opts.type, opts),
    points: opts.points || [],
    startBinding: null,
    endBinding: null,
    startArrowhead: opts.startArrowhead || null,
    endArrowhead: opts.endArrowhead || null,
    elbowed: false,
  } as T extends true
    ? NonDeleted<CauscapeElbowArrowElement>
    : NonDeleted<CauscapeArrowElement>;
};

export const newImageElement = (
  opts: {
    type: CauscapeImageElement["type"];
    status?: CauscapeImageElement["status"];
    fileId?: CauscapeImageElement["fileId"];
    scale?: CauscapeImageElement["scale"];
    crop?: CauscapeImageElement["crop"];
  } & ElementConstructorOpts,
): NonDeleted<CauscapeImageElement> => {
  return {
    ..._newElementBase<CauscapeImageElement>("image", opts),
    // in the future we'll support changing stroke color for some SVG elements,
    // and `transparent` will likely mean "use original colors of the image"
    strokeColor: "transparent",
    status: opts.status ?? "pending",
    fileId: opts.fileId ?? null,
    scale: opts.scale ?? [1, 1],
    crop: opts.crop ?? null,
  };
};

export const newCauscapeNodeElement = (
  opts: {
    label: string;
    kind?: CauscapeNodeKind;
    github?: GithubRef;
    cache?: GithubCache & { snapshotAt: string };
  } & CauscapeArchitectureNodeMetadata &
    ElementConstructorOpts,
): NonDeleted<CauscapeNodeElement> => {
  const {
    label,
    kind = "variable",
    github,
    cache,
    environment,
    health,
    description,
    technologies,
    references,
    ...elementOpts
  } = opts;
  const nodeData = normalizeCauscapeNodeData({
    label,
    kind,
    github,
    cache,
    environment,
    health,
    description,
    technologies,
    references,
  });
  const defaultSize = getCauscapeNodeSize(nodeData);
  const isArchitecture = isCauscapeArchitectureNodeKind(kind);

  const base = _newElementBase<CauscapeNodeElement>("causcape-node", {
    ...elementOpts,
    width: elementOpts.width ?? defaultSize.width,
    height: elementOpts.height ?? defaultSize.height,
    roundness: elementOpts.roundness ?? { type: ROUNDNESS.ADAPTIVE_RADIUS },
    backgroundColor:
      elementOpts.backgroundColor ??
      (isArchitecture ? COLOR_PALETTE.white : COLOR_PALETTE.blue[0]),
    strokeColor:
      elementOpts.strokeColor ?? (isArchitecture ? "#9db6d8" : "#1e1e1e"),
    fillStyle: elementOpts.fillStyle ?? "solid",
    strokeWidth: elementOpts.strokeWidth ?? (isArchitecture ? 1 : 2),
    roughness: elementOpts.roughness ?? (isArchitecture ? 0 : 1),
  });

  return {
    ...base,
    causcape: nodeData,
  };
};

export const newCauscapeEdgeElement = (
  opts: {
    fromNodeId: string;
    toNodeId: string;
    label?: string;
    points?: CauscapeEdgeElement["points"];
    startBinding?: FixedPointBinding | null;
    endBinding?: FixedPointBinding | null;
    startArrowhead?: Arrowhead | null;
    endArrowhead?: Arrowhead | null;
  } & ElementConstructorOpts,
): NonDeleted<CauscapeEdgeElement> => {
  const {
    fromNodeId,
    toNodeId,
    label,
    points: requestedPoints,
    startBinding = null,
    endBinding = null,
    startArrowhead = null,
    endArrowhead = "arrow",
    ...elementOpts
  } = opts;
  const fallbackPoints: LocalPoint[] = [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(
      Math.max(0, elementOpts.width ?? 100),
      Math.max(0, elementOpts.height ?? 0),
    ),
  ];
  const points = (
    Array.isArray(requestedPoints)
      ? requestedPoints.filter(isValidPoint)
      : fallbackPoints
  ) as LocalPoint[];
  const safePoints = points.length >= 2 ? points : fallbackPoints;
  const { width, height } = getSizeFromPoints(safePoints);
  return {
    ..._newElementBase<CauscapeEdgeElement>("causcape-edge", {
      ...elementOpts,
      width,
      height,
    }),
    points: safePoints,
    startBinding,
    endBinding,
    startArrowhead,
    endArrowhead,
    elbowed: false,
    causcape: normalizeCauscapeEdgeData({ fromNodeId, toNodeId, label }),
  };
};

import type { LocalPoint, Radians } from "@causcape/math";

import type {
  FONT_FAMILY,
  ROUNDNESS,
  TEXT_ALIGN,
  THEME,
  VERTICAL_ALIGN,
} from "@causcape/common";

import type {
  MakeBrand,
  MarkNonNullable,
  Merge,
  ValueOf,
} from "@causcape/common/utility-types";

export type ChartType = "bar" | "line" | "radar";
export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type FontFamilyKeys = keyof typeof FONT_FAMILY;
export type FontFamilyValues = typeof FONT_FAMILY[FontFamilyKeys];
export type Theme = typeof THEME[keyof typeof THEME];
export type FontString = string & { _brand: "fontString" };
export type GroupId = string;
export type PointerType = "mouse" | "pen" | "touch";
export type StrokeRoundness = "round" | "sharp";
export type RoundnessType = ValueOf<typeof ROUNDNESS>;
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type TextAlign = typeof TEXT_ALIGN[keyof typeof TEXT_ALIGN];

type VerticalAlignKeys = keyof typeof VERTICAL_ALIGN;
export type VerticalAlign = typeof VERTICAL_ALIGN[VerticalAlignKeys];
export type FractionalIndex = string & { _brand: "franctionalIndex" };

export type BoundElement = Readonly<{
  id: CauscapeLinearElement["id"];
  type: "arrow" | "causcape-edge" | "text";
}>;

type _CauscapeElementBase = Readonly<{
  id: string;
  x: number;
  y: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roundness: null | { type: RoundnessType; value?: number };
  roughness: number;
  opacity: number;
  width: number;
  height: number;
  angle: Radians;
  /** Random integer used to seed shape generation so that the roughjs shape
      doesn't differ across renders. */
  seed: number;
  /** Integer that is sequentially incremented on each change. Used to reconcile
      elements during collaboration or when saving to server. */
  version: number;
  /** Random integer that is regenerated on each change.
      Used for deterministic reconciliation of updates during collaboration,
      in case the versions (see above) are identical. */
  versionNonce: number;
  /** String in a fractional form defined by https://github.com/rocicorp/fractional-indexing.
      Used for ordering in multiplayer scenarios, such as during reconciliation or undo / redo.
      Always kept in sync with the array order by `syncMovedIndices` and `syncInvalidIndices`.
      Could be null, i.e. for new elements which were not yet assigned to the scene. */
  index: FractionalIndex | null;
  isDeleted: boolean;
  /** List of groups the element belongs to.
      Ordered from deepest to shallowest. */
  groupIds: readonly GroupId[];
  frameId: string | null;
  /** other elements that are bound to this element */
  boundElements: readonly BoundElement[] | null;
  /** epoch (ms) timestamp of last element update */
  updated: number;
  link: string | null;
  locked: boolean;
  customData?: Record<string, any>;
}>;

export type CauscapeSelectionElement = _CauscapeElementBase & {
  type: "selection";
};

export type CauscapeRectangleElement = _CauscapeElementBase & {
  type: "rectangle";
};

export type CauscapeDiamondElement = _CauscapeElementBase & {
  type: "diamond";
};

export type CauscapeEllipseElement = _CauscapeElementBase & {
  type: "ellipse";
};

export type CauscapeEmbeddableElement = _CauscapeElementBase &
  Readonly<{
    type: "embeddable";
  }>;

export type MagicGenerationData =
  | {
      status: "pending";
    }
  | { status: "done"; html: string }
  | {
      status: "error";
      message?: string;
      code: "ERR_GENERATION_INTERRUPTED" | string;
    };

export type CauscapeIframeElement = _CauscapeElementBase &
  Readonly<{
    type: "iframe";
    // TODO move later to AI-specific frame
    customData?: { generationData?: MagicGenerationData };
  }>;

export type CauscapeIframeLikeElement =
  | CauscapeIframeElement
  | CauscapeEmbeddableElement;

export type IframeData =
  | {
      intrinsicSize: { w: number; h: number };
      error?: Error;
      sandbox?: { allowSameOrigin?: boolean };
    } & (
      | { type: "video" | "generic"; link: string }
      | { type: "document"; srcdoc: (theme: Theme) => string }
    );

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};

export type CauscapeImageElement = _CauscapeElementBase &
  Readonly<{
    type: "image";
    fileId: FileId | null;
    /** whether respective file is persisted */
    status: "pending" | "saved" | "error";
    /** X and Y scale factors <-1, 1>, used for image axis flipping */
    scale: [number, number];
    /** whether an element is cropped */
    crop: ImageCrop | null;
  }>;

export type InitializedCauscapeImageElement = MarkNonNullable<
  CauscapeImageElement,
  "fileId"
>;

export type CauscapeFrameElement = _CauscapeElementBase & {
  type: "frame";
  name: string | null;
};

export type CauscapeMagicFrameElement = _CauscapeElementBase & {
  type: "magicframe";
  name: string | null;
};

export type CauscapeArchitectureNodeKind =
  | "service"
  | "datastore"
  | "queue"
  | "external-system"
  | "user";

export type CauscapeNodeHealth = "healthy" | "degraded" | "failed" | "unknown";

export type CauscapeReferenceType =
  | "repository"
  | "dashboard"
  | "documentation"
  | "runbook";

export type CauscapeReference = Readonly<{
  type: CauscapeReferenceType;
  url: string;
  label?: string;
}>;

export type CauscapeArchitectureNodeMetadata = Readonly<{
  environment?: string;
  health?: CauscapeNodeHealth;
  description?: string;
  technologies?: readonly string[];
  references?: readonly CauscapeReference[];
}>;

export type CauscapeNodeKind =
  | CauscapeArchitectureNodeKind
  | "variable"
  | "github-issue"
  | "github-pr"
  | "github-commit"
  | "github-repo";

export type GithubRef =
  | {
      kind: "github-issue";
      owner: string;
      repo: string;
      number: number;
      url: string;
    }
  | {
      kind: "github-pr";
      owner: string;
      repo: string;
      number: number;
      url: string;
    }
  | {
      kind: "github-commit";
      owner: string;
      repo: string;
      sha: string;
      url: string;
    }
  | { kind: "github-repo"; owner: string; repo: string; url: string };

export type GithubIssuePrCache = {
  title: string;
  state: "open" | "closed" | "merged" | string;
  updatedAt: string;
  labels?: string[];
  author?: string;
  stale?: boolean;
};

export type GithubCommitCache = {
  message: string;
  author: string;
  date: string;
  stats?: { add: number; del: number };
  updatedAt: string;
  stale?: boolean;
};

export type GithubRepoCache = {
  stars: number;
  language: string;
  description: string;
  updatedAt: string;
  stale?: boolean;
};

export type GithubCache =
  | GithubIssuePrCache
  | GithubCommitCache
  | GithubRepoCache;

export type CauscapeNodeData =
  | { schemaVersion: 1; kind: "variable"; label: string }
  | ({
      schemaVersion: 1;
      kind: CauscapeArchitectureNodeKind;
      label: string;
    } & CauscapeArchitectureNodeMetadata)
  | {
      schemaVersion: 1;
      kind: "github-issue" | "github-pr" | "github-commit" | "github-repo";
      label: string;
      github?: GithubRef;
      cache?: GithubCache & { snapshotAt: string };
    };

export type CauscapeNodeElement = _CauscapeElementBase &
  Readonly<{
    type: "causcape-node";
    causcape: CauscapeNodeData & Record<string, unknown>;
  }>;

export type CauscapeFrameLikeElement =
  | CauscapeFrameElement
  | CauscapeMagicFrameElement;

/**
 * These are elements that don't have any additional properties.
 */
export type CauscapeGenericElement =
  | CauscapeSelectionElement
  | CauscapeRectangleElement
  | CauscapeDiamondElement
  | CauscapeEllipseElement;

export type CauscapeFlowchartNodeElement =
  | CauscapeRectangleElement
  | CauscapeDiamondElement
  | CauscapeEllipseElement;

export type CauscapeRectanguloidElement =
  | CauscapeRectangleElement
  | CauscapeNodeElement
  | CauscapeImageElement
  | CauscapeTextElement
  | CauscapeFreeDrawElement
  | CauscapeIframeLikeElement
  | CauscapeFrameLikeElement
  | CauscapeEmbeddableElement
  | CauscapeSelectionElement;

/**
 * CauscapeElement should be JSON serializable and (eventually) contain
 * no computed data. The list of all CauscapeElements should be shareable
 * between peers and contain no state local to the peer.
 */
export type CauscapeElement =
  | CauscapeGenericElement
  | CauscapeTextElement
  | CauscapeLinearElement
  | CauscapeArrowElement
  | CauscapeFreeDrawElement
  | CauscapeImageElement
  | CauscapeFrameElement
  | CauscapeMagicFrameElement
  | CauscapeIframeElement
  | CauscapeEmbeddableElement
  | CauscapeNodeElement
  | CauscapeEdgeElement;

export type CauscapeNonSelectionElement = Exclude<
  CauscapeElement,
  CauscapeSelectionElement
>;

export type Ordered<TElement extends CauscapeElement> = TElement & {
  index: FractionalIndex;
};

export type OrderedCauscapeElement = Ordered<CauscapeElement>;

export type NonDeleted<TElement extends CauscapeElement> = TElement & {
  isDeleted: false;
};

export type NonDeletedCauscapeElement = NonDeleted<CauscapeElement>;

export type CauscapeTextElement = _CauscapeElementBase &
  Readonly<{
    type: "text";
    fontSize: number;
    fontFamily: FontFamilyValues;
    text: string;
    textAlign: TextAlign;
    verticalAlign: VerticalAlign;
    containerId: CauscapeGenericElement["id"] | null;
    originalText: string;
    /**
     * If `true` the width will fit the text. If `false`, the text will
     * wrap to fit the width.
     *
     * @default true
     */
    autoResize: boolean;
    /**
     * Unitless line height (aligned to W3C). To get line height in px, multiply
     *  with font size (using `getLineHeightInPx` helper).
     */
    lineHeight: number & { _brand: "unitlessLineHeight" };
  }>;

export type CauscapeBindableElement =
  | CauscapeRectangleElement
  | CauscapeDiamondElement
  | CauscapeEllipseElement
  | CauscapeTextElement
  | CauscapeImageElement
  | CauscapeIframeElement
  | CauscapeEmbeddableElement
  | CauscapeFrameElement
  | CauscapeMagicFrameElement
  | CauscapeNodeElement;

export type CauscapeTextContainer =
  | CauscapeRectangleElement
  | CauscapeDiamondElement
  | CauscapeEllipseElement
  | CauscapeArrowElement;

export type CauscapeTextElementWithContainer = {
  containerId: CauscapeTextContainer["id"];
} & CauscapeTextElement;

export type FixedPoint = [number, number];

export type BindMode = "inside" | "orbit" | "skip";

export type FixedPointBinding = {
  elementId: CauscapeBindableElement["id"];

  // Represents the fixed point binding information in form of a vertical and
  // horizontal ratio (i.e. a percentage value in the 0.0-1.0 range). This ratio
  // gives the user selected fixed point by multiplying the bound element width
  // with fixedPoint[0] and the bound element height with fixedPoint[1] to get the
  // bound element-local point coordinate.
  fixedPoint: FixedPoint;

  // Determines whether the arrow remains outside the shape or is allowed to
  // go all the way inside the shape up to the exact fixed point.
  mode: BindMode;
};

type Index = number;

export type PointsPositionUpdates = Map<
  Index,
  { point: LocalPoint; isDragging?: boolean }
>;

export type CardinalityArrowhead =
  | "cardinality_one"
  | "cardinality_many"
  | "cardinality_one_or_many"
  | "cardinality_exactly_one"
  | "cardinality_zero_or_one"
  | "cardinality_zero_or_many";

export type ArrowheadLegacy =
  | "dot"
  | "crowfoot_one"
  | "crowfoot_many"
  | "crowfoot_one_or_many";

export type Arrowhead =
  | "arrow"
  | "bar"
  | "circle"
  | "circle_outline"
  | "triangle"
  | "triangle_outline"
  | "diamond"
  | "diamond_outline"
  | CardinalityArrowhead;

export type AnyArrowhead = Arrowhead | ArrowheadLegacy;

export type CauscapeLinearElement = _CauscapeElementBase &
  Readonly<{
    type: "line" | "arrow";
    points: readonly LocalPoint[];
    startBinding: FixedPointBinding | null;
    endBinding: FixedPointBinding | null;
    startArrowhead: Arrowhead | null;
    endArrowhead: Arrowhead | null;
  }>;

export type CauscapeLineElement = CauscapeLinearElement &
  Readonly<{
    type: "line";
    polygon: boolean;
  }>;

export type FixedSegment = {
  start: LocalPoint;
  end: LocalPoint;
  index: Index;
};

export type CauscapeArrowElement = CauscapeLinearElement &
  Readonly<{
    type: "arrow";
    elbowed: boolean;
  }>;

export type CauscapeElbowArrowElement = Merge<
  CauscapeArrowElement,
  {
    elbowed: true;
    fixedSegments: readonly FixedSegment[] | null;
    startBinding: FixedPointBinding | null;
    endBinding: FixedPointBinding | null;
    /**
     * Marks that the 3rd point should be used as the 2nd point of the arrow in
     * order to temporarily hide the first segment of the arrow without losing
     * the data from the points array. It allows creating the expected arrow
     * path when the arrow with fixed segments is bound on a horizontal side and
     * moved to a vertical and vica versa.
     */
    startIsSpecial: boolean | null;
    /**
     * Marks that the 3rd point backwards from the end should be used as the 2nd
     * point of the arrow in order to temporarily hide the last segment of the
     * arrow without losing the data from the points array. It allows creating
     * the expected arrow path when the arrow with fixed segments is bound on a
     * horizontal side and moved to a vertical and vica versa.
     */
    endIsSpecial: boolean | null;
  }
>;

export type CauscapeEdgeElement = _CauscapeElementBase &
  Readonly<{
    type: "causcape-edge";
    points: readonly LocalPoint[];
    startBinding: FixedPointBinding | null;
    endBinding: FixedPointBinding | null;
    startArrowhead: Arrowhead | null;
    endArrowhead: Arrowhead | null;
    elbowed: boolean;
    causcape: {
      schemaVersion: 1;
      fromNodeId: string;
      toNodeId: string;
      label?: string;
    } & Record<string, unknown>;
  }>;

export type CauscapeGraphElement = CauscapeNodeElement | CauscapeEdgeElement;

export type StrokeVariability = "variable" | "constant";

export type StrokeOptions = Readonly<{
  variability: StrokeVariability;
  streamline: number;
}>;

export type CauscapeFreeDrawElement = _CauscapeElementBase &
  Readonly<{
    type: "freedraw";
    points: readonly LocalPoint[];
    pressures: readonly number[];
    simulatePressure: boolean;
    strokeOptions: StrokeOptions;
  }>;

export type FileId = string & { _brand: "FileId" };

export type CauscapeElementType = CauscapeElement["type"];

/**
 * Map of causcape elements.
 * Unspecified whether deleted or non-deleted.
 * Can be a subset of Scene elements.
 */
export type ElementsMap = Map<CauscapeElement["id"], CauscapeElement>;

/**
 * Map of non-deleted elements.
 * Can be a subset of Scene elements.
 */
export type NonDeletedElementsMap = Map<
  CauscapeElement["id"],
  NonDeletedCauscapeElement
> &
  MakeBrand<"NonDeletedElementsMap">;

/**
 * Map of all causcape Scene elements, including deleted.
 * Not a subset. Use this type when you need access to current Scene elements.
 */
export type SceneElementsMap = Map<
  CauscapeElement["id"],
  Ordered<CauscapeElement>
> &
  MakeBrand<"SceneElementsMap">;

/**
 * Map of all non-deleted Scene elements.
 * Not a subset. Use this type when you need access to current Scene elements.
 */
export type NonDeletedSceneElementsMap = Map<
  CauscapeElement["id"],
  Ordered<NonDeletedCauscapeElement>
> &
  MakeBrand<"NonDeletedSceneElementsMap">;

export type ElementsMapOrArray =
  | readonly CauscapeElement[]
  | Readonly<ElementsMap>;

export type NonDeletedElementsMapOrArray =
  | readonly NonDeletedCauscapeElement[]
  | Readonly<NonDeletedElementsMap | NonDeletedSceneElementsMap>;

export type CauscapeLinearElementSubType =
  | "line"
  | "sharpArrow"
  | "curvedArrow"
  | "elbowArrow";

export type ConvertibleGenericTypes = "rectangle" | "diamond" | "ellipse";
export type ConvertibleLinearTypes = CauscapeLinearElementSubType;
export type ConvertibleTypes = ConvertibleGenericTypes | ConvertibleLinearTypes;

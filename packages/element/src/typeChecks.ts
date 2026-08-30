import { ROUNDNESS, assertNever } from "@causcape/common";

import { pointsEqual } from "@causcape/math";

import type { ElementOrToolType } from "@causcape/causcape/types";

import type { MarkNonNullable } from "@causcape/common/utility-types";

import type {
  CauscapeElement,
  CauscapeTextElement,
  CauscapeEmbeddableElement,
  CauscapeLinearElement,
  CauscapeBindableElement,
  CauscapeFreeDrawElement,
  InitializedCauscapeImageElement,
  CauscapeImageElement,
  CauscapeTextElementWithContainer,
  CauscapeTextContainer,
  CauscapeFrameElement,
  RoundnessType,
  CauscapeFrameLikeElement,
  CauscapeElementType,
  CauscapeIframeElement,
  CauscapeIframeLikeElement,
  CauscapeMagicFrameElement,
  CauscapeArrowElement,
  CauscapeElbowArrowElement,
  CauscapeLineElement,
  CauscapeFlowchartNodeElement,
  CauscapeLinearElementSubType,
  CauscapeNodeElement,
  CauscapeEdgeElement,
  CauscapeGraphElement,
} from "./types";

export const isInitializedImageElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & InitializedCauscapeImageElement => {
  return !!element && element.type === "image" && !!element.fileId;
};

export const isImageElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeImageElement => {
  return !!element && element.type === "image";
};

export const isEmbeddableElement = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeEmbeddableElement => {
  return !!element && element.type === "embeddable";
};

export const isIframeElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeIframeElement => {
  return !!element && element.type === "iframe";
};

export const isIframeLikeElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeIframeLikeElement => {
  return (
    !!element && (element.type === "iframe" || element.type === "embeddable")
  );
};

export const isTextElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeTextElement => {
  return element != null && element.type === "text";
};

export const isFrameElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeFrameElement => {
  return element != null && element.type === "frame";
};

export const isMagicFrameElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeMagicFrameElement => {
  return element != null && element.type === "magicframe";
};

export const isFrameLikeElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeFrameLikeElement => {
  return (
    element != null &&
    (element.type === "frame" || element.type === "magicframe")
  );
};

export const isFreeDrawElement = <T extends CauscapeElement>(
  element?: T | null,
): element is T & CauscapeFreeDrawElement => {
  return element != null && isFreeDrawElementType(element.type);
};

export const isFreeDrawElementType = (
  elementType: CauscapeElementType,
): boolean => {
  return elementType === "freedraw";
};

export const isLinearElement = <T extends CauscapeElement>(
  element?: T | null,
): element is T & CauscapeLinearElement => {
  return element != null && isLinearElementType(element.type);
};

export const isLineElement = <T extends CauscapeElement>(
  element?: T | null,
): element is T & CauscapeLineElement => {
  return element != null && element.type === "line";
};

export const isArrowElement = <T extends CauscapeElement>(
  element?: T | null,
): element is T & CauscapeArrowElement => {
  return element != null && element.type === "arrow";
};

export const isElbowArrow = <T extends CauscapeElement>(
  element?: T,
): element is T & CauscapeElbowArrowElement => {
  return isArrowElement(element) && element.elbowed;
};

/**
 * sharp or curved arrow, but not elbow
 */
export const isSimpleArrow = <T extends CauscapeElement>(
  element?: T,
): element is T & CauscapeArrowElement => {
  return isArrowElement(element) && !element.elbowed;
};

export const isSharpArrow = <T extends CauscapeElement>(
  element?: T,
): element is T & CauscapeArrowElement => {
  return isArrowElement(element) && !element.elbowed && !element.roundness;
};

export const isCurvedArrow = <T extends CauscapeElement>(
  element?: T,
): element is T & CauscapeArrowElement => {
  return (
    isArrowElement(element) && !element.elbowed && element.roundness !== null
  );
};

export const isLinearElementType = (
  elementType: ElementOrToolType,
): boolean => {
  return (
    elementType === "arrow" ||
    elementType === "line" ||
    elementType === "causcape-edge"
  );
};

export const isBindingElement = <T extends CauscapeElement>(
  element?: T | null,
  includeLocked = true,
): element is T & CauscapeArrowElement => {
  return (
    element != null &&
    (!element.locked || includeLocked === true) &&
    isBindingElementType(element.type)
  );
};

export const isBindingElementType = (
  elementType: ElementOrToolType,
): boolean => {
  return elementType === "arrow";
};

export const isBindableElement = <T extends CauscapeElement>(
  element: T | null | undefined,
  includeLocked = true,
): element is T & CauscapeBindableElement => {
  return (
    element != null &&
    (!element.locked || includeLocked === true) &&
    (element.type === "rectangle" ||
      element.type === "diamond" ||
      element.type === "ellipse" ||
      element.type === "image" ||
      element.type === "iframe" ||
      element.type === "embeddable" ||
      element.type === "frame" ||
      element.type === "magicframe" ||
      element.type === "causcape-node" ||
      (element.type === "text" && !element.containerId))
  );
};

export const isRectanguloidElement = <T extends CauscapeElement>(
  element?: T | null,
): element is T & CauscapeBindableElement => {
  return (
    element != null &&
    (element.type === "rectangle" ||
      element.type === "causcape-node" ||
      element.type === "diamond" ||
      element.type === "image" ||
      element.type === "iframe" ||
      element.type === "embeddable" ||
      element.type === "frame" ||
      element.type === "magicframe" ||
      (element.type === "text" && !element.containerId))
  );
};

// TODO: Remove this when proper distance calculation is introduced
// @see binding.ts:distanceToBindableElement()
export const isRectangularElement = <T extends CauscapeElement>(
  element?: T | null,
): element is T & CauscapeBindableElement => {
  return (
    element != null &&
    (element.type === "rectangle" ||
      element.type === "causcape-node" ||
      element.type === "image" ||
      element.type === "text" ||
      element.type === "iframe" ||
      element.type === "embeddable" ||
      element.type === "frame" ||
      element.type === "magicframe" ||
      element.type === "freedraw")
  );
};

export const isTextBindableContainer = <T extends CauscapeElement>(
  element: T | null,
  includeLocked = true,
): element is T & CauscapeTextContainer => {
  return (
    element != null &&
    (!element.locked || includeLocked === true) &&
    (element.type === "rectangle" ||
      element.type === "diamond" ||
      element.type === "ellipse" ||
      isArrowElement(element))
  );
};

export const isCauscapeElement = (element: any): element is CauscapeElement => {
  const type: CauscapeElementType | undefined = element?.type;
  if (!type) {
    return false;
  }
  switch (type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "arrow":
    case "line":
    case "freedraw":
    case "frame":
    case "magicframe":
    case "image":
    case "embeddable":
    case "iframe":
    case "text":
    case "selection":
    case "causcape-node":
    case "causcape-edge": {
      return true;
    }
    default: {
      assertNever(type, null);
      return false;
    }
  }
};

export const isFlowchartNodeElement = <T extends CauscapeElement>(
  element: T,
): element is T & CauscapeFlowchartNodeElement => {
  return (
    element.type === "rectangle" ||
    element.type === "ellipse" ||
    element.type === "diamond"
  );
};

export const hasBoundTextElement = <T extends CauscapeElement>(
  element: T | null,
): element is T & MarkNonNullable<CauscapeBindableElement, "boundElements"> => {
  return (
    isTextBindableContainer(element) &&
    !!element.boundElements?.some(({ type }) => type === "text")
  );
};

export const isBoundToContainer = <T extends CauscapeElement>(
  element: T | null,
): element is T & CauscapeTextElementWithContainer => {
  return (
    element !== null &&
    "containerId" in element &&
    element.containerId !== null &&
    isTextElement(element)
  );
};

export const isArrowBoundToElement = (element: CauscapeArrowElement) => {
  return !!element.startBinding || !!element.endBinding;
};

export const isUsingAdaptiveRadius = (type: string) =>
  type === "rectangle" ||
  type === "causcape-node" ||
  type === "embeddable" ||
  type === "iframe" ||
  type === "image";

export const isUsingProportionalRadius = (type: string) =>
  type === "line" ||
  type === "arrow" ||
  type === "causcape-edge" ||
  type === "diamond";

export const canApplyRoundnessTypeToElement = (
  roundnessType: RoundnessType,
  element: CauscapeElement,
) => {
  if (
    (roundnessType === ROUNDNESS.ADAPTIVE_RADIUS ||
      // if legacy roundness, it can be applied to elements that currently
      // use adaptive radius
      roundnessType === ROUNDNESS.LEGACY) &&
    isUsingAdaptiveRadius(element.type)
  ) {
    return true;
  }
  if (
    roundnessType === ROUNDNESS.PROPORTIONAL_RADIUS &&
    isUsingProportionalRadius(element.type)
  ) {
    return true;
  }

  return false;
};

export const getDefaultRoundnessTypeForElement = (element: CauscapeElement) => {
  if (isUsingProportionalRadius(element.type)) {
    return {
      type: ROUNDNESS.PROPORTIONAL_RADIUS,
    };
  }

  if (isUsingAdaptiveRadius(element.type)) {
    return {
      type: ROUNDNESS.ADAPTIVE_RADIUS,
    };
  }

  return null;
};

export const getLinearElementSubType = (
  element: CauscapeLinearElement,
): CauscapeLinearElementSubType => {
  if (isSharpArrow(element)) {
    return "sharpArrow";
  }
  if (isCurvedArrow(element)) {
    return "curvedArrow";
  }
  if (isElbowArrow(element)) {
    return "elbowArrow";
  }
  return "line";
};

/**
 * Checks if current element points meet all the conditions for polygon=true
 * (this isn't a element type check, for that use isLineElement).
 *
 * If you want to check if points *can* be turned into a polygon, use
 *  canBecomePolygon(points).
 */
export const isValidPolygon = (
  points: CauscapeLineElement["points"],
): boolean => {
  return points.length > 3 && pointsEqual(points[0], points[points.length - 1]);
};

export const canBecomePolygon = (
  points: CauscapeLineElement["points"],
): boolean => {
  return (
    points.length > 3 ||
    // 3-point polygons can't have all points in a single line
    (points.length === 3 && !pointsEqual(points[0], points[points.length - 1]))
  );
};

export const isEligibleFrameChildType = (type: ElementOrToolType) => {
  switch (type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "arrow":
    case "line":
    case "freedraw":
    case "text":
    case "image":
    case "frame":
    case "embeddable":
    case "causcape-node":
    case "causcape-edge": {
      return true;
    }
    default: {
      return false;
    }
  }
};
export const isCauscapeNodeElement = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return !!element && element.type === "causcape-node";
};

export const isCauscapeEdgeElement = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeEdgeElement => {
  return !!element && element.type === "causcape-edge";
};

export const isCauscapeGraphElement = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeGraphElement => {
  return isCauscapeNodeElement(element) || isCauscapeEdgeElement(element);
};

export const isGithubNode = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return isCauscapeNodeElement(element) && element.causcape.kind !== "variable";
};

export const isVariableNode = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return isCauscapeNodeElement(element) && element.causcape.kind === "variable";
};

export const isGithubIssueNode = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return (
    isCauscapeNodeElement(element) && element.causcape.kind === "github-issue"
  );
};

export const isGithubPrNode = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return (
    isCauscapeNodeElement(element) && element.causcape.kind === "github-pr"
  );
};

export const isGithubCommitNode = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return (
    isCauscapeNodeElement(element) && element.causcape.kind === "github-commit"
  );
};

export const isGithubRepoNode = <T extends CauscapeElement>(
  element: T | null | undefined,
): element is T & CauscapeNodeElement => {
  return (
    isCauscapeNodeElement(element) && element.causcape.kind === "github-repo"
  );
};

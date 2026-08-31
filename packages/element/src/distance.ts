import {
  curvePointDistance,
  distanceToLineSegment,
  pointRotateRads,
} from "@causcape/math";

import { ellipse, ellipseDistanceFromPoint } from "@causcape/math/ellipse";

import type { GlobalPoint, Radians } from "@causcape/math";

import {
  deconstructDiamondElement,
  deconstructLinearOrFreeDrawElement,
  deconstructRectanguloidElement,
} from "./utils";

import { elementCenterPoint } from "./bounds";

import type {
  ElementsMap,
  CauscapeDiamondElement,
  CauscapeElement,
  CauscapeEllipseElement,
  CauscapeFreeDrawElement,
  CauscapeLinearElement,
  CauscapeRectanguloidElement,
} from "./types";

export const distanceToElement = (
  element: CauscapeElement,
  elementsMap: ElementsMap,
  p: GlobalPoint,
): number => {
  switch (element.type) {
    case "selection":
    case "rectangle":
    case "causcape-node":
    case "image":
    case "text":
    case "iframe":
    case "embeddable":
    case "frame":
    case "magicframe":
      return distanceToRectanguloidElement(element, elementsMap, p);
    case "diamond":
      return distanceToDiamondElement(element, elementsMap, p);
    case "ellipse":
      return distanceToEllipseElement(element, elementsMap, p);
    case "line":
    case "arrow":
    case "freedraw":
    case "causcape-edge":
      return distanceToLinearOrFreeDraElement(
        element as unknown as import("./types").CauscapeLinearElement,
        elementsMap,
        p,
      );
  }
  return 0;
};

/**
 * Returns the distance of a point and the provided rectangular-shaped element,
 * accounting for roundness and rotation
 *
 * @param element The rectanguloid element
 * @param p The point to consider
 * @returns The eucledian distance to the outline of the rectanguloid element
 */
const distanceToRectanguloidElement = (
  element: CauscapeRectanguloidElement,
  elementsMap: ElementsMap,
  p: GlobalPoint,
) => {
  const center = elementCenterPoint(element, elementsMap);
  // To emulate a rotated rectangle we rotate the point in the inverse angle
  // instead. It's all the same distance-wise.
  const rotatedPoint = pointRotateRads(p, center, -element.angle as Radians);

  // Get the element's building components we can test against
  const [sides, corners] = deconstructRectanguloidElement(element);

  return Math.min(
    ...sides.map((s) => distanceToLineSegment(rotatedPoint, s)),
    ...corners.map((a) => curvePointDistance(a, rotatedPoint)),
  );
};

/**
 * Returns the distance of a point and the provided diamond element, accounting
 * for roundness and rotation
 *
 * @param element The diamond element
 * @param p The point to consider
 * @returns The eucledian distance to the outline of the diamond
 */
const distanceToDiamondElement = (
  element: CauscapeDiamondElement,
  elementsMap: ElementsMap,
  p: GlobalPoint,
): number => {
  const center = elementCenterPoint(element, elementsMap);

  // Rotate the point to the inverse direction to simulate the rotated diamond
  // points. It's all the same distance-wise.
  const rotatedPoint = pointRotateRads(p, center, -element.angle as Radians);

  const [sides, curves] = deconstructDiamondElement(element);

  return Math.min(
    ...sides.map((s) => distanceToLineSegment(rotatedPoint, s)),
    ...curves.map((a) => curvePointDistance(a, rotatedPoint)),
  );
};

/**
 * Returns the distance of a point and the provided ellipse element, accounting
 * for roundness and rotation
 *
 * @param element The ellipse element
 * @param p The point to consider
 * @returns The eucledian distance to the outline of the ellipse
 */
const distanceToEllipseElement = (
  element: CauscapeEllipseElement,
  elementsMap: ElementsMap,
  p: GlobalPoint,
): number => {
  const center = elementCenterPoint(element, elementsMap);
  return ellipseDistanceFromPoint(
    // Instead of rotating the ellipse, rotate the point to the inverse angle
    pointRotateRads(p, center, -element.angle as Radians),
    ellipse(center, element.width / 2, element.height / 2),
  );
};

const distanceToLinearOrFreeDraElement = (
  element: CauscapeLinearElement | CauscapeFreeDrawElement,
  elementsMap: ElementsMap,
  p: GlobalPoint,
) => {
  const [lines, curves] = deconstructLinearOrFreeDrawElement(
    element,
    elementsMap,
  );
  return Math.min(
    ...lines.map((s) => distanceToLineSegment(p, s)),
    ...curves.map((a) => curvePointDistance(a, p)),
  );
};

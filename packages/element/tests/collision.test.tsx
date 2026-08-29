import { arrayToMap, reseed } from "@excalidraw/common";
import { type GlobalPoint, type LocalPoint, pointFrom } from "@excalidraw/math";
import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@excalidraw/element";
import { Excalidraw } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { UI } from "@excalidraw/excalidraw/tests/helpers/ui";
import "@excalidraw/utils/test-utils";
import { render } from "@excalidraw/excalidraw/tests/test-utils";

import * as distance from "../src/distance";
import { hitElementItself, shouldTestInside } from "../src/collision";

describe("Causcape node interior interaction", () => {
  it("allows dragging from painted content instead of only the border", () => {
    const node = newCauscapeNodeElement({
      x: 40,
      y: 60,
      label: "Booking API",
      kind: "service",
      health: "healthy",
    });
    const elementsMap = arrayToMap([node]);

    expect(shouldTestInside(node)).toBe(true);
    expect(
      hitElementItself({
        point: pointFrom<GlobalPoint>(node.x + node.width / 2, node.y + 80),
        element: node,
        threshold: 0,
        elementsMap,
      }),
    ).toBe(true);
  });
});

describe("check rotated elements can be hit:", () => {
  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("arrow", () => {
    UI.createElement("arrow", {
      x: 0,
      y: 0,
      width: 124,
      height: 302,
      angle: 1.8700426423973724,
      points: [
        [0, 0],
        [120, -198],
        [-4, -302],
      ] as LocalPoint[],
    });
    const hit = hitElementItself({
      point: pointFrom<GlobalPoint>(88, -68),
      element: window.h.elements[0],
      threshold: 10,
      elementsMap: window.h.scene.getNonDeletedElementsMap(),
    });
    expect(hit).toBe(true);
  });
});

describe("Causcape edge hit testing", () => {
  it("does not throw when the pointer is near a graph edge", () => {
    const edge = newCauscapeEdgeElement({
      fromNodeId: "from",
      toNodeId: "to",
      x: 0,
      y: 0,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 0)],
    });
    const elementsMap = arrayToMap([edge]);

    expect(() =>
      distance.distanceToElement(
        edge,
        elementsMap,
        pointFrom<GlobalPoint>(50, 0),
      ),
    ).not.toThrow();
  });
});

describe("hitElementItself cache", () => {
  beforeEach(async () => {
    // reset cache
    hitElementItself({
      point: pointFrom<GlobalPoint>(50, 50),
      element: API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        backgroundColor: "#ffffff",
      }),
      threshold: Infinity,
      elementsMap: new Map([]),
    });

    localStorage.clear();
    reseed(7);
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("reuses cached result when threshold increases", () => {
    const element = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#ffffff",
    });
    const elementsMap = arrayToMap([element]);
    const point = pointFrom<GlobalPoint>(100.5, 50);

    const distanceSpy = jest.spyOn(distance, "distanceToElement");

    expect(
      hitElementItself({
        point,
        element,
        threshold: 1,
        elementsMap,
      }),
    ).toBe(true);

    expect(distanceSpy).toHaveBeenCalledTimes(1);

    expect(
      hitElementItself({
        point,
        element,
        threshold: 10,
        elementsMap,
      }),
    ).toBe(true);

    expect(distanceSpy).toHaveBeenCalledTimes(1);

    distanceSpy.mockRestore();
  });

  it("does not reuse cache when threshold decreases", () => {
    const element = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "transparent",
    });
    const elementsMap = arrayToMap([element]);
    const point = pointFrom<GlobalPoint>(105, 50);

    const distanceSpy = jest.spyOn(distance, "distanceToElement");

    expect(
      hitElementItself({
        point,
        element,
        threshold: 10,
        elementsMap,
      }),
    ).toBe(true);

    expect(distanceSpy).toHaveBeenCalledTimes(1);

    expect(
      hitElementItself({
        point,
        element,
        threshold: 6,
        elementsMap,
      }),
    ).toBe(true);

    expect(distanceSpy).toHaveBeenCalledTimes(2);
    distanceSpy.mockRestore();
  });

  it("invalidates cache when element version changes", () => {
    const element = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#ffffff",
    });
    const elementsMap = arrayToMap([element]);
    const point = pointFrom<GlobalPoint>(100.5, 50);

    const distanceSpy = jest.spyOn(distance, "distanceToElement");

    expect(
      hitElementItself({
        point,
        element,
        threshold: 1,
        elementsMap,
      }),
    ).toBe(true);

    expect(distanceSpy).toHaveBeenCalledTimes(1);

    const movedElement = {
      ...element,
      version: element.version + 1,
      versionNonce: element.versionNonce + 1,
    };

    expect(
      hitElementItself({
        point,
        element: movedElement,
        threshold: 1,
        elementsMap,
      }),
    ).toBe(true);

    expect(distanceSpy).toHaveBeenCalledTimes(2);
    distanceSpy.mockRestore();
  });

  it("override does not affect caching", () => {
    const element = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "transparent",
    });
    const elementsMap = arrayToMap([element]);
    const point = pointFrom<GlobalPoint>(50, 50);

    const distanceSpy = jest.spyOn(distance, "distanceToElement");

    expect(
      hitElementItself({
        point,
        element,
        threshold: 10,
        elementsMap,
      }),
    ).toBe(false);

    expect(distanceSpy).toHaveBeenCalledTimes(1);

    expect(
      hitElementItself({
        point,
        element,
        threshold: 10,
        elementsMap,
        overrideShouldTestInside: true,
      }),
    ).toBe(true);
  });
});

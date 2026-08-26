import { describe, expect, it } from "vitest";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import {
  createPreparedEngineeringShape,
  deriveCanvasObjects,
  getSelectedCanvasObjectIds,
  PREPARED_ENGINEERING_SHAPES,
} from "./causcapeCanvasObjects";

describe("Causcape canvas objects", () => {
  it("offers every agreed technology-neutral prepared shape", () => {
    expect(PREPARED_ENGINEERING_SHAPES.map((shape) => shape.kind)).toEqual([
      "service",
      "database",
      "queue",
      "external-system",
      "actor",
      "trust-boundary",
      "resource",
    ]);
  });

  it("creates a prepared shape as one grouped, named canvas object", () => {
    const elements = createPreparedEngineeringShape({
      kind: "service",
      objectId: "payment-service",
      name: "Payment Service",
      x: 100,
      y: 200,
    });

    expect(elements).toHaveLength(2);
    expect(elements.map((element) => element.groupIds)).toEqual([
      ["payment-service"],
      ["payment-service"],
    ]);
    expect(elements[0]).toMatchObject({
      type: "rectangle",
      customData: {
        causcape: {
          kind: "service",
          name: "Payment Service",
          prepared: true,
        },
      },
    });

    expect(deriveCanvasObjects(elements, {})).toEqual({
      "payment-service": {
        id: "payment-service",
        elementIds: elements.map((element) => element.id),
        name: "Payment Service",
        metadata: { kind: "service" },
        state: "active",
      },
    });
  });

  it("treats a duplicated prepared group as a new canvas object", () => {
    const original = createPreparedEngineeringShape({
      kind: "database",
      objectId: "ledger",
      name: "Ledger",
      x: 0,
      y: 0,
    });
    const duplicate = original.map((element, index) => ({
      ...element,
      id: `copy-${index}`,
      groupIds: ["ledger-copy"],
    })) as OrderedExcalidrawElement[];

    const objects = deriveCanvasObjects([...original, ...duplicate], {});

    expect(Object.keys(objects).sort()).toEqual(["ledger", "ledger-copy"]);
    expect(objects["ledger-copy"]).toMatchObject({
      name: "Ledger",
      metadata: { kind: "database" },
    });
  });

  it("maps selected elements to logical object IDs and retains deleted names", () => {
    const elements = createPreparedEngineeringShape({
      kind: "queue",
      objectId: "events",
      name: "Order events",
      x: 0,
      y: 0,
    });

    expect(
      getSelectedCanvasObjectIds(elements, { [elements[1].id]: true }),
    ).toEqual(["events"]);

    const deleted = elements.map((element) => ({
      ...element,
      isDeleted: true,
    })) as OrderedExcalidrawElement[];
    expect(
      deriveCanvasObjects(deleted, {
        events: {
          id: "events",
          elementIds: elements.map((element) => element.id),
          name: "Order events",
          metadata: { kind: "queue" },
          state: "active",
        },
      }),
    ).toEqual({
      events: {
        id: "events",
        elementIds: [],
        name: "Order events",
        lastKnownName: "Order events",
        metadata: { kind: "queue" },
        state: "deleted",
      },
    });
  });
});

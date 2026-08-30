import { describe, expect, it } from "vitest";

import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@causcape/element";

import type { OrderedCauscapeElement } from "@causcape/element/types";

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
      "flow",
      "flow-bidirectional",
      "flow-interrupted",
    ]);
  });

  it("creates a prepared flow as a named directional arrow", () => {
    const elements = createPreparedEngineeringShape({
      kind: "flow",
      objectId: "payment-request",
      name: "Payment request",
      x: 100,
      y: 200,
    });

    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({
      type: "arrow",
      endArrowhead: "arrow",
      groupIds: ["payment-request"],
      customData: {
        causcape: {
          kind: "flow",
          name: "Payment request",
          prepared: true,
        },
      },
    });
    expect(deriveCanvasObjects(elements, {})).toEqual({
      "payment-request": {
        id: "payment-request",
        elementIds: elements.map((element) => element.id),
        name: "Payment request",
        metadata: { kind: "flow" },
        state: "active",
      },
    });
  });

  it("creates an interrupted flow with inspectable failure metadata", () => {
    const elements = createPreparedEngineeringShape({
      kind: "flow-interrupted",
      objectId: "failed-payment-request",
      x: 100,
      y: 200,
    });

    expect(elements[0]).toMatchObject({
      type: "arrow",
      strokeColor: "#e03131",
      strokeStyle: "dashed",
      endArrowhead: "arrow",
      customData: {
        causcape: {
          kind: "flow",
          metadata: { kind: "flow", status: "interrupted" },
        },
      },
    });
    expect(
      deriveCanvasObjects(elements, {})["failed-payment-request"],
    ).toMatchObject({
      name: "Interrupted flow",
      metadata: { kind: "flow", status: "interrupted" },
    });
  });

  it("creates a bidirectional flow with arrowheads and direction metadata", () => {
    const elements = createPreparedEngineeringShape({
      kind: "flow-bidirectional",
      objectId: "service-sync",
      x: 100,
      y: 200,
    });

    expect(elements[0]).toMatchObject({
      type: "arrow",
      startArrowhead: "arrow",
      endArrowhead: "arrow",
      customData: {
        causcape: {
          kind: "flow",
          metadata: { kind: "flow", direction: "bidirectional" },
        },
      },
    });
    expect(deriveCanvasObjects(elements, {})["service-sync"]).toMatchObject({
      name: "Bidirectional flow",
      metadata: { kind: "flow", direction: "bidirectional" },
    });
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

  it("makes graph nodes and labelled relationships available to document references", () => {
    const api = newCauscapeNodeElement({
      id: "api-service",
      kind: "service",
      label: "Payments API",
      x: 0,
      y: 0,
    });
    const queue = newCauscapeNodeElement({
      id: "payment-events",
      kind: "queue",
      label: "Payment events",
      x: 600,
      y: 0,
    });
    const publishes = newCauscapeEdgeElement({
      id: "publishes-events",
      fromNodeId: api.id,
      toNodeId: queue.id,
      label: "publishes",
      x: 0,
      y: 0,
    });

    expect(
      deriveCanvasObjects(
        [api, queue, publishes] as OrderedCauscapeElement[],
        {},
      ),
    ).toMatchObject({
      "api-service": {
        id: "api-service",
        name: "Payments API",
        metadata: { kind: "service" },
        state: "active",
      },
      "payment-events": {
        id: "payment-events",
        name: "Payment events",
        metadata: { kind: "queue" },
        state: "active",
      },
      "publishes-events": {
        id: "publishes-events",
        name: "publishes",
        metadata: {
          kind: "relationship",
          fromNodeId: "api-service",
          toNodeId: "payment-events",
        },
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
    })) as OrderedCauscapeElement[];

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
    })) as OrderedCauscapeElement[];
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

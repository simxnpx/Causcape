import { describe, expect, it } from "vitest";

import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@causcape/element";

import type { CanvasObject, DataFlowScenario } from "@causcape/core";
import type { OrderedCauscapeElement } from "@causcape/element/types";

import {
  getDataFlowObjectOptions,
  resolveDataFlowPlayback,
} from "./dataFlowScenarios";

const objects: Readonly<Record<string, CanvasObject>> = {
  frontend: {
    id: "frontend",
    elementIds: ["frontend"],
    name: "Web frontend",
    metadata: { kind: "service" },
    state: "active",
  },
  backend: {
    id: "backend",
    elementIds: ["backend"],
    name: "API backend",
    metadata: { kind: "service" },
    state: "active",
  },
  request: {
    id: "request",
    elementIds: ["request"],
    name: "calls",
    metadata: { kind: "relationship" },
    state: "active",
  },
};

const elements = [
  newCauscapeNodeElement({
    id: "frontend",
    kind: "service",
    label: "Web frontend",
    x: 0,
    y: 0,
  }),
  newCauscapeNodeElement({
    id: "backend",
    kind: "service",
    label: "API backend",
    x: 500,
    y: 0,
  }),
  newCauscapeEdgeElement({
    id: "request",
    fromNodeId: "frontend",
    toNodeId: "backend",
    relationship: "calls",
    label: "POST /checkout",
    x: 0,
    y: 0,
  }),
] as OrderedCauscapeElement[];

const flow: DataFlowScenario = {
  id: "round-trip",
  name: "Request round trip",
  steps: [
    {
      id: "send",
      objectId: "frontend",
      title: "Send request",
      signal: "default",
    },
    {
      id: "handle",
      objectId: "backend",
      title: "Handle request",
      signal: "success",
    },
    {
      id: "respond",
      objectId: "frontend",
      title: "Receive response",
      signal: "success",
    },
  ],
};

describe("data flow scenarios", () => {
  it("offers active architecture objects but not relationship objects", () => {
    expect(getDataFlowObjectOptions(objects)).toEqual([
      { id: "backend", name: "API backend", kind: "service" },
      { id: "frontend", name: "Web frontend", kind: "service" },
    ]);
  });

  it("resolves forward and reverse transitions from the existing architecture", () => {
    expect(resolveDataFlowPlayback(flow, 1, objects, elements)).toMatchObject({
      activeStep: flow.steps[1],
      activeNodeElementIds: ["backend"],
      activeTransition: { edgeElementId: "request", direction: "forward" },
      completedNodeElementIds: ["frontend"],
    });

    expect(resolveDataFlowPlayback(flow, 2, objects, elements)).toMatchObject({
      activeStep: flow.steps[2],
      activeNodeElementIds: ["frontend"],
      activeTransition: { edgeElementId: "request", direction: "reverse" },
      completedNodeElementIds: ["backend"],
      completedEdgeElementIds: [],
    });
  });

  it("keeps an unconnected step playable and reports the missing transition", () => {
    const disconnected = {
      ...flow,
      steps: [flow.steps[0], { ...flow.steps[1], objectId: "unknown" }],
    };

    expect(
      resolveDataFlowPlayback(disconnected, 1, objects, elements),
    ).toMatchObject({
      activeNodeElementIds: [],
      activeTransition: null,
      hasMissingConnection: true,
    });
  });

  it("does not require a connector between consecutive events on one component", () => {
    const cacheFlow = {
      ...flow,
      steps: [
        { ...flow.steps[0], objectId: "backend", title: "Check cache" },
        { ...flow.steps[1], objectId: "backend", title: "Cache miss" },
      ],
    };

    expect(
      resolveDataFlowPlayback(cacheFlow, 1, objects, elements),
    ).toMatchObject({
      activeNodeElementIds: ["backend"],
      activeTransition: null,
      hasMissingConnection: false,
    });
  });
});

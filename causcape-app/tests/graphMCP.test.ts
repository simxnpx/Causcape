import { COLOR_PALETTE } from "@causcape/common";
import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@causcape/element";

import { routeCauscapeEdge } from "@causcape/graph";

import type { CauscapeElement } from "@causcape/element/types";
import type { CauscapeImperativeAPI } from "@causcape/causcape/types";

import { createGraphMCPHandlers } from "../mcp/graphMCP";

const createHarness = () => {
  const first = newCauscapeNodeElement({
    label: "Incident: elevated API latency",
    x: 0,
    y: 0,
  });
  const second = newCauscapeNodeElement({
    label: "Database connection pool exhaustion",
    x: 240,
    y: 0,
  });
  let elements: CauscapeElement[] = [first, second];
  const resetScene = vi.fn(() => {
    elements = [];
  });
  const api = {
    getSceneElements: () => elements.filter((element) => !element.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      width: 1200,
      height: 800,
      zoom: { value: 1 },
    }),
    updateScene: vi.fn(
      ({ elements: next }: { elements: CauscapeElement[] }) => {
        elements = next;
      },
    ),
    resetScene,
  } as unknown as CauscapeImperativeAPI;

  return {
    api,
    first,
    second,
    resetScene,
    getElements: () => elements,
  };
};

describe("graph WebMCP handlers", () => {
  it("uses the light blue Causcape card color for new nodes", () => {
    const node = newCauscapeNodeElement({ label: "color", x: 0, y: 0 });

    expect(node.backgroundColor).toBe(COLOR_PALETTE.blue[0]);
  });

  it("searches node labels and GitHub metadata with ranked matches", async () => {
    const harness = createHarness();
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });

    const result = await handlers.searchNodes({ query: "latency" });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toMatchObject({
      id: harness.first.id,
      label: "Incident: elevated API latency",
    });
  });

  it("resets every scene element through the imperative API", async () => {
    const harness = createHarness();
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });

    await expect(handlers.resetCanvas()).resolves.toEqual({
      ok: true,
      cleared: 2,
    });
    expect(harness.resetScene).toHaveBeenCalledWith({
      resetLoadingState: true,
    });
    expect(harness.getElements()).toEqual([]);
  });

  it("updates all requested node settings in one scene operation", async () => {
    const harness = createHarness();
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });

    const result = await handlers.updateNodeSettings({
      id: harness.first.id,
      settings: {
        backgroundColor: "#c0eb75",
        strokeColor: "#1b1b1b",
        fillStyle: "solid",
        opacity: 72,
        locked: true,
      },
    });

    expect(result).toMatchObject({
      id: harness.first.id,
      changed: true,
      settings: {
        backgroundColor: "#c0eb75",
        strokeColor: "#1b1b1b",
        fillStyle: "solid",
        opacity: 72,
        locked: true,
      },
    });
    const updated = harness
      .getElements()
      .find((element) => element.id === harness.first.id);
    expect(updated).toMatchObject({
      backgroundColor: "#c0eb75",
      strokeColor: "#1b1b1b",
      fillStyle: "solid",
      opacity: 72,
      locked: true,
    });
    expect(harness.api.updateScene).toHaveBeenCalledTimes(1);
  });

  it("lays out nodes in causal layers and routes edges to card borders", async () => {
    const harness = createHarness();
    const geometry = routeCauscapeEdge(harness.first, harness.second);
    const edge = newCauscapeEdgeElement({
      fromNodeId: harness.first.id,
      toNodeId: harness.second.id,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      points: geometry.points as never,
    });
    harness.api.updateScene({
      elements: [...harness.getElements(), edge],
    });
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });

    const result = await handlers.autoLayout({ originX: 20, originY: 30 });

    expect(result.movedNodeIds).toEqual([harness.first.id, harness.second.id]);
    expect(result.routedEdgeIds).toEqual([edge.id]);
    expect(result.metrics.overlapCount).toBe(0);
    const updatedEdge = harness
      .getElements()
      .find((element) => element.id === edge.id);
    expect(updatedEdge).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
    if (updatedEdge?.type === "causcape-edge") {
      expect(updatedEdge.points).toHaveLength(2);
    }
  });

  it("re-routes incident edges when an agent moves a node", async () => {
    const harness = createHarness();
    const geometry = routeCauscapeEdge(harness.first, harness.second);
    const edge = newCauscapeEdgeElement({
      fromNodeId: harness.first.id,
      toNodeId: harness.second.id,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      points: geometry.points as never,
    });
    harness.api.updateScene({
      elements: [...harness.getElements(), edge],
    });
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });
    const initialStartX = geometry.x + geometry.points[0][0];

    await handlers.updateElement({
      id: harness.first.id,
      patch: { x: 80 },
    });

    const updatedNode = harness
      .getElements()
      .find((element) => element.id === harness.first.id);
    const updatedEdge = harness
      .getElements()
      .find((element) => element.id === edge.id);
    expect(updatedNode).toBeDefined();
    expect(updatedEdge?.type).toBe("causcape-edge");
    if (
      updatedNode?.type === "causcape-node" &&
      updatedEdge?.type === "causcape-edge"
    ) {
      const updatedStartX = updatedEdge.x + updatedEdge.points[0][0];
      expect(updatedStartX).toBeCloseTo(updatedNode.x + updatedNode.width);
      expect(updatedStartX).not.toBe(initialStartX);
    }
  });
});

import { COLOR_PALETTE } from "@causcape/common";
import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@causcape/element";

import { getCauscapeEdgeBindings, routeCauscapeEdge } from "@causcape/graph";

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
  it("tells agents to repair cramped but connected lanes and verifies the repair", async () => {
    const harness = createHarness();
    const first = { ...harness.first, x: 80, y: 80, width: 600, height: 200 };
    const second = {
      ...harness.second,
      x: 80,
      y: 440,
      width: 600,
      height: 200,
    };
    const geometry = {
      x: 64,
      y: 180,
      width: 16,
      height: 360,
      points: [
        [16, 0],
        [0, 0],
        [0, 360],
        [16, 360],
      ] as [number, number][],
    };
    const edge = newCauscapeEdgeElement({
      fromNodeId: first.id,
      toNodeId: second.id,
      ...geometry,
      points: geometry.points as never,
      ...getCauscapeEdgeBindings(first, second, geometry),
    });
    harness.api.updateScene({
      elements: [
        { ...first, boundElements: [{ id: edge.id, type: "causcape-edge" }] },
        { ...second, boundElements: [{ id: edge.id, type: "causcape-edge" }] },
        edge,
      ],
    });
    const handlers = createGraphMCPHandlers({ getApi: () => harness.api });
    const before = await handlers.validateGraph();
    expect(before.metrics.edgeDetachedCount).toBe(0);
    expect(before.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EDGE_ENDPOINT_CLEARANCE" }),
        expect.objectContaining({ code: "EDGE_NODE_CLEARANCE" }),
      ]),
    );
    expect(before.recommendedAction).toMatchObject({ tool: "autoLayout" });
    await handlers.autoLayout();
    const after = await handlers.validateGraph();
    expect(after.metrics.edgeClearanceCount).toBe(0);
    expect(after.recommendedAction).toBeNull();
  });

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

  it("creates semantic edges with persistent endpoint bindings", async () => {
    const harness = createHarness();
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });

    const result = await handlers.createCauscapeEdge({
      fromNodeId: harness.first.id,
      toNodeId: harness.second.id,
      relationship: "calls",
      label: "request",
    });
    const edge = harness
      .getElements()
      .find((element) => element.id === result.id);
    const first = harness
      .getElements()
      .find((element) => element.id === harness.first.id);
    const second = harness
      .getElements()
      .find((element) => element.id === harness.second.id);

    expect(edge).toMatchObject({
      startBinding: {
        elementId: harness.first.id,
        fixedPoint: [1, 0.5],
        mode: "inside",
      },
      endBinding: {
        elementId: harness.second.id,
        fixedPoint: [0, 0.5],
        mode: "inside",
      },
    });
    expect(first?.boundElements).toContainEqual({
      id: result.id,
      type: "causcape-edge",
    });
    expect(second?.boundElements).toContainEqual({
      id: result.id,
      type: "causcape-edge",
    });
  });

  it("validates the stored route geometry instead of an ideal replacement", async () => {
    const harness = createHarness();
    const detached = newCauscapeEdgeElement({
      fromNodeId: harness.first.id,
      toNodeId: harness.second.id,
      x: 80,
      y: 500,
      points: [
        [0, 0],
        [120, 0],
      ] as never,
    });
    harness.api.updateScene({
      elements: [...harness.getElements(), detached],
    });
    const handlers = createGraphMCPHandlers({
      getApi: () => harness.api,
    });

    const result = await handlers.validateGraph();

    expect(result.metrics.edgeDetachedCount).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EDGE_DETACHED",
          elementIds: [detached.id],
        }),
      ]),
    );
    expect(result.recommendedAction).toMatchObject({ tool: "autoLayout" });
  });

  it("detects missing node back-references for otherwise bound edges", async () => {
    const harness = createHarness();
    const geometry = routeCauscapeEdge(harness.first, harness.second);
    const edge = newCauscapeEdgeElement({
      fromNodeId: harness.first.id,
      toNodeId: harness.second.id,
      x: geometry.x,
      y: geometry.y,
      points: geometry.points as never,
      ...getCauscapeEdgeBindings(harness.first, harness.second, geometry),
    });
    harness.api.updateScene({
      elements: [...harness.getElements(), edge],
    });
    const handlers = createGraphMCPHandlers({ getApi: () => harness.api });

    const result = await handlers.validateGraph();

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EDGE_BACK_REFERENCE_MISSING",
          elementIds: [edge.id, harness.first.id, harness.second.id],
        }),
      ]),
    );
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
      expect(updatedEdge.startBinding?.elementId).toBe(harness.first.id);
      expect(updatedEdge.endBinding?.elementId).toBe(harness.second.id);
    }
    const updatedFirst = harness
      .getElements()
      .find((element) => element.id === harness.first.id);
    const updatedSecond = harness
      .getElements()
      .find((element) => element.id === harness.second.id);
    expect(updatedFirst?.boundElements).toContainEqual({
      id: edge.id,
      type: "causcape-edge",
    });
    expect(updatedSecond?.boundElements).toContainEqual({
      id: edge.id,
      type: "causcape-edge",
    });
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
      const updatedStartY = updatedEdge.y + updatedEdge.points[0][1];
      // Moving the card can close the right-hand corridor. The repaired edge
      // may use another side, but must remain attached to the moved card.
      const binding = updatedEdge.startBinding!;
      expect(binding.elementId).toBe(updatedNode.id);
      expect(updatedStartX).toBeCloseTo(
        updatedNode.x + updatedNode.width * binding.fixedPoint[0],
      );
      expect(updatedStartY).toBeCloseTo(
        updatedNode.y + updatedNode.height * binding.fixedPoint[1],
      );
      expect(
        binding.fixedPoint.some((value) => value === 0 || value === 1),
      ).toBe(true);
      expect(updatedStartX).not.toBe(initialStartX);
    }
  });

  it("records automatic repairs so an agent session can roll them back", async () => {
    const harness = createHarness();
    const geometry = routeCauscapeEdge(harness.first, harness.second);
    const edge = newCauscapeEdgeElement({
      fromNodeId: harness.first.id,
      toNodeId: harness.second.id,
      x: geometry.x,
      y: geometry.y,
      points: geometry.points as never,
    });
    harness.api.updateScene({ elements: [...harness.getElements(), edge] });
    const handlers = createGraphMCPHandlers({ getApi: () => harness.api });
    await handlers.beginAgentSession({ sessionId: "repair-session" });

    await handlers.autoLayout();
    const repaired = harness
      .getElements()
      .find((element) => element.id === edge.id);
    expect(
      repaired?.type === "causcape-edge" && repaired.startBinding,
    ).not.toBe(null);

    const rollback = await handlers.rollbackAgentChanges({
      sessionId: "repair-session",
    });
    const restored = harness
      .getElements()
      .find((element) => element.id === edge.id);
    expect(rollback.rolledBack).toBe(true);
    expect(restored?.type === "causcape-edge" && restored.startBinding).toBe(
      null,
    );
  });
});

import ELK from "elkjs/lib/elk.bundled.js";

import type { CanvasObject, JsonValue, Project } from "@causcape/core";

import type { EngineeringModel, EngineeringNodeKind } from "./contracts";

const elk = new ELK();

const styleForKind = (kind: EngineeringNodeKind): Record<string, JsonValue> => {
  switch (kind) {
    case "service":
      return { strokeColor: "#1971c2", backgroundColor: "#dbeafe" };
    case "database":
      return { strokeColor: "#2b8a3e", backgroundColor: "#d3f9d8" };
    case "queue":
      return { strokeColor: "#6741d9", backgroundColor: "#e5dbff" };
    case "external-system":
      return { strokeColor: "#d9480f", backgroundColor: "#ffe8cc" };
    case "actor":
      return { strokeColor: "#a07900", backgroundColor: "#fff3bf" };
    case "trust-boundary":
      return {
        strokeColor: "#495057",
        backgroundColor: "transparent",
        strokeStyle: "dashed" as const,
      };
    case "resource":
      return { strokeColor: "#495057", backgroundColor: "#e9ecef" };
  }
};

const stableNumber = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
};

const baseElement = (
  id: string,
  type: "rectangle" | "text" | "arrow",
  x: number,
  y: number,
  width: number,
  height: number,
): Record<string, JsonValue> => ({
  id,
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: "#1b1b1f",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: type === "rectangle" ? { type: 3 } : null,
  seed: stableNumber(`seed:${id}`),
  version: 1,
  versionNonce: stableNumber(`version:${id}`),
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
});

const assertModel = (model: EngineeringModel) => {
  const nodeIds = new Set<string>();
  for (const node of model.nodes) {
    if (!node.id || !node.name || nodeIds.has(node.id)) {
      throw new Error(`Invalid or duplicate engineering node ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of model.edges) {
    if (
      !edge.id ||
      edgeIds.has(edge.id) ||
      !nodeIds.has(edge.from) ||
      !nodeIds.has(edge.to)
    ) {
      throw new Error(`Invalid engineering edge ${edge.id}`);
    }
    edgeIds.add(edge.id);
  }
};

export type LayoutResult = {
  readonly scene: Project["canvas"]["scene"];
  readonly objects: Readonly<Record<string, CanvasObject>>;
};

export const layoutEngineeringModel = async (
  model: EngineeringModel,
): Promise<LayoutResult> => {
  assertModel(model);
  const nodes = [...model.nodes].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const edges = [...model.edges].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const graph = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": model.direction ?? "RIGHT",
      "elk.randomSeed": "17",
      "elk.spacing.nodeNode": "70",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? 220,
      height: node.height ?? 100,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
    })),
  });
  const positions = new Map(
    graph.children?.map((node) => [node.id, node] as const),
  );

  const converted: Record<string, JsonValue>[] = [];
  for (const node of nodes) {
    const position = positions.get(node.id);
    const kind = node.kind ?? "resource";
    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    const width = position?.width ?? node.width ?? 220;
    const height = position?.height ?? node.height ?? 100;
    const labelId = `label-node-${node.id}`;
    const shape: Record<string, JsonValue> = {
      ...baseElement(`node-${node.id}`, "rectangle", x, y, width, height),
      ...styleForKind(kind),
      groupIds: [node.id],
      boundElements: [{ id: labelId, type: "text" }],
      customData: {
        causcape: { objectId: node.id, name: node.name, kind },
      },
    };
    const label: Record<string, JsonValue> = {
      ...baseElement(
        labelId,
        "text",
        x + 10,
        y + height / 2 - 12.5,
        width - 20,
        25,
      ),
      strokeWidth: 1,
      roughness: 0,
      text: node.name,
      fontSize: 20,
      fontFamily: 2,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: shape.id,
      originalText: node.name,
      autoResize: true,
      lineHeight: 1.25,
      groupIds: [node.id],
      customData: {
        causcape: { objectId: node.id, name: node.name, kind },
      },
    };
    converted.push(shape, label);
  }
  for (const edge of edges) {
    const start = positions.get(edge.from);
    const end = positions.get(edge.to);
    const startX = (start?.x ?? 0) + (start?.width ?? 220) / 2;
    const startY = (start?.y ?? 0) + (start?.height ?? 100) / 2;
    const endX = (end?.x ?? 0) + (end?.width ?? 220) / 2;
    const endY = (end?.y ?? 0) + (end?.height ?? 100) / 2;
    const labelId = `label-edge-${edge.id}`;
    const arrow: Record<string, JsonValue> = {
      ...baseElement(
        `edge-${edge.id}`,
        "arrow",
        startX,
        startY,
        endX - startX,
        endY - startY,
      ),
      strokeColor: "#495057",
      groupIds: [edge.id],
      points: [
        [0, 0],
        [endX - startX, endY - startY],
      ],
      lastCommittedPoint: null,
      startBinding: {
        elementId: `node-${edge.from}`,
        focus: 0,
        gap: 8,
        fixedPoint: null,
      },
      endBinding: {
        elementId: `node-${edge.to}`,
        focus: 0,
        gap: 8,
        fixedPoint: null,
      },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      roundness: { type: 2 },
      boundElements: edge.name ? [{ id: labelId, type: "text" }] : null,
      customData: {
        causcape: {
          objectId: edge.id,
          ...(edge.name ? { name: edge.name } : {}),
          kind: "flow",
        },
      },
    };
    converted.push(arrow);
    if (edge.name) {
      const labelWidth = Math.max(60, edge.name.length * 9);
      converted.push({
        ...baseElement(
          labelId,
          "text",
          startX + (endX - startX) / 2 - labelWidth / 2,
          startY + (endY - startY) / 2 - 10,
          labelWidth,
          20,
        ),
        strokeWidth: 1,
        roughness: 0,
        text: edge.name,
        fontSize: 16,
        fontFamily: 2,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: arrow.id,
        originalText: edge.name,
        autoResize: true,
        lineHeight: 1.25,
        groupIds: [edge.id],
        customData: {
          causcape: { objectId: edge.id, name: edge.name, kind: "flow" },
        },
      });
    }
  }
  const objects: Record<string, CanvasObject> = {};
  for (const node of nodes) {
    objects[node.id] = {
      id: node.id,
      elementIds: [`node-${node.id}`, `label-node-${node.id}`],
      name: node.name,
      metadata: { kind: node.kind ?? "resource", ...(node.metadata ?? {}) },
      state: "active",
    };
  }
  for (const edge of edges) {
    objects[edge.id] = {
      id: edge.id,
      elementIds: [
        `edge-${edge.id}`,
        ...(edge.name ? [`label-edge-${edge.id}`] : []),
      ],
      ...(edge.name ? { name: edge.name } : {}),
      metadata: { kind: "flow", ...(edge.metadata ?? {}) },
      state: "active",
    };
  }

  return {
    scene: {
      elements: converted,
      appState: {
        viewBackgroundColor: "#ffffff",
        exportBackground: true,
      },
      files: {},
    },
    objects,
  };
};

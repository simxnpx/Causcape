import type {
  ElementsMapOrArray,
  ExcalidrawCauscapeEdgeElement,
  ExcalidrawCauscapeNodeElement,
  ExcalidrawElement,
} from "@excalidraw/element/types";

import type { CauscapeEdge, CauscapeGraph, CauscapeNode } from "./types";
import { validateGraph } from "./validate";

const isCauscapeNodeElement = (el: ExcalidrawElement): el is ExcalidrawCauscapeNodeElement =>
  el.type === "causcape-node";
const isCauscapeEdgeElement = (el: ExcalidrawElement): el is ExcalidrawCauscapeEdgeElement =>
  el.type === "causcape-edge";


const toElementArray = (elements: ElementsMapOrArray): readonly ExcalidrawElement[] => {
  if (Array.isArray(elements)) {
    return elements;
  }
  // Map
  return Array.from((elements as Map<string, ExcalidrawElement>).values());
};

export const buildGraph = (
  elements: ElementsMapOrArray,
  opts?: { includeDiagnostics?: boolean },
): CauscapeGraph => {
  const includeDiagnostics = opts?.includeDiagnostics ?? true;
  const all = toElementArray(elements);

  const nodes: CauscapeNode[] = [];
  const edges: CauscapeEdge[] = [];
  for (const el of all) {
    if (el.isDeleted) {
      continue;
    }
    if (isCauscapeNodeElement(el)) {
      const nodeEl = el;
      const causcape = nodeEl.causcape as unknown as {
        label: string;
        kind: CauscapeNode["kind"];
        github?: CauscapeNode["github"];
        cache?: CauscapeNode["cache"];
      };
      nodes.push({
        id: nodeEl.id,
        label: causcape.label,
        kind: causcape.kind,
        x: nodeEl.x,
        y: nodeEl.y,
        width: nodeEl.width,
        height: nodeEl.height,
        github: causcape.github,
        cache: causcape.cache,
        element: nodeEl,
      });
    } else if (isCauscapeEdgeElement(el)) {
      const edgeEl = el;
      edges.push({
        id: edgeEl.id,
        fromNodeId: edgeEl.causcape.fromNodeId,
        toNodeId: edgeEl.causcape.toNodeId,
        label: edgeEl.causcape.label,
        element: edgeEl,
      });
    }
  }

  const nodesById = new Map<string, CauscapeNode>();
  for (const n of nodes) {
    nodesById.set(n.id, n);
  }

  const edgesById = new Map<string, CauscapeEdge>();
  for (const e of edges) {
    edgesById.set(e.id, e);
  }

  const adjacency = new Map<string, readonly string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  // Use mutable temp then freeze
  const adjMutable = new Map<string, string[]>();
  for (const node of nodes) {
    adjMutable.set(node.id, []);
  }
  for (const edge of edges) {
    if (nodesById.has(edge.fromNodeId) && nodesById.has(edge.toNodeId)) {
      adjMutable.get(edge.fromNodeId)?.push(edge.toNodeId);
    }
  }
  for (const [k, v] of adjMutable) {
    adjacency.set(k, Object.freeze([...v]));
  }

  const diagnostics = includeDiagnostics ? validateGraph(nodes, edges) : [];

  return Object.freeze({
    nodes: Object.freeze([...nodes]),
    edges: Object.freeze([...edges]),
    diagnostics: Object.freeze([...diagnostics]),
    nodesById,
    edgesById,
    adjacency,
  });
};

/**
 * Creates a memoized builder that caches the last graph by a string key.
 * The caller should provide a stable cacheKey, e.g. `sceneNonce` or `hashElementsVersion`.
 * This avoids O(n) rebuild on every pointermove when scene hasn't changed.
 */
export const createMemoizedBuilder = (): ((
  elements: ElementsMapOrArray,
  cacheKey: string,
  opts?: { includeDiagnostics?: boolean },
) => CauscapeGraph) => {
  let lastKey: string | null = null;
  let lastGraph: CauscapeGraph | null = null;
  let lastElementsRef: ElementsMapOrArray | null = null;

  return (elements, cacheKey, opts) => {
    if (lastKey === cacheKey && lastElementsRef === elements && lastGraph) {
      return lastGraph;
    }
    const graph = buildGraph(elements, opts);
    lastKey = cacheKey;
    lastElementsRef = elements;
    lastGraph = graph;
    return graph;
  };
};

export const getGraphHash = (elements: ElementsMapOrArray): string => {
  const arr = toElementArray(elements);
  // Simple djb2-like hash over ids + versions for cache key when sceneNonce unavailable
  let hash = 5381;
  for (const el of arr) {
    if (el.isDeleted) {
      continue;
    }
    if (el.type === "causcape-node" || el.type === "causcape-edge") {
      const str = `${el.id}:${el.version}`;
      for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
      }
    }
  }
  return `${arr.length}:${hash >>> 0}`;
};

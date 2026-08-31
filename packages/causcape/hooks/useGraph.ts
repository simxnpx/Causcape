import { useMemo } from "react";

import { buildGraph, getGraphHash } from "@causcape/graph";

import type { CauscapeGraph } from "@causcape/graph";
import type { ElementsMapOrArray } from "@causcape/element/types";

/**
 * Reactive hook that builds a Causcape graph from scene elements.
 * Memoized by `cacheKey` (prefer `sceneNonce` or `hashElementsVersion`).
 * Falls back to hashing elements if no key provided (O(n)).
 */
export const useGraph = (
  elements: ElementsMapOrArray,
  cacheKey?: string | number,
): CauscapeGraph => {
  const key = cacheKey != null ? String(cacheKey) : getGraphHash(elements);
  return useMemo(() => {
    // The caller's scene version must invalidate graphs even when the element
    // collection is mutated in place and therefore keeps the same identity.
    void key;
    return buildGraph(elements, { includeDiagnostics: true });
  }, [elements, key]);
};

/**
 * Get element ids that have diagnostics (for overlay highlighting).
 */
export const getDiagnosticElementIds = (graph: CauscapeGraph): Set<string> => {
  const ids = new Set<string>();
  for (const d of graph.diagnostics) {
    for (const id of d.elementIds) {
      ids.add(id);
    }
  }
  return ids;
};

/**
 * Get diagnostics filtered by level.
 */
export const getDiagnosticsByLevel = (
  graph: CauscapeGraph,
  level: CauscapeGraph["diagnostics"][number]["level"],
) =>
  graph.diagnostics.filter(
    (d: CauscapeGraph["diagnostics"][number]) => d.level === level,
  );

import {
  getCauscapeEdgeLabel,
  getCauscapeEdgeLabelBounds,
} from "@causcape/element";

import type { FixedPointBinding } from "@causcape/element/types";

import { isArchitectureNodeKind } from "./types";

import type {
  CauscapeEdge,
  CauscapeGraph,
  CauscapeNode,
  Diagnostic,
  ViewportBounds,
} from "./types";

type Point = [number, number];
type Box = { x: number; y: number; width: number; height: number };
type Position = { x: number; y: number };

export type CauscapeEdgeGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  points: Point[];
};

export type CauscapeEdgeBindings = Readonly<{
  startBinding: FixedPointBinding;
  endBinding: FixedPointBinding;
}>;

export type GraphQualityMetrics = Readonly<{
  nodeCount: number;
  edgeCount: number;
  componentCount: number;
  cycleCount: number;
  overlapCount: number;
  edgeThroughNodeCount: number;
  edgeDetachedCount: number;
  edgeClearanceCount: number;
  crossingCount: number;
  routeOverlapCount: number;
  disconnectedNodeCount: number;
  labelOverflowCount: number;
  edgeLabelOverlapCount: number;
  routeBendCount: number;
  offViewportNodeCount: number;
  score: number;
}>;

export type GraphQualityOptions = Readonly<{
  viewport?: ViewportBounds | null;
  positions?: ReadonlyMap<string, Position>;
  routes?: ReadonlyMap<string, CauscapeEdgeGeometry>;
  edgeClearance?: number;
  labelCharacterWidth?: number;
  labelLineHeight?: number;
  labelClearance?: number;
}>;

export type GraphQualityReport = Readonly<{
  metrics: GraphQualityMetrics;
  diagnostics: readonly Diagnostic[];
}>;

export type CauscapeLayoutOptions = Readonly<{
  originX?: number;
  originY?: number;
  gapX?: number;
  gapY?: number;
  respectLocked?: boolean;
  pinnedNodeIds?: ReadonlySet<string>;
  enableVerticalSubflows?: boolean;
  viewport?: ViewportBounds | null;
  edgeClearance?: number;
  labelClearance?: number;
  maxIterations?: number;
}>;

export type CauscapeLayoutResult = Readonly<{
  positions: Map<string, Position>;
  edges: Map<string, CauscapeEdgeGeometry>;
  metrics: GraphQualityMetrics;
  diagnostics: readonly Diagnostic[];
  before: GraphQualityReport;
  after: GraphQualityReport;
  iterations: number;
  converged: boolean;
  changedNodeIds: readonly string[];
}>;

const DEFAULT_GAP_X = 180;
const DEFAULT_GAP_Y = 160;
const DEFAULT_EDGE_CLEARANCE = 16;
// Scene-space minima shared by routing and agent validation. Caller options
// can increase these, but cannot silently disable readable spacing.
export const GRAPH_SPACING = {
  endpointRunway: 80,
  nodeClearance: 64,
  labelPadding: 12,
} as const;
const MIN_MEANINGFUL_ROUTE_OVERLAP = 8;
const EPSILON = 1e-7;

const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const boxFor = (
  node: CauscapeNode,
  positions?: ReadonlyMap<string, Position>,
): Box => {
  const position = positions?.get(node.id);
  return {
    x: position?.x ?? node.x,
    y: position?.y ?? node.y,
    width: node.width,
    height: node.height,
  };
};

const centerOf = (box: Box): Point => [
  box.x + box.width / 2,
  box.y + box.height / 2,
];

const borderPoint = (node: Box, target: Point): Point => {
  const center = centerOf(node);
  const dx = target[0] - center[0];
  const dy = target[1] - center[1];
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return [center[0] + node.width / 2, center[1]];
  }
  const scale = Math.min(
    node.width / 2 / Math.max(Math.abs(dx), EPSILON),
    node.height / 2 / Math.max(Math.abs(dy), EPSILON),
  );
  return [center[0] + dx * scale, center[1] + dy * scale];
};

const compactPoints = (points: readonly Point[]): Point[] => {
  const compacted: Point[] = [];
  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (
      !previous ||
      Math.abs(previous[0] - point[0]) > EPSILON ||
      Math.abs(previous[1] - point[1]) > EPSILON
    ) {
      compacted.push([point[0], point[1]]);
    }
  }
  for (let index = compacted.length - 2; index > 0; index -= 1) {
    const before = compacted[index - 1];
    const current = compacted[index];
    const after = compacted[index + 1];
    if (
      Math.abs(
        (current[0] - before[0]) * (after[1] - current[1]) -
          (current[1] - before[1]) * (after[0] - current[0]),
      ) < EPSILON
    ) {
      compacted.splice(index, 1);
    }
  }
  return compacted.length > 1 ? compacted : [compacted[0] ?? [0, 0], [1, 0]];
};

const geometryFromAbsolutePoints = (
  points: readonly Point[],
): CauscapeEdgeGeometry => {
  const compacted = compactPoints(points);
  const x = Math.min(...compacted.map((point) => point[0]));
  const y = Math.min(...compacted.map((point) => point[1]));
  const maxX = Math.max(...compacted.map((point) => point[0]));
  const maxY = Math.max(...compacted.map((point) => point[1]));
  return {
    x,
    y,
    width: Math.max(maxX - x, 1),
    height: Math.max(maxY - y, 1),
    points: compacted.map((point) => [point[0] - x, point[1] - y]),
  };
};

const absolutePoints = (route: CauscapeEdgeGeometry): Point[] =>
  route.points.map((point) => [point[0] + route.x, point[1] + route.y]);

const getCauscapeEdgeLabelBox = (
  edge: CauscapeEdge,
  route: CauscapeEdgeGeometry,
  clearance: number,
): Box | null => {
  const labelBounds = getCauscapeEdgeLabelBounds(
    absolutePoints(route) as readonly [number, number][],
    edge.element.causcape,
    { offset: clearance, characterWidth: 7 },
  );
  return labelBounds
    ? {
        x: labelBounds.x,
        y: labelBounds.y,
        width: labelBounds.width,
        height: labelBounds.height,
      }
    : null;
};

const estimateEdgeLabelWidth = (edge: CauscapeEdge): number => {
  const label = getCauscapeEdgeLabel(edge.element.causcape);
  return label ? Math.min(360, Math.max(120, label.length * 7 + 16)) : 0;
};

const getOrthogonalRoutePoints = (
  from: Box,
  to: Box,
  preferHorizontal: boolean,
): Point[] => {
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);

  if (Math.abs(fromCenter[1] - toCenter[1]) < EPSILON) {
    return [borderPoint(from, toCenter), borderPoint(to, fromCenter)];
  }
  if (Math.abs(fromCenter[0] - toCenter[0]) < EPSILON) {
    return [borderPoint(from, toCenter), borderPoint(to, fromCenter)];
  }

  if (preferHorizontal) {
    const channelX = (fromCenter[0] + toCenter[0]) / 2;
    return [
      borderPoint(from, [channelX, fromCenter[1]]),
      [channelX, fromCenter[1]],
      [channelX, toCenter[1]],
      borderPoint(to, [channelX, toCenter[1]]),
    ];
  }

  const channelY = (fromCenter[1] + toCenter[1]) / 2;
  return [
    borderPoint(from, [fromCenter[0], channelY]),
    [fromCenter[0], channelY],
    [toCenter[0], channelY],
    borderPoint(to, [toCenter[0], channelY]),
  ];
};

export const getCauscapeFlowEndpointIds = (
  edge: Pick<CauscapeEdge, "fromNodeId" | "toNodeId" | "relationship">,
): readonly [string, string] =>
  edge.relationship === "subscribes"
    ? [edge.toNodeId, edge.fromNodeId]
    : [edge.fromNodeId, edge.toNodeId];

/**
 * Build compact orthogonal candidates whose endpoints use side midpoints.
 * Aligned cards can connect directly; offset cards use an L- or Z-shaped
 * channel so the first and last segments remain perpendicular to each card.
 */
const getLRouteCandidates = (from: Box, to: Box): Point[][] => {
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  const verticalOverlap =
    Math.min(from.y + from.height, to.y + to.height) - Math.max(from.y, to.y);
  if (verticalOverlap > EPSILON) {
    const fromIsLeft = from.x <= to.x;
    const fromSideX = fromIsLeft ? from.x + from.width : from.x;
    const toSideX = fromIsLeft ? to.x : to.x + to.width;
    const channelX = (fromSideX + toSideX) / 2;
    return [
      [
        [fromSideX, fromCenter[1]],
        [channelX, fromCenter[1]],
        [channelX, toCenter[1]],
        [toSideX, toCenter[1]],
      ],
    ];
  }

  const horizontalOverlap =
    Math.min(from.x + from.width, to.x + to.width) - Math.max(from.x, to.x);
  if (horizontalOverlap > EPSILON) {
    const fromIsAbove = from.y <= to.y;
    const fromSideY = fromIsAbove ? from.y + from.height : from.y;
    const toSideY = fromIsAbove ? to.y : to.y + to.height;
    const channelY = (fromSideY + toSideY) / 2;
    return [
      [
        [fromCenter[0], fromSideY],
        [fromCenter[0], channelY],
        [toCenter[0], channelY],
        [toCenter[0], toSideY],
      ],
    ];
  }

  const fromIsLeft = from.x < to.x;
  const fromSideX = fromIsLeft ? from.x + from.width : from.x;
  const toSideX = fromIsLeft ? to.x : to.x + to.width;
  const targetY = fromCenter[1] < to.y ? to.y : to.y + to.height;
  const sourceY = fromCenter[1] < to.y ? from.y + from.height : from.y;

  return [
    [
      [fromSideX, fromCenter[1]],
      [toCenter[0], fromCenter[1]],
      [toCenter[0], targetY],
    ],
    [
      [fromCenter[0], sourceY],
      [fromCenter[0], toCenter[1]],
      [toSideX, toCenter[1]],
    ],
  ];
};

const getPreferredOrthogonalRoutePoints = (from: Box, to: Box): Point[] => {
  const candidates = getLRouteCandidates(from, to);
  return candidates[0] ?? getOrthogonalRoutePoints(from, to, true);
};

/** Return an axis-aligned route whose endpoints touch node borders. */
export const routeCauscapeEdge = (
  fromNode: Pick<CauscapeNode, "x" | "y" | "width" | "height">,
  toNode: Pick<CauscapeNode, "x" | "y" | "width" | "height">,
): CauscapeEdgeGeometry => {
  const from: Box = fromNode;
  const to: Box = toNode;
  return geometryFromAbsolutePoints(
    getPreferredOrthogonalRoutePoints(from, to),
  );
};

const fixedPointForEndpoint = (
  point: Point,
  node: Pick<CauscapeNode, "x" | "y" | "width" | "height">,
): [number, number] => {
  const ratioX = node.width ? (point[0] - node.x) / node.width : 0.5;
  const ratioY = node.height ? (point[1] - node.y) / node.height : 0.5;
  return [
    Math.max(0, Math.min(1, Number(ratioX.toFixed(4)))),
    Math.max(0, Math.min(1, Number(ratioY.toFixed(4)))),
  ];
};

/** Persist the routed endpoint positions as fixed bindings on both cards. */
export const getCauscapeEdgeBindings = (
  fromNode: Pick<CauscapeNode, "id" | "x" | "y" | "width" | "height">,
  toNode: Pick<CauscapeNode, "id" | "x" | "y" | "width" | "height">,
  geometry: CauscapeEdgeGeometry,
): CauscapeEdgeBindings => {
  const points = absolutePoints(geometry);
  return {
    startBinding: {
      elementId: fromNode.id,
      fixedPoint: fixedPointForEndpoint(points[0], fromNode),
      mode: "inside",
    },
    endBinding: {
      elementId: toNode.id,
      fixedPoint: fixedPointForEndpoint(points[points.length - 1], toNode),
      mode: "inside",
    },
  };
};

const orientation = (p: Point, q: Point, r: Point): number =>
  (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);

const segmentCrosses = (a: Point, b: Point, c: Point, d: Point): boolean =>
  orientation(a, b, c) * orientation(a, b, d) < -EPSILON &&
  orientation(c, d, a) * orientation(c, d, b) < -EPSILON;

const routeCrosses = (
  a: CauscapeEdgeGeometry,
  b: CauscapeEdgeGeometry,
): boolean => {
  const aPoints = absolutePoints(a);
  const bPoints = absolutePoints(b);
  for (let aIndex = 1; aIndex < aPoints.length; aIndex += 1) {
    for (let bIndex = 1; bIndex < bPoints.length; bIndex += 1) {
      if (
        segmentCrosses(
          aPoints[aIndex - 1],
          aPoints[aIndex],
          bPoints[bIndex - 1],
          bPoints[bIndex],
        )
      ) {
        return true;
      }
    }
  }
  return false;
};

const segmentOverlapLength = (
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): number => {
  const aHorizontal = Math.abs(a[1] - b[1]) < EPSILON;
  const bHorizontal = Math.abs(c[1] - d[1]) < EPSILON;
  if (aHorizontal && bHorizontal && Math.abs(a[1] - c[1]) < EPSILON) {
    return Math.max(
      0,
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])),
    );
  }

  const aVertical = Math.abs(a[0] - b[0]) < EPSILON;
  const bVertical = Math.abs(c[0] - d[0]) < EPSILON;
  if (aVertical && bVertical && Math.abs(a[0] - c[0]) < EPSILON) {
    return Math.max(
      0,
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) -
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])),
    );
  }
  return 0;
};

const routeOverlapLength = (
  first: CauscapeEdgeGeometry,
  second: CauscapeEdgeGeometry,
): number => {
  const firstPoints = absolutePoints(first);
  const secondPoints = absolutePoints(second);
  let length = 0;
  for (let firstIndex = 1; firstIndex < firstPoints.length; firstIndex += 1) {
    for (
      let secondIndex = 1;
      secondIndex < secondPoints.length;
      secondIndex += 1
    ) {
      length += segmentOverlapLength(
        firstPoints[firstIndex - 1],
        firstPoints[firstIndex],
        secondPoints[secondIndex - 1],
        secondPoints[secondIndex],
      );
    }
  }
  return length;
};

const countRouteOverlapsAgainst = (
  route: CauscapeEdgeGeometry,
  routes: readonly CauscapeEdgeGeometry[],
): number =>
  routes.reduce(
    (count, other) =>
      count +
      (routeOverlapLength(route, other) > MIN_MEANINGFUL_ROUTE_OVERLAP ? 1 : 0),
    0,
  );

const pointTouchesNodeBorder = (point: Point, box: Box): boolean => {
  const tolerance = 2;
  const withinX =
    point[0] >= box.x - tolerance && point[0] <= box.x + box.width + tolerance;
  const withinY =
    point[1] >= box.y - tolerance && point[1] <= box.y + box.height + tolerance;
  return (
    ((Math.abs(point[0] - box.x) <= tolerance ||
      Math.abs(point[0] - (box.x + box.width)) <= tolerance) &&
      withinY) ||
    ((Math.abs(point[1] - box.y) <= tolerance ||
      Math.abs(point[1] - (box.y + box.height)) <= tolerance) &&
      withinX)
  );
};

/** Whether a segment enters the open interior of a rectangle. */
const segmentIntersectsInterior = (
  start: Point,
  end: Point,
  box: Box,
): boolean => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  let lower = 0;
  let upper = 1;
  const clip = (
    origin: number,
    delta: number,
    min: number,
    max: number,
  ): boolean => {
    if (Math.abs(delta) < EPSILON) {
      return origin > min + EPSILON && origin < max - EPSILON;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
    return lower < upper - EPSILON;
  };
  return (
    clip(start[0], dx, box.x, box.x + box.width) &&
    clip(start[1], dy, box.y, box.y + box.height) &&
    Math.max(lower, EPSILON) < Math.min(upper, 1 - EPSILON)
  );
};

const validEdges = (graph: CauscapeGraph): readonly CauscapeEdge[] => {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return graph.edges.filter(
    (edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId),
  );
};

/**
 * Keep the persisted edge semantics intact, but derive the direction used by
 * a flow-oriented presentation. A subscription is stored as consumer
 * subscribes-to topic, while the visible event flow travels topic to
 * consumer.
 */
const getFlowGraph = (graph: CauscapeGraph): CauscapeGraph => ({
  ...graph,
  edges: validEdges(graph).map((edge) => {
    const [fromNodeId, toNodeId] = getCauscapeFlowEndpointIds(edge);
    return { ...edge, fromNodeId, toNodeId };
  }),
});

const getWeakComponents = (graph: CauscapeGraph): string[][] => {
  const neighbors = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of validEdges(graph)) {
    neighbors.get(edge.fromNodeId)?.add(edge.toNodeId);
    neighbors.get(edge.toNodeId)?.add(edge.fromNodeId);
  }
  const components: string[][] = [];
  const seen = new Set<string>();
  for (const node of [...graph.nodes].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (seen.has(node.id)) {
      continue;
    }
    const component: string[] = [];
    const queue = [node.id];
    seen.add(node.id);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      component.push(id);
      for (const neighbor of [...(neighbors.get(id) ?? [])].sort()) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component.sort());
  }
  return components;
};

const getStrongComponents = (graph: CauscapeGraph): string[][] => {
  const neighbors = new Map<string, string[]>();
  for (const node of graph.nodes) {
    neighbors.set(node.id, []);
  }
  for (const edge of validEdges(graph)) {
    neighbors.get(edge.fromNodeId)?.push(edge.toNodeId);
  }
  for (const ids of neighbors.values()) {
    ids.sort();
  }
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (id: string): void => {
    indexes.set(id, nextIndex);
    lowLinks.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);
    for (const neighbor of neighbors.get(id) ?? []) {
      if (!indexes.has(neighbor)) {
        visit(neighbor);
        lowLinks.set(
          id,
          Math.min(
            lowLinks.get(id) as number,
            lowLinks.get(neighbor) as number,
          ),
        );
      } else if (onStack.has(neighbor)) {
        lowLinks.set(
          id,
          Math.min(lowLinks.get(id) as number, indexes.get(neighbor) as number),
        );
      }
    }
    if (lowLinks.get(id) === indexes.get(id)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member) {
          onStack.delete(member);
          component.push(member);
        }
      } while (member !== id);
      components.push(component.sort());
    }
  };
  for (const node of [...graph.nodes].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (!indexes.has(node.id)) {
      visit(node.id);
    }
  }
  return components.sort((a, b) => a[0].localeCompare(b[0]));
};

const hasCycle = (
  component: readonly string[],
  graph: CauscapeGraph,
): boolean =>
  component.length > 1 ||
  validEdges(graph).some(
    (edge) =>
      edge.fromNodeId === component[0] && edge.toNodeId === component[0],
  );

const uniqueNumbers = (values: readonly number[]): number[] =>
  [
    ...new Set(
      values
        .filter(Number.isFinite)
        .map((value) => Math.round(value * 1000) / 1000),
    ),
  ].sort((a, b) => a - b);

const countObstacleHits = (
  points: readonly Point[],
  nodes: readonly CauscapeNode[],
  positions: ReadonlyMap<string, Position>,
): number => {
  let hits = 0;
  for (const node of nodes) {
    // Endpoint cards are obstacles too: touching their border is valid,
    // but a detour must not turn back through their interior.
    const box = boxFor(node, positions);
    if (
      points
        .slice(1)
        .some((_, index) =>
          segmentIntersectsInterior(points[index], points[index + 1], box),
        )
    ) {
      hits += 1;
    }
  }
  return hits;
};

const countCrossingsAgainst = (
  route: CauscapeEdgeGeometry,
  routes: readonly CauscapeEdgeGeometry[],
): number =>
  routes.reduce(
    (count, other) => count + (routeCrosses(route, other) ? 1 : 0),
    0,
  );

const routeIntersectsBox = (route: CauscapeEdgeGeometry, box: Box): boolean => {
  const points = absolutePoints(route);
  return points
    .slice(1)
    .some((_, index) =>
      segmentIntersectsInterior(points[index], points[index + 1], box),
    );
};

const inflateBox = (box: Box, padding: number): Box => ({
  x: box.x - padding,
  y: box.y - padding,
  width: box.width + padding * 2,
  height: box.height + padding * 2,
});

const routeSpacing = (
  edge: CauscapeEdge,
  route: CauscapeEdgeGeometry,
  nodes: readonly CauscapeNode[],
  positions?: ReadonlyMap<string, Position>,
  requestedClearance = 0,
) => {
  const points = absolutePoints(route);
  const [fromId, toId] = getCauscapeFlowEndpointIds(edge);
  const clearance = Math.max(GRAPH_SPACING.nodeClearance, requestedClearance);
  const runway = Math.max(GRAPH_SPACING.endpointRunway, requestedClearance);
  const length = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const shortEndpoint =
    points.length < 2 ||
    length(points[0], points[1]) + EPSILON < runway ||
    length(points[points.length - 2], points[points.length - 1]) + EPSILON <
      runway;
  const crowdedNodes = nodes.filter((node) => {
    const box = boxFor(node, positions);
    return points.slice(1).some((end, index) => {
      // Only the segment actually attached to this card may enter its margin.
      // Later segments must not turn back and hug the source or target card.
      if (
        (node.id === fromId && index === 0) ||
        (node.id === toId && index === points.length - 2)
      ) {
        return segmentIntersectsInterior(points[index], end, box);
      }
      return segmentIntersectsInterior(
        points[index],
        end,
        inflateBox(box, clearance),
      );
    });
  });
  return { shortEndpoint, crowdedNodes };
};

const routeAroundNodes = (
  edge: CauscapeEdge,
  nodes: readonly CauscapeNode[],
  positions: ReadonlyMap<string, Position>,
  existingRoutes: readonly CauscapeEdgeGeometry[],
  existingLabelBoxes: readonly Box[],
  clearance: number,
  labelClearance: number,
): CauscapeEdgeGeometry => {
  const [fromNodeId, toNodeId] = getCauscapeFlowEndpointIds(edge);
  const from = nodes.find((node) => node.id === fromNodeId);
  const to = nodes.find((node) => node.id === toNodeId);
  if (!from || !to) {
    return geometryFromAbsolutePoints([
      [0, 0],
      [1, 0],
    ]);
  }
  const fromBox = boxFor(from, positions);
  const toBox = boxFor(to, positions);
  const fromCenter = centerOf(fromBox);
  const toCenter = centerOf(toBox);
  const allBoxes = nodes.map((node) => boxFor(node, positions));
  const channelGap = Math.max(clearance, GRAPH_SPACING.endpointRunway);
  const minX = Math.min(...allBoxes.map((box) => box.x)) - channelGap;
  const maxX =
    Math.max(...allBoxes.map((box) => box.x + box.width)) + channelGap;
  const minY = Math.min(...allBoxes.map((box) => box.y)) - channelGap;
  const maxY =
    Math.max(...allBoxes.map((box) => box.y + box.height)) + channelGap;
  // A route needs room for its label, not just its stroke. Separate new
  // channels from existing labels as well as existing line segments.
  const laneGap = Math.max(96, clearance + 16);
  const labelSideGap = estimateEdgeLabelWidth(edge) / 2 + labelClearance + 8;
  const xChannels = uniqueNumbers([
    (fromCenter[0] + toCenter[0]) / 2,
    minX,
    maxX,
    ...allBoxes.flatMap((box) => [
      box.x - channelGap,
      box.x + box.width + channelGap,
      box.x - labelSideGap,
      box.x + box.width + labelSideGap,
    ]),
    ...existingLabelBoxes.flatMap((box) => [
      box.x - laneGap,
      box.x + box.width + laneGap,
    ]),
  ]);
  const yChannels = uniqueNumbers([
    (fromCenter[1] + toCenter[1]) / 2,
    minY,
    maxY,
    ...allBoxes.flatMap((box) => [
      box.y - channelGap,
      box.y + box.height + channelGap,
      box.y - laneGap,
      box.y + box.height + laneGap,
    ]),
    ...existingRoutes.flatMap((route) =>
      absolutePoints(route).flatMap((point) => [
        point[1] - laneGap,
        point[1] + laneGap,
      ]),
    ),
    ...existingLabelBoxes.flatMap((box) => [
      box.y - laneGap,
      box.y + box.height + laneGap,
    ]),
  ]);
  const candidates: Point[][] = [
    ...getLRouteCandidates(fromBox, toBox),
    getOrthogonalRoutePoints(fromBox, toBox, true),
    getOrthogonalRoutePoints(fromBox, toBox, false),
  ];
  for (const route of existingRoutes) {
    for (const point of absolutePoints(route)) {
      xChannels.push(point[0] - laneGap);
      xChannels.push(point[0] + laneGap);
    }
  }
  for (const channel of xChannels) {
    candidates.push([
      borderPoint(fromBox, [channel, fromCenter[1]]),
      [channel, fromCenter[1]],
      [channel, toCenter[1]],
      borderPoint(toBox, [channel, toCenter[1]]),
    ]);
  }
  for (const channel of yChannels) {
    candidates.push([
      borderPoint(fromBox, [fromCenter[0], channel]),
      [fromCenter[0], channel],
      [toCenter[0], channel],
      borderPoint(toBox, [toCenter[0], channel]),
    ]);
  }
  // Prefer side midpoints, but allow quarter-side ports for fan-in/fan-out.
  // Distinct ports avoid merging unrelated flows into the same final segment.
  const fractions = [0.5, 0.25, 0.75];
  for (const fromFraction of fractions) {
    for (const toFraction of fractions) {
      if (fromFraction === 0.5 && toFraction === 0.5) {
        continue;
      }
      const fromY = fromBox.y + fromBox.height * fromFraction;
      const toY = toBox.y + toBox.height * toFraction;
      for (const channel of uniqueNumbers(xChannels)) {
        candidates.push([
          [
            channel < fromCenter[0] ? fromBox.x : fromBox.x + fromBox.width,
            fromY,
          ],
          [channel, fromY],
          [channel, toY],
          [channel < toCenter[0] ? toBox.x : toBox.x + toBox.width, toY],
        ]);
      }
      const fromX = fromBox.x + fromBox.width * fromFraction;
      const toX = toBox.x + toBox.width * toFraction;
      for (const channel of yChannels) {
        candidates.push([
          [
            fromX,
            channel < fromCenter[1] ? fromBox.y : fromBox.y + fromBox.height,
          ],
          [fromX, channel],
          [toX, channel],
          [toX, channel < toCenter[1] ? toBox.y : toBox.y + toBox.height],
        ]);
      }
    }
  }
  const scoreCandidate = (points: Point[]) => {
    const route = geometryFromAbsolutePoints(points);
    const spacing = routeSpacing(edge, route, nodes, positions, clearance);
    const obstacleHits = countObstacleHits(points, nodes, positions);
    const crossings = countCrossingsAgainst(route, existingRoutes);
    const routeOverlaps = countRouteOverlapsAgainst(route, existingRoutes);
    const routeOverlapLengthValue = existingRoutes.reduce(
      (length, existingRoute) =>
        length + routeOverlapLength(route, existingRoute),
      0,
    );
    const labelBox = getCauscapeEdgeLabelBox(edge, route, labelClearance);
    const labelNodeHits = labelBox
      ? nodes.reduce(
          (count, node) =>
            count +
            (boxesOverlap(
              labelBox,
              inflateBox(boxFor(node, positions), GRAPH_SPACING.labelPadding),
            )
              ? 1
              : 0),
          0,
        )
      : 0;
    const labelBoxHits = labelBox
      ? existingLabelBoxes.reduce(
          (count, existingLabelBox) =>
            count + (boxesOverlap(labelBox, existingLabelBox) ? 1 : 0),
          0,
        )
      : 0;
    const labelRouteHits = labelBox
      ? existingRoutes.reduce(
          (count, existingRoute) =>
            count + (routeIntersectsBox(existingRoute, labelBox) ? 1 : 0),
          0,
        ) +
        existingLabelBoxes.reduce(
          (count, existingLabelBox) =>
            count + (routeIntersectsBox(route, existingLabelBox) ? 1 : 0),
          0,
        )
      : 0;
    const length = points
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum +
          Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
        0,
      );
    return {
      route,
      obstacleHits,
      spacingHits: Number(spacing.shortEndpoint) + spacing.crowdedNodes.length,
      routeOverlaps,
      routeOverlapLength: routeOverlapLengthValue,
      crossings,
      labelNodeHits,
      labelBoxHits,
      labelRouteHits,
      portDeviation:
        Math.min(
          Math.abs(points[0][0] - fromCenter[0]) / fromBox.width,
          Math.abs(points[0][1] - fromCenter[1]) / fromBox.height,
        ) +
        Math.min(
          Math.abs(points[points.length - 1][0] - toCenter[0]) / toBox.width,
          Math.abs(points[points.length - 1][1] - toCenter[1]) / toBox.height,
        ),
      bends: route.points.length - 2,
      length,
    };
  };
  const compare = (
    a: ReturnType<typeof scoreCandidate>,
    b: ReturnType<typeof scoreCandidate>,
  ) =>
    a.obstacleHits - b.obstacleHits ||
    a.spacingHits - b.spacingHits ||
    a.routeOverlaps - b.routeOverlaps ||
    a.routeOverlapLength - b.routeOverlapLength ||
    a.labelNodeHits - b.labelNodeHits ||
    a.labelBoxHits - b.labelBoxHits ||
    a.labelRouteHits - b.labelRouteHits ||
    a.crossings - b.crossings ||
    a.bends - b.bends ||
    a.portDeviation - b.portDeviation ||
    a.length - b.length ||
    a.route.x - b.route.x ||
    a.route.y - b.route.y;
  const scored = candidates.map(scoreCandidate).sort(compare);
  const best = scored[0];
  if (
    best.obstacleHits ||
    best.spacingHits ||
    best.crossings ||
    best.routeOverlaps ||
    best.labelNodeHits ||
    best.labelBoxHits ||
    best.labelRouteHits
  ) {
    candidates.length = 0;
    // Two independent endpoint channels let a return flow reach a free outer
    // lane without squeezing both endpoint runways into the same corridor.
    for (const fraction of fractions) {
      for (const fromSide of [-1, 1]) {
        for (const toSide of [-1, 1]) {
          const startX = fromBox.x + (fromSide > 0 ? fromBox.width : 0);
          const endX = toBox.x + (toSide > 0 ? toBox.width : 0);
          const startY = fromBox.y + fromBox.height * fraction;
          const endY = toBox.y + toBox.height * fraction;
          for (const y of yChannels) {
            candidates.push([
              [startX, startY],
              [startX + fromSide * channelGap, startY],
              [startX + fromSide * channelGap, y],
              [endX + toSide * channelGap, y],
              [endX + toSide * channelGap, endY],
              [endX, endY],
            ]);
          }
          const startVerticalX = fromBox.x + fromBox.width * fraction;
          const endVerticalX = toBox.x + toBox.width * fraction;
          const startVerticalY =
            fromBox.y + (fromSide > 0 ? fromBox.height : 0);
          const endVerticalY = toBox.y + (toSide > 0 ? toBox.height : 0);
          for (const x of uniqueNumbers(xChannels)) {
            candidates.push([
              [startVerticalX, startVerticalY],
              [startVerticalX, startVerticalY + fromSide * channelGap],
              [x, startVerticalY + fromSide * channelGap],
              [x, endVerticalY + toSide * channelGap],
              [endVerticalX, endVerticalY + toSide * channelGap],
              [endVerticalX, endVerticalY],
            ]);
          }
        }
      }
    }
    // Mixed-side detours can leave a narrow vertical corridor before placing
    // the label. A single-channel Z route cannot do that around a tall blocker.
    for (const channelX of uniqueNumbers(xChannels)) {
      for (const channelY of yChannels) {
        if (
          (channelX < fromBox.x || channelX > fromBox.x + fromBox.width) &&
          (channelY < toBox.y || channelY > toBox.y + toBox.height)
        ) {
          candidates.push([
            borderPoint(fromBox, [channelX, fromCenter[1]]),
            [channelX, fromCenter[1]],
            [channelX, channelY],
            [toCenter[0], channelY],
            borderPoint(toBox, [toCenter[0], channelY]),
          ]);
        }
        if (
          (channelY < fromBox.y || channelY > fromBox.y + fromBox.height) &&
          (channelX < toBox.x || channelX > toBox.x + toBox.width)
        ) {
          candidates.push([
            borderPoint(fromBox, [fromCenter[0], channelY]),
            [fromCenter[0], channelY],
            [channelX, channelY],
            [channelX, toCenter[1]],
            borderPoint(toBox, [channelX, toCenter[1]]),
          ]);
        }
      }
    }
    scored.push(...candidates.map(scoreCandidate));
    scored.sort(compare);
  }
  return scored[0].route;
};

const getQualityDiagnostic = (
  level: Diagnostic["level"],
  code: string,
  message: string,
  elementIds: readonly string[],
): Diagnostic => ({ level, code, message, elementIds });

const dedupeDiagnostics = (
  diagnostics: readonly Diagnostic[],
): Diagnostic[] => {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.level}:${
      diagnostic.code
    }:${diagnostic.elementIds.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const getEdgeRoutingPriority = (edge: CauscapeEdge): number => {
  const label =
    getCauscapeEdgeLabel(edge.element.causcape)?.toLowerCase() ?? "";
  if (/(telemetry|metric|trace|log)/.test(label)) {
    return 100;
  }
  switch (edge.relationship) {
    case "calls":
      return 0;
    case "publishes":
      return 1;
    case "subscribes":
      return 2;
    case "reads":
    case "writes":
      return 3;
    case "depends-on":
      return 4;
    default:
      return 5;
  }
};

/** Analyze structural and visual graph quality without changing the graph. */
export const analyzeGraphQuality = (
  graph: CauscapeGraph,
  options: GraphQualityOptions = {},
): GraphQualityReport => {
  const positions = options.positions;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const routes = new Map<string, CauscapeEdgeGeometry>();
  for (const edge of validEdges(graph)) {
    const [fromNodeId, toNodeId] = getCauscapeFlowEndpointIds(edge);
    const from = nodeById.get(fromNodeId) as CauscapeNode;
    const to = nodeById.get(toNodeId) as CauscapeNode;
    routes.set(
      edge.id,
      options.routes?.get(edge.id) ??
        routeCauscapeEdge(boxFor(from, positions), boxFor(to, positions)),
    );
  }
  const diagnostics: Diagnostic[] = [...graph.diagnostics];
  let overlapCount = 0;
  for (let first = 0; first < graph.nodes.length; first += 1) {
    for (let second = first + 1; second < graph.nodes.length; second += 1) {
      const a = graph.nodes[first];
      const b = graph.nodes[second];
      if (boxesOverlap(boxFor(a, positions), boxFor(b, positions))) {
        overlapCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "NODE_OVERLAP",
            `Nodes ${a.id} and ${b.id} overlap`,
            [a.id, b.id],
          ),
        );
      }
    }
  }

  let edgeThroughNodeCount = 0;
  let edgeDetachedCount = 0;
  let edgeClearanceCount = 0;
  for (const edge of validEdges(graph)) {
    const route = routes.get(edge.id);
    if (!route) {
      continue;
    }
    const points = absolutePoints(route);
    const spacing = routeSpacing(
      edge,
      route,
      graph.nodes,
      positions,
      options.edgeClearance,
    );
    if (spacing.shortEndpoint) {
      edgeClearanceCount += 1;
      diagnostics.push(
        getQualityDiagnostic(
          "warning",
          "EDGE_ENDPOINT_CLEARANCE",
          `Edge ${edge.id} needs at least ${Math.max(
            GRAPH_SPACING.endpointRunway,
            options.edgeClearance ?? 0,
          )} scene units before its first and last bend. Re-route it or separate its endpoint cards.`,
          [edge.id],
        ),
      );
    }
    for (const node of spacing.crowdedNodes) {
      edgeClearanceCount += 1;
      diagnostics.push(
        getQualityDiagnostic(
          "warning",
          "EDGE_NODE_CLEARANCE",
          `Edge ${edge.id} passes too close to card ${
            node.id
          }. Keep passing segments at least ${Math.max(
            GRAPH_SPACING.nodeClearance,
            options.edgeClearance ?? 0,
          )} scene units away; only the attached endpoint segment may enter that margin.`,
          [edge.id, node.id],
        ),
      );
    }
    const [fromNodeId, toNodeId] = getCauscapeFlowEndpointIds(edge);
    const fromNode = nodeById.get(fromNodeId);
    const toNode = nodeById.get(toNodeId);
    if (
      !fromNode ||
      !toNode ||
      !pointTouchesNodeBorder(points[0], boxFor(fromNode, positions)) ||
      !pointTouchesNodeBorder(
        points[points.length - 1],
        boxFor(toNode, positions),
      )
    ) {
      edgeDetachedCount += 1;
      diagnostics.push(
        getQualityDiagnostic(
          "warning",
          "EDGE_DETACHED",
          `Edge ${edge.id} does not connect to both endpoint cards`,
          [edge.id],
        ),
      );
    }
    for (const node of graph.nodes) {
      if (node.id === fromNodeId || node.id === toNodeId) {
        continue;
      }
      if (
        points
          .slice(1)
          .some((_, index) =>
            segmentIntersectsInterior(
              points[index],
              points[index + 1],
              boxFor(node, positions),
            ),
          )
      ) {
        edgeThroughNodeCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_THROUGH_NODE",
            `Edge ${edge.id} passes through node ${node.id}`,
            [edge.id, node.id],
          ),
        );
      }
    }
  }

  let crossingCount = 0;
  const edgesWithRoutes = validEdges(graph).filter((edge) =>
    routes.has(edge.id),
  );
  for (let first = 0; first < edgesWithRoutes.length; first += 1) {
    for (let second = first + 1; second < edgesWithRoutes.length; second += 1) {
      const a = edgesWithRoutes[first];
      const b = edgesWithRoutes[second];
      if (
        routeCrosses(
          routes.get(a.id) as CauscapeEdgeGeometry,
          routes.get(b.id) as CauscapeEdgeGeometry,
        )
      ) {
        crossingCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_CROSSING",
            `Edges ${a.id} and ${b.id} cross`,
            [a.id, b.id],
          ),
        );
      }
    }
  }

  let routeOverlapCount = 0;
  for (let first = 0; first < edgesWithRoutes.length; first += 1) {
    for (let second = first + 1; second < edgesWithRoutes.length; second += 1) {
      const firstEdge = edgesWithRoutes[first];
      const secondEdge = edgesWithRoutes[second];
      if (
        routeOverlapLength(
          routes.get(firstEdge.id) as CauscapeEdgeGeometry,
          routes.get(secondEdge.id) as CauscapeEdgeGeometry,
        ) > MIN_MEANINGFUL_ROUTE_OVERLAP
      ) {
        routeOverlapCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_ROUTE_OVERLAP",
            `Edges ${firstEdge.id} and ${secondEdge.id} share a route segment`,
            [firstEdge.id, secondEdge.id],
          ),
        );
      }
    }
  }

  const labelClearance = options.labelClearance ?? DEFAULT_EDGE_CLEARANCE;
  const edgeLabelBoxes = new Map<string, Box>();
  for (const edge of validEdges(graph)) {
    const route = routes.get(edge.id);
    const labelBox = route
      ? getCauscapeEdgeLabelBox(edge, route, labelClearance)
      : null;
    if (labelBox) {
      edgeLabelBoxes.set(edge.id, labelBox);
    }
  }
  let edgeLabelOverlapCount = 0;
  for (const edge of validEdges(graph)) {
    const labelBox = edgeLabelBoxes.get(edge.id);
    if (!labelBox) {
      continue;
    }
    for (const node of graph.nodes) {
      if (
        !boxesOverlap(labelBox, boxFor(node, positions)) &&
        boxesOverlap(
          labelBox,
          inflateBox(boxFor(node, positions), GRAPH_SPACING.labelPadding),
        )
      ) {
        edgeClearanceCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_LABEL_CLEARANCE",
            `Label for edge ${edge.id} needs ${GRAPH_SPACING.labelPadding} scene units of padding from card ${node.id}. Increase the gap or re-route the edge.`,
            [edge.id, node.id],
          ),
        );
      }
      if (boxesOverlap(labelBox, boxFor(node, positions))) {
        edgeLabelOverlapCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_LABEL_OVERLAP",
            `Label for edge ${edge.id} overlaps node ${node.id}`,
            [edge.id, node.id],
          ),
        );
      }
    }
  }
  for (const edge of validEdges(graph)) {
    const labelBox = edgeLabelBoxes.get(edge.id);
    if (!labelBox) {
      continue;
    }
    for (const routedEdge of validEdges(graph)) {
      if (routedEdge.id === edge.id) {
        continue;
      }
      const route = routes.get(routedEdge.id);
      if (route && routeIntersectsBox(route, labelBox)) {
        edgeLabelOverlapCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_LABEL_ROUTE_OVERLAP",
            `Route for edge ${routedEdge.id} crosses label for edge ${edge.id}`,
            [edge.id, routedEdge.id],
          ),
        );
      }
    }
  }
  const labeledEdges = validEdges(graph).filter((edge) =>
    edgeLabelBoxes.has(edge.id),
  );
  for (let first = 0; first < labeledEdges.length; first += 1) {
    for (let second = first + 1; second < labeledEdges.length; second += 1) {
      const firstEdge = labeledEdges[first];
      const secondEdge = labeledEdges[second];
      if (
        boxesOverlap(
          edgeLabelBoxes.get(firstEdge.id) as Box,
          edgeLabelBoxes.get(secondEdge.id) as Box,
        )
      ) {
        edgeLabelOverlapCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "warning",
            "EDGE_LABEL_OVERLAP",
            `Labels for edges ${firstEdge.id} and ${secondEdge.id} overlap`,
            [firstEdge.id, secondEdge.id],
          ),
        );
      }
    }
  }
  const routeBendCount = [...routes.values()].reduce(
    (count, route) => count + Math.max(0, route.points.length - 2),
    0,
  );

  const weakComponents = getWeakComponents(graph);
  const strongComponents = getStrongComponents(graph);
  const largestComponentSize = Math.max(
    0,
    ...weakComponents.map((component) => component.length),
  );
  const disconnectedNodeCount = Math.max(
    0,
    graph.nodes.length - largestComponentSize,
  );
  if (weakComponents.length > 1) {
    const primaryComponentIndex = weakComponents.reduce(
      (bestIndex, component, index) =>
        component.length > weakComponents[bestIndex].length ? index : bestIndex,
      0,
    );
    for (const [index, component] of weakComponents.entries()) {
      if (index === primaryComponentIndex) {
        continue;
      }
      diagnostics.push(
        getQualityDiagnostic(
          "warning",
          "GRAPH_DISCONNECTED_COMPONENT",
          `Graph has disconnected component containing ${component.join(", ")}`,
          component,
        ),
      );
    }
  }
  const cyclicComponents = strongComponents.filter((component) =>
    hasCycle(component, graph),
  );
  const cycleCount = cyclicComponents.length;
  const architectureGraph = graph.nodes.some((node) =>
    isArchitectureNodeKind(node.kind),
  );
  if (
    cycleCount > 0 &&
    !diagnostics.some((diagnostic) => diagnostic.code === "CYCLE_DETECTED")
  ) {
    diagnostics.push(
      getQualityDiagnostic(
        "info",
        "GRAPH_HAS_CYCLES",
        `${cycleCount} cyclic component(s) require non-layered routing`,
        cyclicComponents.flat(),
      ),
    );
  }

  const labelCharacterWidth = options.labelCharacterWidth ?? 8;
  const labelLineHeight = options.labelLineHeight ?? 20;
  let labelOverflowCount = 0;
  for (const node of graph.nodes) {
    const capacity = Math.max(1, Math.floor(node.width / labelCharacterWidth));
    const lines = node.label
      .split("\n")
      .reduce(
        (count, line) => count + Math.max(1, Math.ceil(line.length / capacity)),
        0,
      );
    if (lines * labelLineHeight + 16 > node.height + EPSILON) {
      labelOverflowCount += 1;
      diagnostics.push(
        getQualityDiagnostic(
          "warning",
          "NODE_LABEL_OVERFLOW",
          `Node ${node.id} label needs more space than its card`,
          [node.id],
        ),
      );
    }
  }

  let offViewportNodeCount = 0;
  if (options.viewport) {
    const zoom = options.viewport.zoom || 1;
    const viewport: Box = {
      x: options.viewport.scrollX,
      y: options.viewport.scrollY,
      width: options.viewport.width / zoom,
      height: options.viewport.height / zoom,
    };
    for (const node of graph.nodes) {
      if (!boxesOverlap(boxFor(node, positions), viewport)) {
        offViewportNodeCount += 1;
        diagnostics.push(
          getQualityDiagnostic(
            "info",
            "NODE_OUTSIDE_VIEWPORT",
            `Node ${node.id} is outside the current viewport`,
            [node.id],
          ),
        );
      }
    }
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        overlapCount * 20 -
        edgeThroughNodeCount * 16 -
        edgeDetachedCount * 40 -
        edgeClearanceCount * 12 -
        crossingCount * 5 -
        routeOverlapCount * 12 -
        edgeLabelOverlapCount * 16 -
        Math.min(20, routeBendCount * 0.25) -
        Math.max(0, weakComponents.length - 1) * 4 -
        (architectureGraph ? 0 : cycleCount * 2) -
        labelOverflowCount * 2 -
        offViewportNodeCount,
    ),
  );
  return {
    metrics: {
      nodeCount: graph.nodes.length,
      edgeCount: validEdges(graph).length,
      componentCount: weakComponents.length,
      cycleCount,
      overlapCount,
      edgeThroughNodeCount,
      edgeDetachedCount,
      edgeClearanceCount,
      crossingCount,
      routeOverlapCount,
      disconnectedNodeCount,
      labelOverflowCount,
      edgeLabelOverlapCount,
      routeBendCount,
      offViewportNodeCount,
      score,
    },
    diagnostics: dedupeDiagnostics(diagnostics),
  };
};

const computeRanks = (graph: CauscapeGraph): Map<string, number> => {
  const components = getStrongComponents(graph);
  const componentIndex = new Map<string, number>();
  components.forEach((component, index) =>
    component.forEach((id) => componentIndex.set(id, index)),
  );
  const outgoing = components.map(() => new Set<number>());
  const indegree = components.map(() => 0);
  for (const edge of validEdges(graph)) {
    const from = componentIndex.get(edge.fromNodeId) as number;
    const to = componentIndex.get(edge.toNodeId) as number;
    if (from !== to && !outgoing[from].has(to)) {
      outgoing[from].add(to);
      indegree[to] += 1;
    }
  }
  const ranks = components.map(() => 0);
  const queue = components
    .map((component, index) => ({ index, key: component[0] }))
    .filter(({ index }) => indegree[index] === 0)
    .sort((a, b) => a.key.localeCompare(b.key));
  while (queue.length > 0) {
    const current = queue.shift() as { index: number; key: string };
    for (const next of [...outgoing[current.index]].sort((a, b) =>
      components[a][0].localeCompare(components[b][0]),
    )) {
      ranks[next] = Math.max(ranks[next], ranks[current.index] + 1);
      indegree[next] -= 1;
      if (indegree[next] === 0) {
        queue.push({ index: next, key: components[next][0] });
        queue.sort((a, b) => a.key.localeCompare(b.key));
      }
    }
  }
  const result = new Map<string, number>();
  components.forEach((component, index) =>
    component.forEach((id) => result.set(id, ranks[index])),
  );
  return result;
};

/**
 * Select the longest deterministic flow as the visual spine. This gives a
 * graph with side effects a readable primary story instead of treating every
 * root or branch as an equally important column occupant.
 */
const getMainSpine = (
  graph: CauscapeGraph,
  ranks: ReadonlyMap<string, number>,
): ReadonlySet<string> => {
  const outgoing = new Map<string, { id: string; weight: number }[]>();
  const incoming = new Map<string, number>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, 0);
  }
  for (const edge of validEdges(graph)) {
    const fromRank = ranks.get(edge.fromNodeId) ?? 0;
    const toRank = ranks.get(edge.toNodeId) ?? 0;
    if (toRank <= fromRank) {
      continue;
    }
    const weight =
      edge.relationship === "publishes" || edge.relationship === "subscribes"
        ? 5
        : edge.relationship === "calls"
        ? 3
        : edge.relationship === "reads" || edge.relationship === "writes"
        ? 1
        : 0;
    outgoing.get(edge.fromNodeId)?.push({ id: edge.toNodeId, weight });
    incoming.set(edge.toNodeId, (incoming.get(edge.toNodeId) ?? 0) + 1);
  }
  for (const neighbors of outgoing.values()) {
    neighbors.sort((a, b) => a.id.localeCompare(b.id));
  }

  const score = new Map<string, number>();
  const getScore = (id: string): number => {
    const cached = score.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const neighbors = outgoing.get(id) ?? [];
    const fanoutBonus = Math.min(3, Math.max(0, neighbors.length - 1)) * 3;
    const best = Math.max(
      0,
      ...neighbors.map(
        ({ id: neighborId, weight }) => weight + getScore(neighborId),
      ),
    );
    const result = 1 + fanoutBonus + best;
    score.set(id, result);
    return result;
  };
  for (const node of graph.nodes) {
    getScore(node.id);
  }

  const roots = graph.nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .sort(
      (a, b) =>
        (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id),
    );
  const current =
    roots[0] ??
    [...graph.nodes].sort(
      (a, b) =>
        (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id),
    )[0];
  if (!current) {
    return new Set();
  }

  const spine = new Set<string>();
  let nodeId: string | undefined = current.id;
  while (nodeId && !spine.has(nodeId)) {
    spine.add(nodeId);
    const next: string | undefined = (outgoing.get(nodeId) ?? []).sort(
      (a, b) =>
        b.weight +
          (score.get(b.id) ?? 0) -
          (a.weight + (score.get(a.id) ?? 0)) || a.id.localeCompare(b.id),
    )[0]?.id;
    nodeId = next;
  }
  return spine;
};

const isPinned = (
  node: CauscapeNode,
  options: CauscapeLayoutOptions,
): boolean =>
  options.pinnedNodeIds?.has(node.id) === true ||
  ((options.respectLocked ?? true) && node.element.locked);

const positionsEqual = (
  a: ReadonlyMap<string, Position>,
  b: ReadonlyMap<string, Position>,
): boolean =>
  a.size === b.size &&
  [...a].every(([id, position]) => {
    const other = b.get(id);
    return (
      other !== undefined && position.x === other.x && position.y === other.y
    );
  });

type VerticalSubflow = Readonly<{
  anchorId: string;
  nodeIds: readonly string[];
}>;

// Vertical packing is an exception for a few compact side flows, not a
// second layout mode for the whole graph. Keeping the limits here makes the
// heuristic predictable as the architecture grows.
const MAX_VERTICAL_SUBFLOW_NODES = 2;
const MAX_VERTICAL_SUBFLOWS = 2;

const getContainedVerticalSubflows = (
  graph: CauscapeGraph,
  ranks: ReadonlyMap<string, number>,
  mainSpine: ReadonlySet<string>,
): readonly VerticalSubflow[] => {
  const flowEdges = validEdges(graph);
  const branchNeighbors = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (!mainSpine.has(node.id)) {
      branchNeighbors.set(node.id, new Set());
    }
  }
  for (const edge of flowEdges) {
    if (
      branchNeighbors.has(edge.fromNodeId) &&
      branchNeighbors.has(edge.toNodeId)
    ) {
      branchNeighbors.get(edge.fromNodeId)?.add(edge.toNodeId);
      branchNeighbors.get(edge.toNodeId)?.add(edge.fromNodeId);
    }
  }

  const components: string[][] = [];
  const seen = new Set<string>();
  for (const node of [...graph.nodes].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (mainSpine.has(node.id) || seen.has(node.id)) {
      continue;
    }
    const component: string[] = [];
    const queue = [node.id];
    seen.add(node.id);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      component.push(id);
      for (const neighbor of [...(branchNeighbors.get(id) ?? [])].sort()) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component.sort());
  }

  const subflows: VerticalSubflow[] = [];
  for (const component of components) {
    // Only a tiny branch can be made into a local vertical stack. Larger
    // components need a global packing pass rather than being forced into a
    // single lane.
    if (
      component.length === 0 ||
      component.length > MAX_VERTICAL_SUBFLOW_NODES
    ) {
      continue;
    }
    const componentIds = new Set(component);
    const anchors = new Set<string>();
    const internalIncoming = new Map<string, number>();
    const internalOutgoing = new Map<string, number>();
    let boundaryEdgeCount = 0;
    for (const edge of flowEdges) {
      const fromInComponent = componentIds.has(edge.fromNodeId);
      const toInComponent = componentIds.has(edge.toNodeId);
      if (fromInComponent && toInComponent) {
        internalOutgoing.set(
          edge.fromNodeId,
          (internalOutgoing.get(edge.fromNodeId) ?? 0) + 1,
        );
        internalIncoming.set(
          edge.toNodeId,
          (internalIncoming.get(edge.toNodeId) ?? 0) + 1,
        );
      }
      if (fromInComponent && mainSpine.has(edge.toNodeId)) {
        anchors.add(edge.toNodeId);
        boundaryEdgeCount += 1;
      }
      if (toInComponent && mainSpine.has(edge.fromNodeId)) {
        anchors.add(edge.fromNodeId);
        boundaryEdgeCount += 1;
      }
    }
    // A clean side chain has one boundary edge and no internal fan-in or
    // fan-out. This excludes the dense worker clusters that made the old
    // heuristic look like a set of vertical columns.
    if (
      anchors.size !== 1 ||
      boundaryEdgeCount !== 1 ||
      component.some(
        (id) =>
          (internalIncoming.get(id) ?? 0) > 1 ||
          (internalOutgoing.get(id) ?? 0) > 1,
      )
    ) {
      continue;
    }
    const [anchorId] = [...anchors];
    const anchorSideEdgeCount = flowEdges.filter((edge) => {
      const anchorToSide =
        edge.fromNodeId === anchorId && !mainSpine.has(edge.toNodeId);
      const sideToAnchor =
        edge.toNodeId === anchorId && !mainSpine.has(edge.fromNodeId);
      return anchorToSide || sideToAnchor;
    }).length;
    const orderedNodeIds = [...component].sort(
      (a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0) || a.localeCompare(b),
    );
    // A vertical exception is useful beside an isolated part of the spine,
    // but it makes a high-fanout hub harder to route and scan. Leave those
    // branches in their regular layered lanes.
    if (anchorSideEdgeCount > 2) {
      continue;
    }
    subflows.push({ anchorId, nodeIds: orderedNodeIds });
  }
  const selectedAnchors = new Set<string>();
  const selectedSubflows: VerticalSubflow[] = [];
  for (const subflow of [...subflows].sort(
    (a, b) =>
      b.nodeIds.length - a.nodeIds.length ||
      (ranks.get(a.anchorId) ?? 0) - (ranks.get(b.anchorId) ?? 0) ||
      a.anchorId.localeCompare(b.anchorId) ||
      a.nodeIds[0].localeCompare(b.nodeIds[0]),
  )) {
    if (
      selectedSubflows.length >= MAX_VERTICAL_SUBFLOWS ||
      selectedAnchors.has(subflow.anchorId)
    ) {
      continue;
    }
    selectedSubflows.push(subflow);
    selectedAnchors.add(subflow.anchorId);
  }
  return selectedSubflows.sort(
    (a, b) =>
      (ranks.get(a.anchorId) ?? 0) - (ranks.get(b.anchorId) ?? 0) ||
      a.anchorId.localeCompare(b.anchorId) ||
      (graph.nodes.find((node) => node.id === a.nodeIds[0])?.y ?? 0) -
        (graph.nodes.find((node) => node.id === b.nodeIds[0])?.y ?? 0) ||
      a.nodeIds[0].localeCompare(b.nodeIds[0]),
  );
};

const getVerticalSubflowPositions = (
  graph: CauscapeGraph,
  subflows: readonly VerticalSubflow[],
  positions: Map<string, Position>,
  options: CauscapeLayoutOptions,
): void => {
  const gapY = options.gapY ?? DEFAULT_GAP_Y;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const subflow of subflows) {
    const anchor = nodesById.get(subflow.anchorId);
    if (
      !anchor ||
      subflow.nodeIds.some((id) => {
        const node = nodesById.get(id);
        return !node || isPinned(node, options);
      })
    ) {
      continue;
    }

    const branchNodes = subflow.nodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is CauscapeNode => node !== undefined);
    const anchorPosition = positions.get(anchor.id);
    if (!anchorPosition || branchNodes.length === 0) {
      continue;
    }
    const anchorCenterX = anchorPosition.x + anchor.width / 2;
    const blockHeight = branchNodes.reduce(
      (height, node) => height + node.height,
      Math.max(0, branchNodes.length - 1) * gapY,
    );
    const branchIds = new Set(subflow.nodeIds);
    const hasConflict = (topY: number): boolean => {
      let nextY = topY;
      for (const node of branchNodes) {
        const candidate: Box = {
          x: anchorCenterX - node.width / 2,
          y: nextY - gapY / 2,
          width: node.width,
          height: node.height + gapY,
        };
        for (const other of graph.nodes) {
          if (branchIds.has(other.id) || other.id === anchor.id) {
            continue;
          }
          const otherPosition = positions.get(other.id);
          if (
            otherPosition &&
            boxesOverlap(candidate, boxFor(other, positions))
          ) {
            return true;
          }
        }
        nextY += node.height + gapY;
      }
      return false;
    };
    const place = (topY: number): void => {
      let nextY = topY;
      for (const node of branchNodes) {
        positions.set(node.id, {
          x: anchorCenterX - node.width / 2,
          y: nextY,
        });
        nextY += node.height + gapY;
      }
    };

    const belowY = anchorPosition.y + anchor.height + gapY;
    if (!hasConflict(belowY)) {
      place(belowY);
      continue;
    }

    const aboveY = anchorPosition.y - gapY - blockHeight;
    if (!hasConflict(aboveY)) {
      place(aboveY);
    }
  }
};

const getObservabilityNodeIds = (graph: CauscapeGraph): ReadonlySet<string> =>
  new Set(
    graph.nodes
      .filter((node) =>
        /(telemetry|metric|trace|log)/i.test(
          `${node.label} ${node.architecture?.description ?? ""}`,
        ),
      )
      .map((node) => node.id),
  );

const placeObservabilityLane = (
  graph: CauscapeGraph,
  ranks: ReadonlyMap<string, number>,
  positions: Map<string, Position>,
  options: CauscapeLayoutOptions,
): void => {
  const observabilityIds = getObservabilityNodeIds(graph);
  if (observabilityIds.size === 0) {
    return;
  }
  const observabilityNodes = graph.nodes
    .filter((node) => observabilityIds.has(node.id))
    .sort(
      (a, b) =>
        (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0) ||
        a.id.localeCompare(b.id),
    );
  if (observabilityNodes.some((node) => isPinned(node, options))) {
    return;
  }
  const nonObservabilityNodes = graph.nodes.filter(
    (node) => !observabilityIds.has(node.id),
  );
  const gapY = options.gapY ?? DEFAULT_GAP_Y;
  const gapX = Math.max(options.gapX ?? DEFAULT_GAP_X, DEFAULT_GAP_X);
  const laneY =
    Math.max(
      0,
      ...nonObservabilityNodes.map((node) => {
        const position = positions.get(node.id);
        return (position?.y ?? node.y) + node.height;
      }),
    ) +
    gapY * 2;
  const flowEdges = validEdges(getFlowGraph(graph));
  const sourceCenters = flowEdges
    .filter((edge) => observabilityIds.has(edge.toNodeId))
    .map((edge) => {
      const source = graph.nodes.find((node) => node.id === edge.fromNodeId);
      const position = source && positions.get(source.id);
      return source && position ? position.x + source.width / 2 : undefined;
    })
    .filter((center): center is number => center !== undefined);
  const firstWidth = observabilityNodes[0]?.width ?? 0;
  const sourceCenter =
    sourceCenters.length > 0
      ? sourceCenters.reduce((sum, center) => sum + center, 0) /
        sourceCenters.length
      : options.originX ?? 0;
  let nextX = Math.max(options.originX ?? 0, sourceCenter - firstWidth / 2);
  for (const node of observabilityNodes) {
    positions.set(node.id, { x: nextX, y: laneY });
    nextX += node.width + gapX;
  }
};

const computePositions = (
  graph: CauscapeGraph,
  options: CauscapeLayoutOptions,
): Map<string, Position> => {
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  const requestedGapX = options.gapX ?? DEFAULT_GAP_X;
  const labelGapX = Math.max(
    0,
    ...validEdges(graph).map(estimateEdgeLabelWidth),
  );
  const gapX = Math.max(requestedGapX, labelGapX);
  const gapY = options.gapY ?? DEFAULT_GAP_Y;
  const flowGraph = getFlowGraph(graph);
  const ranks = computeRanks(flowGraph);
  const mainSpine = getMainSpine(flowGraph, ranks);
  const layers = new Map<number, CauscapeNode[]>();
  for (const node of graph.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const layer = layers.get(rank) ?? [];
    layer.push(node);
    layers.set(rank, layer);
  }
  const orderedRanks = [...layers.keys()].sort((a, b) => a - b);
  const positions = new Map<string, Position>();
  const layerX = new Map<number, number>();
  let nextX = originX;
  for (const rank of orderedRanks) {
    const width = Math.max(
      ...(layers.get(rank) ?? []).map((node) => node.width),
      0,
    );
    layerX.set(rank, nextX);
    nextX += width + gapX;
  }

  const maxNodeHeight = Math.max(...graph.nodes.map((node) => node.height), 0);
  const orderedNodes = new Map<number, CauscapeNode[]>();
  for (const rank of orderedRanks) {
    const nodes = [...(layers.get(rank) ?? [])].sort(
      (a, b) =>
        Number(mainSpine.has(b.id)) - Number(mainSpine.has(a.id)) ||
        a.y - b.y ||
        a.x - b.x ||
        a.id.localeCompare(b.id),
    );
    orderedNodes.set(rank, nodes);
  }

  const placed: Array<{ node: CauscapeNode; box: Box }> = [];
  for (const node of graph.nodes) {
    if (isPinned(node, options)) {
      positions.set(node.id, { x: node.x, y: node.y });
      placed.push({ node, box: boxFor(node, positions) });
    }
  }
  for (const rank of orderedRanks) {
    const nodes = orderedNodes.get(rank) ?? [];
    const desiredCenters = new Map<string, number>();
    let rootIndex = 0;
    for (const node of nodes) {
      const neighborCenters = validEdges(flowGraph)
        .filter(
          (edge) => edge.toNodeId === node.id || edge.fromNodeId === node.id,
        )
        .map((edge) => {
          const neighborId =
            edge.toNodeId === node.id ? edge.fromNodeId : edge.toNodeId;
          const position = positions.get(neighborId);
          const neighbor = graph.nodes.find(
            (candidate) => candidate.id === neighborId,
          );
          return position && neighbor
            ? position.y + neighbor.height / 2
            : undefined;
        })
        .filter((center): center is number => center !== undefined);
      if (neighborCenters.length > 0) {
        desiredCenters.set(
          node.id,
          neighborCenters.reduce((sum, value) => sum + value, 0) /
            neighborCenters.length,
        );
      } else if (rank === 0) {
        desiredCenters.set(
          node.id,
          originY + maxNodeHeight / 2 + rootIndex * (maxNodeHeight + gapY),
        );
        rootIndex += 1;
      } else {
        desiredCenters.set(node.id, node.y + node.height / 2);
      }
    }
    nodes.sort(
      (a, b) =>
        Number(mainSpine.has(b.id)) - Number(mainSpine.has(a.id)) ||
        (desiredCenters.get(a.id) ?? a.y) - (desiredCenters.get(b.id) ?? b.y) ||
        a.id.localeCompare(b.id),
    );
    for (const node of nodes) {
      if (isPinned(node, options)) {
        continue;
      }
      const x = layerX.get(rank) ?? originX;
      const step = Math.max(node.height + gapY, 1);
      let y = Math.max(
        originY,
        (desiredCenters.get(node.id) ?? originY + node.height / 2) -
          node.height / 2,
      );
      while (true) {
        const candidateBox = {
          x,
          y,
          width: node.width,
          height: node.height,
        };
        if (!placed.some(({ box }) => boxesOverlap(candidateBox, box))) {
          break;
        }
        y += step;
      }
      const selected = { x, y };
      positions.set(node.id, selected);
      placed.push({ node, box: boxFor(node, positions) });
    }
  }
  if (options.enableVerticalSubflows) {
    getVerticalSubflowPositions(
      graph,
      getContainedVerticalSubflows(flowGraph, ranks, mainSpine),
      positions,
      options,
    );
  }
  placeObservabilityLane(graph, ranks, positions, options);
  return positions;
};

const computeRoutes = (
  graph: CauscapeGraph,
  positions: ReadonlyMap<string, Position>,
  options: CauscapeLayoutOptions,
): Map<string, CauscapeEdgeGeometry> => {
  const routes = new Map<string, CauscapeEdgeGeometry>();
  const labelBoxes: Box[] = [];
  const clearance = Math.max(
    GRAPH_SPACING.nodeClearance,
    options.edgeClearance ?? 0,
  );
  const labelClearance = Math.max(
    0,
    options.labelClearance ?? DEFAULT_EDGE_CLEARANCE,
  );
  for (const edge of [...validEdges(graph)].sort(
    (a, b) =>
      getEdgeRoutingPriority(a) - getEdgeRoutingPriority(b) ||
      a.id.localeCompare(b.id),
  )) {
    const route = routeAroundNodes(
      edge,
      graph.nodes,
      positions,
      [...routes.values()],
      labelBoxes,
      clearance,
      labelClearance,
    );
    routes.set(edge.id, route);
    const labelBox = getCauscapeEdgeLabelBox(edge, route, labelClearance);
    if (labelBox) {
      labelBoxes.push(labelBox);
    }
  }
  // Earlier routes cannot see later labels. Revisit only conflicts against
  // the complete set, accepting a replacement only when total quality rises.
  for (let pass = 0; pass < 2; pass += 1) {
    let report = analyzeGraphQuality(graph, {
      positions,
      routes,
      labelClearance,
      edgeClearance: options.edgeClearance,
    });
    const conflicts = new Set(
      report.diagnostics
        .filter(
          (item) =>
            item.code.includes("OVERLAP") ||
            item.code.includes("CLEARANCE") ||
            item.code === "EDGE_CROSSING",
        )
        .flatMap((item) => item.elementIds ?? []),
    );
    let changed = false;
    for (const edge of validEdges(graph)) {
      if (!conflicts.has(edge.id)) {
        continue;
      }
      const others = [...routes.entries()].filter(([id]) => id !== edge.id);
      const otherLabels = others.flatMap(([id, route]) => {
        const other = graph.edgesById.get(id);
        const box =
          other && getCauscapeEdgeLabelBox(other, route, labelClearance);
        return box ? [box] : [];
      });
      const replacement = routeAroundNodes(
        edge,
        graph.nodes,
        positions,
        others.map(([, route]) => route),
        otherLabels,
        clearance,
        labelClearance,
      );
      const previous = routes.get(edge.id)!;
      routes.set(edge.id, replacement);
      const next = analyzeGraphQuality(graph, {
        positions,
        routes,
        labelClearance,
        edgeClearance: options.edgeClearance,
      });
      if (next.metrics.score > report.metrics.score) {
        report = next;
        changed = true;
      } else {
        routes.set(edge.id, previous);
      }
    }
    if (!changed) {
      break;
    }
  }
  return routes;
};

/**
 * Run the deterministic quality loop. The result is a proposal: callers can
 * apply `positions` and `edges` atomically, then feed the resulting graph back
 * into this function for another agent-guided pass.
 */
export const improveCauscapeGraph = (
  graph: CauscapeGraph,
  options: CauscapeLayoutOptions = {},
): CauscapeLayoutResult => {
  const qualityOptions = {
    viewport: options.viewport,
    edgeClearance: options.edgeClearance,
    labelClearance: options.labelClearance,
  };
  const before = analyzeGraphQuality(graph, qualityOptions);
  const maxIterations = Math.max(1, Math.floor(options.maxIterations ?? 3));
  let positions = computePositions(graph, options);
  let edges = computeRoutes(graph, positions, options);
  let after = analyzeGraphQuality(graph, {
    ...qualityOptions,
    positions,
    routes: edges,
  });
  let iterations = 1;
  let converged = false;
  while (iterations < maxIterations) {
    const nextPositions = computePositions(graph, options);
    iterations += 1;
    // Routing is deterministic for the same graph and positions. Stop before
    // repeating the expensive candidate search once positions have converged.
    if (positionsEqual(positions, nextPositions)) {
      converged = true;
      break;
    }
    const nextEdges = computeRoutes(graph, nextPositions, options);
    const nextAfter = analyzeGraphQuality(graph, {
      ...qualityOptions,
      positions: nextPositions,
      routes: nextEdges,
    });
    if (nextAfter.metrics.score < after.metrics.score) {
      converged = true;
      break;
    }
    positions = nextPositions;
    edges = nextEdges;
    after = nextAfter;
  }
  return {
    positions,
    edges,
    metrics: after.metrics,
    diagnostics: after.diagnostics,
    before,
    after,
    iterations,
    converged,
    changedNodeIds: graph.nodes
      .filter((node) => {
        const position = positions.get(node.id);
        return (
          position !== undefined &&
          (position.x !== node.x || position.y !== node.y)
        );
      })
      .map((node) => node.id),
  };
};

/** Alias with pipeline-oriented naming for agent integrations. */
export const runGraphQualityPipeline = improveCauscapeGraph;

/** Backwards-compatible layout name used by the current MCP bridge. */
export const layoutCauscapeGraph = improveCauscapeGraph;

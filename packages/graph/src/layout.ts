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
const MIN_LANE_SEPARATION = GRAPH_SPACING.labelPadding;
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
): boolean => pointsCross(absolutePoints(a), absolutePoints(b));

const segmentOverlapLength = (
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): number => {
  // Parallel lanes closer than MIN_LANE_SEPARATION read as one line, so
  // they share a segment just like exactly collinear ones.
  const aHorizontal = Math.abs(a[1] - b[1]) < EPSILON;
  const bHorizontal = Math.abs(c[1] - d[1]) < EPSILON;
  if (
    aHorizontal &&
    bHorizontal &&
    Math.abs(a[1] - c[1]) < MIN_LANE_SEPARATION
  ) {
    return Math.max(
      0,
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])),
    );
  }

  const aVertical = Math.abs(a[0] - b[0]) < EPSILON;
  const bVertical = Math.abs(c[0] - d[0]) < EPSILON;
  if (aVertical && bVertical && Math.abs(a[0] - c[0]) < MIN_LANE_SEPARATION) {
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
): number => pointsOverlapLength(absolutePoints(first), absolutePoints(second));

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

/** Whether a segment runs along a rectangle's edge for a positive length. */
const segmentRunsAlongBorder = (
  start: Point,
  end: Point,
  box: Box,
): boolean => {
  const overlap = (a: number, b: number, min: number, max: number) =>
    Math.min(Math.max(a, b), max) - Math.max(Math.min(a, b), min) > EPSILON;
  if (Math.abs(start[1] - end[1]) < EPSILON) {
    return (
      (Math.abs(start[1] - box.y) < EPSILON ||
        Math.abs(start[1] - (box.y + box.height)) < EPSILON) &&
      overlap(start[0], end[0], box.x, box.x + box.width)
    );
  }
  if (Math.abs(start[0] - end[0]) < EPSILON) {
    return (
      (Math.abs(start[0] - box.x) < EPSILON ||
        Math.abs(start[0] - (box.x + box.width)) < EPSILON) &&
      overlap(start[1], end[1], box.y, box.y + box.height)
    );
  }
  return false;
};

/** Whether a segment enters the open interior of a rectangle. */
const segmentIntersectsInterior = (
  start: Point,
  end: Point,
  box: Box,
): boolean => {
  // Liang-Barsky clipping, unrolled to avoid allocating a closure per test:
  // this runs for every candidate segment against every card.
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  let lower = 0;
  let upper = 1;
  if (Math.abs(dx) < EPSILON) {
    if (
      !(start[0] > box.x + EPSILON && start[0] < box.x + box.width - EPSILON)
    ) {
      return false;
    }
  } else {
    const first = (box.x - start[0]) / dx;
    const second = (box.x + box.width - start[0]) / dx;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
    if (!(lower < upper - EPSILON)) {
      return false;
    }
  }
  if (Math.abs(dy) < EPSILON) {
    if (
      !(start[1] > box.y + EPSILON && start[1] < box.y + box.height - EPSILON)
    ) {
      return false;
    }
  } else {
    const first = (box.y - start[1]) / dy;
    const second = (box.y + box.height - start[1]) / dy;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
    if (!(lower < upper - EPSILON)) {
      return false;
    }
  }
  return Math.max(lower, EPSILON) < Math.min(upper, 1 - EPSILON);
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

const routeIntersectsBox = (route: CauscapeEdgeGeometry, box: Box): boolean =>
  pointsIntersectBox(absolutePoints(route), box);

const inflateBox = (box: Box, padding: number): Box => ({
  x: box.x - padding,
  y: box.y - padding,
  width: box.width + padding * 2,
  height: box.height + padding * 2,
});

/** The cards a route must keep its distance from; see findCrowdedCards. */
type SpacingObstacles = Readonly<{
  fromId: string;
  toId: string;
  nodeIds: readonly string[];
  boxes: readonly Box[];
  /** `boxes` inflated by the passing clearance. */
  clearanceBoxes: readonly Box[];
  runway: number;
}>;

const createSpacingObstacles = (
  edge: CauscapeEdge,
  nodes: readonly CauscapeNode[],
  positions: ReadonlyMap<string, Position> | undefined,
  requestedClearance = 0,
): SpacingObstacles => {
  const [fromId, toId] = getCauscapeFlowEndpointIds(edge);
  const clearance = Math.max(GRAPH_SPACING.nodeClearance, requestedClearance);
  const boxes = nodes.map((node) => boxFor(node, positions));
  return {
    fromId,
    toId,
    nodeIds: nodes.map((node) => node.id),
    boxes,
    clearanceBoxes: boxes.map((box) => inflateBox(box, clearance)),
    runway: Math.max(GRAPH_SPACING.endpointRunway, requestedClearance),
  };
};

/** Whether the first or last segment is too short to leave its card. */
const hasShortEndpointRunway = (
  points: readonly Point[],
  runway: number,
): boolean => {
  const length = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return (
    points.length < 2 ||
    length(points[0], points[1]) + EPSILON < runway ||
    length(points[points.length - 2], points[points.length - 1]) + EPSILON <
      runway
  );
};

/**
 * The spacing rule shared by routing and quality analysis: return the
 * indices of cards a route passes too close to, in card order, stopping
 * after `limit + 1` of them. Only the segment attached to an endpoint card
 * may enter that card's margin; later segments must not turn back and hug
 * the source or target card.
 */
const findCrowdedCards = (
  points: readonly Point[],
  obstacles: SpacingObstacles,
  limit = Infinity,
): number[] => {
  const crowded: number[] = [];
  const { minX, minY, maxX, maxY } = boundsOf(points);
  for (let nodeIndex = 0; nodeIndex < obstacles.boxes.length; nodeIndex += 1) {
    const margin = obstacles.clearanceBoxes[nodeIndex];
    // The clearance box contains the card, so a route that stays outside
    // it cannot hit either one.
    if (
      maxX <= margin.x ||
      minX >= margin.x + margin.width ||
      maxY <= margin.y ||
      minY >= margin.y + margin.height
    ) {
      continue;
    }
    const id = obstacles.nodeIds[nodeIndex];
    for (let index = 0; index < points.length - 1; index += 1) {
      const attached =
        (id === obstacles.fromId && index === 0) ||
        (id === obstacles.toId && index === points.length - 2);
      if (
        attached
          ? segmentIntersectsInterior(
              points[index],
              points[index + 1],
              obstacles.boxes[nodeIndex],
            ) ||
            // The attached segment must leave its card, not slide along
            // the card's edge to reach its endpoint.
            segmentRunsAlongBorder(
              points[index],
              points[index + 1],
              obstacles.boxes[nodeIndex],
            )
          : segmentIntersectsInterior(points[index], points[index + 1], margin)
      ) {
        crowded.push(nodeIndex);
        if (crowded.length > limit) {
          return crowded;
        }
        break;
      }
    }
  }
  return crowded;
};

const routeSpacing = (
  edge: CauscapeEdge,
  route: CauscapeEdgeGeometry,
  nodes: readonly CauscapeNode[],
  positions?: ReadonlyMap<string, Position>,
  requestedClearance = 0,
) => {
  const points = absolutePoints(route);
  const obstacles = createSpacingObstacles(
    edge,
    nodes,
    positions,
    requestedClearance,
  );
  return {
    shortEndpoint: hasShortEndpointRunway(points, obstacles.runway),
    crowdedNodes: findCrowdedCards(points, obstacles).map(
      (index) => nodes[index],
    ),
  };
};

type RouteScoringContext = SpacingObstacles &
  Readonly<{
    edge: CauscapeEdge;
    labelPaddingBoxes: readonly Box[];
    existingPoints: readonly (readonly Point[])[];
    existingBounds: readonly Bounds[];
    existingLabelBoxes: readonly Box[];
    labelClearance: number;
    weights: RoutingWeights;
    fromBox: Box;
    toBox: Box;
    fromCenter: Point;
    toCenter: Point;
  }>;

type Bounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

const boundsOf = (points: readonly Point[]): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return { minX, minY, maxX, maxY };
};

/**
 * Conservative pre-check for crossing, overlap, and interior tests: all of
 * them need the two shapes to come within EPSILON of each other.
 */
const boundsMayTouch = (a: Bounds, b: Bounds, margin = EPSILON): boolean =>
  a.maxX >= b.minX - margin &&
  a.minX <= b.maxX + margin &&
  a.maxY >= b.minY - margin &&
  a.minY <= b.maxY + margin;

const boxBounds = (box: Box): Bounds => ({
  minX: box.x,
  minY: box.y,
  maxX: box.x + box.width,
  maxY: box.y + box.height,
});

type ScoredRoute = {
  route: CauscapeEdgeGeometry;
  /** Values of the routing mode's stages, compared lexicographically. */
  scores: readonly number[];
  /** Whether the route hits cards, clearances, labels, or shared lanes. */
  hasHardIssues: boolean;
  crossings: number;
};

const createRouteScoringContext = (
  edge: CauscapeEdge,
  nodes: readonly CauscapeNode[],
  positions: ReadonlyMap<string, Position>,
  existingRoutes: readonly CauscapeEdgeGeometry[],
  existingLabelBoxes: readonly Box[],
  requestedClearance: number,
  labelClearance: number,
  fromBox: Box,
  toBox: Box,
  weights: RoutingWeights,
): RouteScoringContext => {
  const obstacles = createSpacingObstacles(
    edge,
    nodes,
    positions,
    requestedClearance,
  );
  const existingPoints = existingRoutes.map(absolutePoints);
  return {
    ...obstacles,
    edge,
    labelPaddingBoxes: obstacles.boxes.map((box) =>
      inflateBox(box, GRAPH_SPACING.labelPadding),
    ),
    existingPoints,
    existingBounds: existingPoints.map(boundsOf),
    existingLabelBoxes,
    labelClearance,
    weights,
    fromBox,
    toBox,
    fromCenter: centerOf(fromBox),
    toCenter: centerOf(toBox),
  };
};

const pointsIntersectBox = (points: readonly Point[], box: Box): boolean => {
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsInterior(points[index - 1], points[index], box)) {
      return true;
    }
  }
  return false;
};

const pointsCross = (a: readonly Point[], b: readonly Point[]): boolean => {
  for (let aIndex = 1; aIndex < a.length; aIndex += 1) {
    for (let bIndex = 1; bIndex < b.length; bIndex += 1) {
      if (segmentCrosses(a[aIndex - 1], a[aIndex], b[bIndex - 1], b[bIndex])) {
        return true;
      }
    }
  }
  return false;
};

const pointsOverlapLength = (
  a: readonly Point[],
  b: readonly Point[],
): number => {
  let length = 0;
  for (let aIndex = 1; aIndex < a.length; aIndex += 1) {
    for (let bIndex = 1; bIndex < b.length; bIndex += 1) {
      length += segmentOverlapLength(
        a[aIndex - 1],
        a[aIndex],
        b[bIndex - 1],
        b[bIndex],
      );
    }
  }
  return length;
};

/** Count the cards a candidate enters, stopping once `bound` is exceeded. */
const countCandidateObstacleHits = (
  points: readonly Point[],
  context: RouteScoringContext,
  bound: number,
): number => {
  const { minX, minY, maxX, maxY } = boundsOf(points);
  let hits = 0;
  for (const box of context.boxes) {
    // A segment can only enter a card's interior if its bounds reach it.
    if (
      maxX <= box.x ||
      minX >= box.x + box.width ||
      maxY <= box.y ||
      minY >= box.y + box.height
    ) {
      continue;
    }
    if (pointsIntersectBox(points, box)) {
      hits += 1;
      if (hits > bound) {
        return hits;
      }
    }
  }
  return hits;
};

/** Mirrors routeSpacing, stopping once `bound` is exceeded. */
const countCandidateSpacingHits = (
  points: readonly Point[],
  context: RouteScoringContext,
  bound: number,
): number => {
  const short = hasShortEndpointRunway(points, context.runway) ? 1 : 0;
  return short > bound
    ? short
    : short + findCrowdedCards(points, context, bound - short).length;
};

type RouteCandidate = {
  raw: Point[];
  compact?: Point[];
  route?: CauscapeEdgeGeometry;
  points?: Point[];
  bounds?: Bounds;
  labelBox?: Box | null;
  scores: number[];
};

const candidateGeometry = (candidate: RouteCandidate) => {
  if (!candidate.route) {
    candidate.route = geometryFromAbsolutePoints(candidate.raw);
    candidate.points = absolutePoints(candidate.route);
    candidate.bounds = boundsOf(candidate.points);
  }
  return {
    route: candidate.route,
    points: candidate.points as Point[],
    bounds: candidate.bounds as Bounds,
  };
};

const candidateLabelBox = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): Box | null => {
  if (candidate.labelBox === undefined) {
    candidate.labelBox = getCauscapeEdgeLabelBox(
      context.edge,
      candidateGeometry(candidate).route,
      context.labelClearance,
    );
  }
  return candidate.labelBox;
};

const candidateLength = (candidate: RouteCandidate): number => {
  const { raw } = candidate;
  let length = 0;
  for (let index = 1; index < raw.length; index += 1) {
    length += Math.hypot(
      raw[index][0] - raw[index - 1][0],
      raw[index][1] - raw[index - 1][1],
    );
  }
  return length;
};

const countCandidateRouteOverlaps = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
  bound: number,
): number => {
  const { points, bounds } = candidateGeometry(candidate);
  let overlaps = 0;
  for (let index = 0; index < context.existingPoints.length; index += 1) {
    if (
      boundsMayTouch(
        bounds,
        context.existingBounds[index],
        MIN_LANE_SEPARATION,
      ) &&
      pointsOverlapLength(points, context.existingPoints[index]) >
        MIN_MEANINGFUL_ROUTE_OVERLAP
    ) {
      overlaps += 1;
      if (overlaps > bound) {
        return overlaps;
      }
    }
  }
  return overlaps;
};

const candidateOverlapLength = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): number => {
  const { points, bounds } = candidateGeometry(candidate);
  let length = 0;
  for (let index = 0; index < context.existingPoints.length; index += 1) {
    // Routes farther apart than a lane contribute exactly 0, so skipping
    // them keeps the floating-point sum identical.
    if (
      boundsMayTouch(bounds, context.existingBounds[index], MIN_LANE_SEPARATION)
    ) {
      length += pointsOverlapLength(points, context.existingPoints[index]);
    }
  }
  return length;
};

const countCandidateLabelNodeHits = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): number => {
  const labelBox = candidateLabelBox(candidate, context);
  return labelBox
    ? context.labelPaddingBoxes.filter((box) => boxesOverlap(labelBox, box))
        .length
    : 0;
};

const countCandidateLabelBoxHits = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): number => {
  const labelBox = candidateLabelBox(candidate, context);
  return labelBox
    ? context.existingLabelBoxes.filter((box) => boxesOverlap(labelBox, box))
        .length
    : 0;
};

const countCandidateLabelRouteHits = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): number => {
  const labelBox = candidateLabelBox(candidate, context);
  if (!labelBox) {
    return 0;
  }
  const { points, bounds } = candidateGeometry(candidate);
  const labelBounds = boxBounds(labelBox);
  return (
    context.existingPoints.filter(
      (other, index) =>
        boundsMayTouch(labelBounds, context.existingBounds[index]) &&
        pointsIntersectBox(other, labelBox),
    ).length +
    context.existingLabelBoxes.filter(
      (box) =>
        boundsMayTouch(bounds, boxBounds(box)) &&
        pointsIntersectBox(points, box),
    ).length
  );
};

const countCandidateCrossings = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
  bound: number,
): number => {
  const { points, bounds } = candidateGeometry(candidate);
  let crossings = 0;
  for (let index = 0; index < context.existingPoints.length; index += 1) {
    if (
      boundsMayTouch(bounds, context.existingBounds[index]) &&
      pointsCross(points, context.existingPoints[index])
    ) {
      crossings += 1;
      if (crossings > bound) {
        return crossings;
      }
    }
  }
  return crossings;
};

const candidateBends = (candidate: RouteCandidate): number =>
  candidateGeometry(candidate).route.points.length - 2;

const candidatePortDeviation = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): number => {
  const { raw } = candidate;
  const { fromBox, toBox, fromCenter, toCenter } = context;
  return (
    Math.min(
      Math.abs(raw[0][0] - fromCenter[0]) / fromBox.width,
      Math.abs(raw[0][1] - fromCenter[1]) / fromBox.height,
    ) +
    Math.min(
      Math.abs(raw[raw.length - 1][0] - toCenter[0]) / toBox.width,
      Math.abs(raw[raw.length - 1][1] - toCenter[1]) / toBox.height,
    )
  );
};

/**
 * One scoring stage. A stage may stop early once its value exceeds `bound`,
 * because such a candidate can no longer be a minimum.
 */
type RouteScoringStage = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
  bound: number,
) => number;

const obstacleStage: RouteScoringStage = (candidate, context, bound) =>
  countCandidateObstacleHits(candidate.raw, context, bound);

const spacingStage: RouteScoringStage = (candidate, context, bound) => {
  // Most candidates are rejected here. Compacting is enough for spacing;
  // the full geometry is built only for the survivors.
  candidate.compact ??= compactPoints(candidate.raw);
  return countCandidateSpacingHits(candidate.compact, context, bound);
};

/**
 * Balanced routing treats a crossing as roughly one column of detour, in
 * scene units of route length: avoiding it is preferred, but not by looping
 * a flow around the whole diagram.
 */
const BALANCED_CROSSING_COST = 480;
const BALANCED_BEND_COST = 40;

const balancedCostStage: RouteScoringStage = (candidate, context, bound) => {
  const base =
    candidateLength(candidate) +
    candidateBends(candidate) * BALANCED_BEND_COST +
    candidateOverlapLength(candidate, context);
  if (base > bound) {
    return base;
  }
  const crossings = countCandidateCrossings(
    candidate,
    context,
    Math.floor((bound - base) / BALANCED_CROSSING_COST),
  );
  return base + crossings * BALANCED_CROSSING_COST;
};

/**
 * Candidates are ranked lexicographically by these stages. Both modes keep
 * cards, clearances, shared segments, and labels strict. Balanced routing
 * then trades crossings, bends, and length as one cost. Strict routing is the
 * original order: no crossing at any length. It can keep labels clear in
 * cramped pinned layouts where balanced routing takes the only free lane.
 */
const BALANCED_ROUTING: readonly RouteScoringStage[] = [
  obstacleStage,
  spacingStage,
  countCandidateRouteOverlaps,
  countCandidateLabelNodeHits,
  countCandidateLabelBoxHits,
  countCandidateLabelRouteHits,
  balancedCostStage,
  candidatePortDeviation,
  (candidate) => candidateGeometry(candidate).route.x,
  (candidate) => candidateGeometry(candidate).route.y,
];

const STRICT_ROUTING: readonly RouteScoringStage[] = [
  obstacleStage,
  spacingStage,
  countCandidateRouteOverlaps,
  candidateOverlapLength,
  countCandidateLabelNodeHits,
  countCandidateLabelBoxHits,
  countCandidateLabelRouteHits,
  countCandidateCrossings,
  candidateBends,
  candidatePortDeviation,
  candidateLength,
  (candidate) => candidateGeometry(candidate).route.x,
  (candidate) => candidateGeometry(candidate).route.y,
];

type RoutingWeights = readonly RouteScoringStage[];

const toScoredRoute = (
  candidate: RouteCandidate,
  context: RouteScoringContext,
): ScoredRoute => {
  const scores = context.weights.map((stage, index) => {
    const value =
      candidate.scores[index] ?? stage(candidate, context, Infinity);
    return Number.isNaN(value) ? 0 : value;
  });
  return {
    route: candidateGeometry(candidate).route,
    scores,
    hasHardIssues:
      obstacleStage(candidate, context, 0) > 0 ||
      spacingStage(candidate, context, 0) > 0 ||
      countCandidateRouteOverlaps(candidate, context, 0) > 0 ||
      countCandidateLabelNodeHits(candidate, context) > 0 ||
      countCandidateLabelBoxHits(candidate, context) > 0 ||
      countCandidateLabelRouteHits(candidate, context) > 0,
    crossings: countCandidateCrossings(candidate, context, Infinity),
  };
};

const compareScoredRoutes = (a: ScoredRoute, b: ScoredRoute): number => {
  for (let index = 0; index < a.scores.length; index += 1) {
    const difference = a.scores[index] - b.scores[index];
    if (difference) {
      return difference;
    }
  }
  return 0;
};

/**
 * Collect candidates and select the best by the staged order, keeping the
 * earliest one on a full tie. The first stage (card hits) runs as candidates
 * arrive, so the tens of thousands of channel combinations that cross a card
 * are never stored. Later stages run only on candidates still tied for the
 * minimum, so the expensive route and label checks see a handful of
 * survivors instead of every combination.
 */
const createCandidatePool = (context: RouteScoringContext) => {
  const stages = context.weights;
  let survivors: RouteCandidate[] = [];
  let firstMinimum = Infinity;
  return {
    add(raw: Point[]): void {
      const candidate: RouteCandidate = { raw, scores: [] };
      const value = stages[0](candidate, context, firstMinimum);
      if (value > firstMinimum) {
        return;
      }
      candidate.scores[0] = value;
      if (value < firstMinimum) {
        firstMinimum = value;
        survivors = [];
      }
      survivors.push(candidate);
    },
    select(): ScoredRoute | null {
      if (survivors.length === 0) {
        return null;
      }
      for (
        let stage = 1;
        stage < stages.length && survivors.length > 1;
        stage += 1
      ) {
        let minimum = Infinity;
        for (const candidate of survivors) {
          // A degenerate card (zero width or height) can yield NaN. Treat
          // it as a tie so the pool never filters itself empty.
          const raw = stages[stage](candidate, context, minimum);
          const value = Number.isNaN(raw) ? 0 : raw;
          candidate.scores[stage] = value;
          if (value < minimum) {
            minimum = value;
          }
        }
        survivors = survivors.filter(
          (candidate) => candidate.scores[stage] === minimum,
        );
      }
      return toScoredRoute(survivors[0], context);
    },
  };
};

const routeAroundNodes = (
  edge: CauscapeEdge,
  nodes: readonly CauscapeNode[],
  positions: ReadonlyMap<string, Position>,
  existingRoutes: readonly CauscapeEdgeGeometry[],
  existingLabelBoxes: readonly Box[],
  clearance: number,
  labelClearance: number,
  weights: RoutingWeights,
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
  const context = createRouteScoringContext(
    edge,
    nodes,
    positions,
    existingRoutes,
    existingLabelBoxes,
    clearance,
    labelClearance,
    fromBox,
    toBox,
    weights,
  );
  const candidates = createCandidatePool(context);
  for (const points of getLRouteCandidates(fromBox, toBox)) {
    candidates.add(points);
  }
  candidates.add(getOrthogonalRoutePoints(fromBox, toBox, true));
  candidates.add(getOrthogonalRoutePoints(fromBox, toBox, false));
  for (const route of existingRoutes) {
    for (const point of absolutePoints(route)) {
      xChannels.push(point[0] - laneGap);
      xChannels.push(point[0] + laneGap);
    }
  }
  // Identical channels yield identical candidates; keep the first of each.
  for (const channel of new Set(xChannels)) {
    candidates.add([
      borderPoint(fromBox, [channel, fromCenter[1]]),
      [channel, fromCenter[1]],
      [channel, toCenter[1]],
      borderPoint(toBox, [channel, toCenter[1]]),
    ]);
  }
  for (const channel of yChannels) {
    candidates.add([
      borderPoint(fromBox, [fromCenter[0], channel]),
      [fromCenter[0], channel],
      [toCenter[0], channel],
      borderPoint(toBox, [toCenter[0], channel]),
    ]);
  }
  // Prefer side midpoints, but allow quarter-side ports for fan-in/fan-out.
  // Distinct ports avoid merging unrelated flows into the same final segment.
  const fractions = [0.5, 0.25, 0.75];
  const uniqueXChannels = uniqueNumbers(xChannels);
  for (const fromFraction of fractions) {
    for (const toFraction of fractions) {
      if (fromFraction === 0.5 && toFraction === 0.5) {
        continue;
      }
      const fromY = fromBox.y + fromBox.height * fromFraction;
      const toY = toBox.y + toBox.height * toFraction;
      for (const channel of uniqueXChannels) {
        candidates.add([
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
        candidates.add([
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
  // The pool always holds the direct candidates added above.
  let best = candidates.select() as ScoredRoute;
  // Balanced routing already prices crossings, so only a broken hard rule
  // justifies searching the far larger set of outer detours.
  if (
    best.hasHardIssues ||
    (weights === STRICT_ROUTING && best.crossings > 0)
  ) {
    const detours = createCandidatePool(context);
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
            detours.add([
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
          for (const x of uniqueXChannels) {
            detours.add([
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
    for (const channelX of uniqueXChannels) {
      for (const channelY of yChannels) {
        if (
          (channelX < fromBox.x || channelX > fromBox.x + fromBox.width) &&
          (channelY < toBox.y || channelY > toBox.y + toBox.height)
        ) {
          detours.add([
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
          detours.add([
            borderPoint(fromBox, [fromCenter[0], channelY]),
            [fromCenter[0], channelY],
            [channelX, channelY],
            [channelX, toCenter[1]],
            borderPoint(toBox, [channelX, toCenter[1]]),
          ]);
        }
      }
    }
    const detour = detours.select();
    if (detour && compareScoredRoutes(detour, best) < 0) {
      best = detour;
    }
  }
  return best.route;
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

const OBSERVABILITY_PATTERN =
  /\b(telemetry|opentelemetry|otel|metrics?|traces?|tracer|tracing|logs?|logger|logging|logstash|observability|monitoring)\b/i;

/**
 * Match observability terms as whole words, after splitting camelCase and
 * snake_case names. "OpenTelemetry Collector" and "audit_log" match;
 * "Catalog", "Blog", "Login", and "CatalogChanged" do not.
 */
const isObservabilityText = (text: string): boolean =>
  OBSERVABILITY_PATTERN.test(
    text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " "),
  );

const getEdgeRoutingPriority = (edge: CauscapeEdge): number => {
  const label = getCauscapeEdgeLabel(edge.element.causcape) ?? "";
  if (isObservabilityText(label)) {
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
): GraphQualityReport => analyzeGraphQualityWithPenalty(graph, options).report;

/**
 * The public score is clamped to 0..100, so every busy diagram scores 0 and
 * "did this change help?" cannot be answered from it. Optimization passes
 * compare this unclamped penalty instead.
 */
const analyzeGraphQualityWithPenalty = (
  graph: CauscapeGraph,
  options: GraphQualityOptions = {},
): { report: GraphQualityReport; penalty: number } => {
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

  // Route clean-up compares getEdgePenalty instead of re-running this
  // analysis. Any new term that depends on a single edge's route must be
  // added there as well.
  const penalty =
    overlapCount * 20 +
    edgeThroughNodeCount * PENALTY.edgeThroughNode +
    edgeDetachedCount * PENALTY.edgeDetached +
    edgeClearanceCount * PENALTY.edgeClearance +
    crossingCount * PENALTY.crossing +
    routeOverlapCount * PENALTY.routeOverlap +
    edgeLabelOverlapCount * PENALTY.labelOverlap +
    getBendPenalty(routeBendCount) +
    Math.max(0, weakComponents.length - 1) * 4 +
    (architectureGraph ? 0 : cycleCount * 2) +
    labelOverflowCount * 2 +
    offViewportNodeCount;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const report: GraphQualityReport = {
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
  return { report, penalty };
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
        isObservabilityText(
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

/**
 * Place a column's cards top to bottom in the given order, `gap` apart, as
 * close to their desired tops as possible (least squares). Substituting
 * z = top - (heights and gaps above) turns this into isotonic regression,
 * solved exactly by pooling adjacent violators. Unlike sliding each card
 * below the previous one, a crowded column spreads evenly around the
 * parents that pull it, instead of drifting downward.
 */
const packLayer = (
  desiredTops: readonly number[],
  heights: readonly number[],
  gap: number,
  segment: ColumnSegment = { start: -Infinity, end: Infinity },
): number[] => {
  const offsets: number[] = [];
  let offset = 0;
  for (const height of heights) {
    offsets.push(offset);
    offset += height + gap;
  }
  const blocks: { sum: number; count: number }[] = [];
  desiredTops.forEach((top, index) => {
    blocks.push({ sum: top - offsets[index], count: 1 });
    while (
      blocks.length > 1 &&
      blocks[blocks.length - 2].sum / blocks[blocks.length - 2].count >
        blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count
    ) {
      const last = blocks.pop()!;
      blocks[blocks.length - 1].sum += last.sum;
      blocks[blocks.length - 1].count += last.count;
    }
  });
  // Keeping the stack inside a segment bounds only its first top and last
  // bottom. Both are monotone in z, so clamping every z is exact.
  const lastIndex = heights.length - 1;
  const minZ = segment.start;
  const maxZ =
    segment.end - (offsets[lastIndex] ?? 0) - (heights[lastIndex] ?? 0);
  const tops: number[] = [];
  for (const block of blocks) {
    const z = Math.min(Math.max(block.sum / block.count, minZ), maxZ);
    for (let index = 0; index < block.count; index += 1) {
      tops.push(z + offsets[tops.length]);
    }
  }
  return tops;
};

/** A vertical range of a column that cards may occupy, top to bottom. */
type ColumnSegment = Readonly<{ start: number; end: number }>;

const stackHeight = (heights: readonly number[], gap: number): number =>
  heights.reduce((sum, height) => sum + height, 0) +
  Math.max(0, heights.length - 1) * gap;

/**
 * Pack a column around fixed cards. Cards keep their order and go into the
 * free segments between fixed cards: each to the segment nearest its
 * desired place, overflow moving down to the next one (the last segment is
 * unbounded), then each segment is packed like a free column. Without fixed
 * cards there is one unbounded segment and this is exactly packLayer.
 */
const packColumn = (
  desiredTops: readonly number[],
  heights: readonly number[],
  gap: number,
  segments: readonly ColumnSegment[],
): number[] => {
  const distanceTo = (index: number, segment: ColumnSegment) => {
    const top = desiredTops[index];
    const bottom = top + heights[index];
    return Math.max(0, segment.start - top, bottom - segment.end);
  };
  const assigned: number[][] = segments.map(() => []);
  let current = 0;
  desiredTops.forEach((_, index) => {
    let best = current;
    for (
      let candidate = current + 1;
      candidate < segments.length;
      candidate += 1
    ) {
      if (
        distanceTo(index, segments[candidate]) <
        distanceTo(index, segments[best])
      ) {
        best = candidate;
      }
    }
    current = best;
    assigned[best].push(index);
  });
  for (let segment = 0; segment < segments.length - 1; segment += 1) {
    const length = segments[segment].end - segments[segment].start;
    while (
      assigned[segment].length > 0 &&
      stackHeight(
        assigned[segment].map((index) => heights[index]),
        gap,
      ) > length
    ) {
      assigned[segment + 1].unshift(assigned[segment].pop()!);
    }
  }
  const tops: number[] = new Array(desiredTops.length);
  assigned.forEach((indices, segment) => {
    const packed = packLayer(
      indices.map((index) => desiredTops[index]),
      indices.map((index) => heights[index]),
      gap,
      segments[segment],
    );
    indices.forEach((index, position) => {
      tops[index] = packed[position];
    });
  });
  return tops;
};

/**
 * The free segments of a column whose cards span [left, right], between
 * fixed boxes that overlap it horizontally, each kept `gap` away.
 */
const getColumnSegments = (
  left: number,
  right: number,
  fixedBoxes: readonly Box[],
  gap: number,
  top: number,
): ColumnSegment[] => {
  const blocked = fixedBoxes
    .filter((box) => box.x < right && box.x + box.width > left)
    .map((box) => ({ start: box.y - gap, end: box.y + box.height + gap }))
    .sort((a, b) => a.start - b.start);
  const segments: ColumnSegment[] = [];
  let start = top;
  for (const range of blocked) {
    if (range.start > start) {
      segments.push({ start, end: range.start });
    }
    start = Math.max(start, range.end);
  }
  segments.push({ start, end: Infinity });
  return segments;
};

/**
 * Lay out the diagram, keeping pinned and locked cards where they are.
 *
 * Cards are first laid out as if nothing were fixed. When the fixed cards
 * sit where that layout (moved as a whole) would put them anyway, it is
 * kept: the fixed cards are put back exactly and only free cards that
 * collide with them are pushed aside. Locking a card in place therefore
 * changes nothing else. Fixed cards placed elsewhere pull their neighbors
 * instead: the diagram is packed around their real positions.
 */
const computePositions = (
  graph: CauscapeGraph,
  options: CauscapeLayoutOptions,
): Map<string, Position> => {
  const pinned = graph.nodes.filter((node) => isPinned(node, options));
  const freeOptions = {
    ...options,
    pinnedNodeIds: undefined,
    respectLocked: false,
  };
  if (pinned.length === 0) {
    return placeNodes(graph, freeOptions, true);
  }
  const free = placeNodes(graph, freeOptions, false);
  const meanOffset = (axis: "x" | "y") =>
    pinned.reduce(
      (sum, node) => sum + node[axis] - (free.get(node.id)?.[axis] ?? 0),
      0,
    ) / pinned.length;
  const dx = meanOffset("x");
  const dy = meanOffset("y");
  const gapY = options.gapY ?? DEFAULT_GAP_Y;
  const fitsFreeLayout = pinned.every((node) => {
    const place = free.get(node.id);
    return (
      place !== undefined &&
      Math.abs(node.x - place.x - dx) <= gapY / 2 &&
      Math.abs(node.y - place.y - dy) <= gapY / 2
    );
  });
  if (!fitsFreeLayout) {
    return placeNodes(graph, options, false);
  }
  const positions = new Map<string, Position>();
  for (const [id, position] of free) {
    positions.set(id, { x: position.x + dx, y: position.y + dy });
  }
  const fixedBoxes: Box[] = [];
  for (const node of pinned) {
    positions.set(node.id, { x: node.x, y: node.y });
    fixedBoxes.push(boxFor(node));
  }
  const resolveCollisions = (nodes: readonly CauscapeNode[]) => {
    // Cards sharing an x form a column; keep each column's order and gaps.
    const columns = new Map<number, CauscapeNode[]>();
    for (const node of nodes) {
      const x = positions.get(node.id)!.x;
      columns.set(x, [...(columns.get(x) ?? []), node]);
    }
    for (const x of [...columns.keys()].sort((a, b) => a - b)) {
      const column = columns
        .get(x)!
        .sort(
          (a, b) =>
            positions.get(a.id)!.y - positions.get(b.id)!.y ||
            a.id.localeCompare(b.id),
        );
      const tops = packColumn(
        column.map((node) => positions.get(node.id)!.y),
        column.map((node) => node.height),
        gapY,
        getColumnSegments(
          x,
          x + Math.max(...column.map((node) => node.width)),
          fixedBoxes,
          gapY,
          -Infinity,
        ),
      );
      column.forEach((node, index) => {
        positions.set(node.id, { x, y: tops[index] });
        fixedBoxes.push(boxFor(node, positions));
      });
    }
  };
  const observabilityIds = getObservabilityNodeIds(graph);
  const freeNodes = graph.nodes.filter((node) => !isPinned(node, options));
  resolveCollisions(freeNodes.filter((node) => !observabilityIds.has(node.id)));
  // Pushed cards may have grown the main flow; keep the lane below it.
  placeObservabilityLane(graph, computeRanks(getFlowGraph(graph)), positions, {
    ...options,
    originX: (options.originX ?? 0) + dx,
  });
  resolveCollisions(freeNodes.filter((node) => observabilityIds.has(node.id)));
  return positions;
};

const placeNodes = (
  graph: CauscapeGraph,
  options: CauscapeLayoutOptions,
  shiftToOrigin: boolean,
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
  // Pinned and locked cards stay put; the other cards pack around them.
  const hasPinnedNodes = graph.nodes.some((node) => isPinned(node, options));
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
      // Aim the primary story at its predecessor's row so it reads as one
      // line; packing may still shift it to make room for its column.
      const spineParent = mainSpine.has(node.id)
        ? validEdges(flowGraph).find(
            (edge) =>
              edge.toNodeId === node.id &&
              mainSpine.has(edge.fromNodeId) &&
              positions.has(edge.fromNodeId),
          )
        : undefined;
      const spineParentNode =
        spineParent && graph.nodesById.get(spineParent.fromNodeId);
      if (spineParentNode) {
        desiredCenters.set(
          node.id,
          (positions.get(spineParentNode.id)?.y ?? 0) +
            spineParentNode.height / 2,
        );
        continue;
      }
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
    const freeNodes = nodes.filter((node) => !isPinned(node, options));
    const x = layerX.get(rank) ?? originX;
    const tops = packColumn(
      freeNodes.map(
        (node) =>
          (desiredCenters.get(node.id) ?? originY + node.height / 2) -
          node.height / 2,
      ),
      freeNodes.map((node) => node.height),
      gapY,
      getColumnSegments(
        x,
        x + Math.max(0, ...freeNodes.map((node) => node.width)),
        placed.map(({ box }) => box),
        gapY,
        // Fixed cards cannot follow a shift of the whole diagram, so a
        // column with them starts at the origin instead.
        hasPinnedNodes ? originY : -Infinity,
      ),
    );
    freeNodes.forEach((node, index) => {
      positions.set(node.id, { x, y: tops[index] });
      placed.push({ node, box: boxFor(node, positions) });
    });
  }
  if (shiftToOrigin && !hasPinnedNodes && positions.size > 0) {
    // Centering a column on its parents can lift it above the origin.
    // Fixed cards cannot move, so computePositions aligns the origin instead.
    const shift =
      originY - Math.min(...[...positions.values()].map(({ y }) => y));
    if (shift > 0) {
      for (const position of positions.values()) {
        position.y += shift;
      }
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

// Weights of analyzeGraphQualityWithPenalty, shared with getEdgePenalty.
const PENALTY = {
  edgeClearance: 12,
  edgeDetached: 40,
  edgeThroughNode: 16,
  crossing: 5,
  routeOverlap: 12,
  labelOverlap: 16,
  bend: 0.25,
  maxBendPenalty: 20,
} as const;

const getBendPenalty = (bendCount: number): number =>
  Math.min(PENALTY.maxBendPenalty, bendCount * PENALTY.bend);

const countRouteBends = (route: CauscapeEdgeGeometry): number =>
  Math.max(0, route.points.length - 2);

/**
 * Every penalty term of analyzeGraphQualityWithPenalty that involves `edge`,
 * except the global bend cap. Replacing one route changes only these terms,
 * so comparing them is equivalent to re-analyzing the whole diagram, at the
 * cost of one edge instead of all pairs.
 */
const getEdgePenalty = (
  graph: CauscapeGraph,
  edge: CauscapeEdge,
  route: CauscapeEdgeGeometry,
  routes: ReadonlyMap<string, CauscapeEdgeGeometry>,
  labelBoxes: ReadonlyMap<string, Box | null>,
  positions: ReadonlyMap<string, Position>,
  edgeClearance: number | undefined,
  labelClearance: number,
): number => {
  let penalty = 0;
  const points = absolutePoints(route);
  const spacing = routeSpacing(
    edge,
    route,
    graph.nodes,
    positions,
    edgeClearance,
  );
  penalty +=
    PENALTY.edgeClearance *
    (Number(spacing.shortEndpoint) + spacing.crowdedNodes.length);
  const [fromId, toId] = getCauscapeFlowEndpointIds(edge);
  const from = graph.nodesById.get(fromId);
  const to = graph.nodesById.get(toId);
  if (
    !from ||
    !to ||
    !pointTouchesNodeBorder(points[0], boxFor(from, positions)) ||
    !pointTouchesNodeBorder(points[points.length - 1], boxFor(to, positions))
  ) {
    penalty += PENALTY.edgeDetached;
  }
  const labelBox = getCauscapeEdgeLabelBox(edge, route, labelClearance);
  for (const node of graph.nodes) {
    const box = boxFor(node, positions);
    if (
      node.id !== fromId &&
      node.id !== toId &&
      pointsIntersectBox(points, box)
    ) {
      penalty += PENALTY.edgeThroughNode;
    }
    if (labelBox) {
      if (boxesOverlap(labelBox, box)) {
        penalty += PENALTY.labelOverlap;
      } else if (
        boxesOverlap(labelBox, inflateBox(box, GRAPH_SPACING.labelPadding))
      ) {
        penalty += PENALTY.edgeClearance;
      }
    }
  }
  for (const other of validEdges(graph)) {
    const otherRoute = other.id === edge.id ? undefined : routes.get(other.id);
    if (!otherRoute) {
      continue;
    }
    const otherLabelBox = labelBoxes.get(other.id) ?? null;
    if (routeCrosses(route, otherRoute)) {
      penalty += PENALTY.crossing;
    }
    if (routeOverlapLength(route, otherRoute) > MIN_MEANINGFUL_ROUTE_OVERLAP) {
      penalty += PENALTY.routeOverlap;
    }
    if (labelBox && routeIntersectsBox(otherRoute, labelBox)) {
      penalty += PENALTY.labelOverlap;
    }
    if (otherLabelBox && routeIntersectsBox(route, otherLabelBox)) {
      penalty += PENALTY.labelOverlap;
    }
    if (labelBox && otherLabelBox && boxesOverlap(labelBox, otherLabelBox)) {
      penalty += PENALTY.labelOverlap;
    }
  }
  return penalty;
};

type CardSide = "left" | "right" | "top" | "bottom";

type SidePort = Readonly<{
  edge: CauscapeEdge;
  /** Index of the endpoint in the route's absolute points. */
  pointIndex: number;
  /** Position along the side: y for left/right, x for top/bottom. */
  coordinate: number;
  movable: boolean;
}>;

/**
 * The card side an endpoint attaches to, read from the attached segment:
 * a horizontal segment leaves through the left or right side, a vertical one
 * through the top or bottom.
 */
const getEndpointSide = (
  endpoint: Point,
  next: Point,
  box: Box,
): CardSide | null => {
  const tolerance = 2;
  if (Math.abs(endpoint[1] - next[1]) < EPSILON) {
    if (Math.abs(endpoint[0] - box.x) <= tolerance) {
      return "left";
    }
    if (Math.abs(endpoint[0] - (box.x + box.width)) <= tolerance) {
      return "right";
    }
  } else if (Math.abs(endpoint[0] - next[0]) < EPSILON) {
    if (Math.abs(endpoint[1] - box.y) <= tolerance) {
      return "top";
    }
    if (Math.abs(endpoint[1] - (box.y + box.height)) <= tolerance) {
      return "bottom";
    }
  }
  return null;
};

/**
 * Count segment pairs of two routes that come within `tolerance` of each
 * other without properly crossing. Lines that meet at a corner or run end to
 * end in one lane read as a connection that does not exist. The quality
 * penalty does not see them, since they neither cross nor overlap.
 */
const countRouteContacts = (
  a: readonly Point[],
  b: readonly Point[],
  tolerance: number,
): number => {
  let contacts = 0;
  for (let aIndex = 1; aIndex < a.length; aIndex += 1) {
    for (let bIndex = 1; bIndex < b.length; bIndex += 1) {
      const [p, q] = [a[aIndex - 1], a[aIndex]];
      const [r, t] = [b[bIndex - 1], b[bIndex]];
      // Axis-aligned segments are their own bounding boxes, so the box gap
      // is their exact distance.
      const gapX = Math.max(
        0,
        Math.max(Math.min(p[0], q[0]), Math.min(r[0], t[0])) -
          Math.min(Math.max(p[0], q[0]), Math.max(r[0], t[0])),
      );
      const gapY = Math.max(
        0,
        Math.max(Math.min(p[1], q[1]), Math.min(r[1], t[1])) -
          Math.min(Math.max(p[1], q[1]), Math.max(r[1], t[1])),
      );
      if (Math.hypot(gapX, gapY) < tolerance && !segmentCrosses(p, q, r, t)) {
        contacts += 1;
      }
    }
  }
  return contacts;
};

/** Both end sides of a route, e.g. "right>top", or "" if unattached. */
const getRouteEndSides = (
  graph: CauscapeGraph,
  edge: CauscapeEdge,
  route: CauscapeEdgeGeometry,
  positions: ReadonlyMap<string, Position>,
): string => {
  const points = absolutePoints(route);
  const [fromId, toId] = getCauscapeFlowEndpointIds(edge);
  const from = graph.nodesById.get(fromId);
  const to = graph.nodesById.get(toId);
  if (!from || !to || points.length < 2) {
    return "";
  }
  const start = getEndpointSide(points[0], points[1], boxFor(from, positions));
  const end = getEndpointSide(
    points[points.length - 1],
    points[points.length - 2],
    boxFor(to, positions),
  );
  return start && end ? `${start}>${end}` : "";
};

/**
 * Move a route's endpoint along its card side. The endpoint and its first
 * bend move together, so the attached segment keeps its direction and
 * length and the route stays orthogonal.
 */
const shiftRouteEndpoint = (
  route: CauscapeEdgeGeometry,
  pointIndex: number,
  side: CardSide,
  coordinate: number,
): CauscapeEdgeGeometry => {
  const points = absolutePoints(route);
  const neighborIndex = pointIndex === 0 ? 1 : points.length - 2;
  const axis = side === "left" || side === "right" ? 1 : 0;
  points[pointIndex][axis] = coordinate;
  points[neighborIndex][axis] = coordinate;
  return geometryFromAbsolutePoints(points);
};

type RouteScope = Readonly<{
  /** Edges to (re)route; every other valid edge keeps its fixed route. */
  edgeIds: ReadonlySet<string>;
  fixedRoutes: ReadonlyMap<string, CauscapeEdgeGeometry>;
}>;

const computeRoutes = (
  graph: CauscapeGraph,
  positions: ReadonlyMap<string, Position>,
  options: CauscapeLayoutOptions,
  weights: RoutingWeights,
  scope?: RouteScope,
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
  const isRouted = (edge: CauscapeEdge) =>
    !scope || scope.edgeIds.has(edge.id) || !scope.fixedRoutes.has(edge.id);
  for (const edge of validEdges(graph)) {
    const fixed = isRouted(edge) ? undefined : scope?.fixedRoutes.get(edge.id);
    if (fixed) {
      routes.set(edge.id, fixed);
      const labelBox = getCauscapeEdgeLabelBox(edge, fixed, labelClearance);
      if (labelBox) {
        labelBoxes.push(labelBox);
      }
    }
  }
  for (const edge of [...validEdges(graph)]
    .filter(isRouted)
    .sort(
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
      weights,
    );
    routes.set(edge.id, route);
    const labelBox = getCauscapeEdgeLabelBox(edge, route, labelClearance);
    if (labelBox) {
      labelBoxes.push(labelBox);
    }
  }
  // Earlier routes cannot see later labels. Revisit only conflicts against
  // the complete set, accepting a replacement only when total quality rises.
  // A local re-route after a drag gets one pass to stay interactive.
  for (let pass = 0; pass < (scope ? 1 : 2); pass += 1) {
    const { report } = analyzeGraphQualityWithPenalty(graph, {
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
    // Kept in the same order as `routes`, which candidate generation uses.
    const routeLabelBoxes = new Map<string, Box | null>();
    let bendCount = 0;
    for (const [id, route] of routes) {
      const routedEdge = graph.edgesById.get(id);
      routeLabelBoxes.set(
        id,
        routedEdge
          ? getCauscapeEdgeLabelBox(routedEdge, route, labelClearance)
          : null,
      );
      bendCount += countRouteBends(route);
    }
    const edgePenalty = (edge: CauscapeEdge, route: CauscapeEdgeGeometry) =>
      getEdgePenalty(
        graph,
        edge,
        route,
        routes,
        routeLabelBoxes,
        positions,
        options.edgeClearance,
        labelClearance,
      );
    let changed = false;
    for (const edge of validEdges(graph)) {
      if (!conflicts.has(edge.id) || !isRouted(edge)) {
        continue;
      }
      const others = [...routes.entries()].filter(([id]) => id !== edge.id);
      const otherLabels = others.flatMap(([id]) => {
        const box = routeLabelBoxes.get(id);
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
        weights,
      );
      const previous = routes.get(edge.id)!;
      const nextBendCount =
        bendCount - countRouteBends(previous) + countRouteBends(replacement);
      const delta =
        edgePenalty(edge, replacement) -
        edgePenalty(edge, previous) +
        getBendPenalty(nextBendCount) -
        getBendPenalty(bendCount);
      if (delta < 0) {
        routes.set(edge.id, replacement);
        routeLabelBoxes.set(
          edge.id,
          getCauscapeEdgeLabelBox(edge, replacement, labelClearance),
        );
        bendCount = nextBendCount;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  balanceSidePorts(
    graph,
    routes,
    positions,
    options.edgeClearance,
    labelClearance,
    isRouted,
  );
  return routes;
};

/**
 * Center connections on card sides. A side used by one route gets it at
 * its middle; a side shared by k routes spreads them evenly, in their
 * current order, at 1/(k+1), 2/(k+1), and so on. Straight routes cannot
 * move without bending, so the others spread around them. Routing may
 * attach off center to find a free lane, so each move is kept only if the
 * diagram's quality penalty does not get worse.
 */
const balanceSidePorts = (
  graph: CauscapeGraph,
  routes: Map<string, CauscapeEdgeGeometry>,
  positions: ReadonlyMap<string, Position>,
  edgeClearance: number | undefined,
  labelClearance: number,
  isRouted: (edge: CauscapeEdge) => boolean,
): void => {
  const sides = new Map<
    string,
    { node: CauscapeNode; side: CardSide; ports: SidePort[] }
  >();
  for (const edge of validEdges(graph)) {
    const route = routes.get(edge.id);
    if (!route) {
      continue;
    }
    const points = absolutePoints(route);
    const endpointIds = getCauscapeFlowEndpointIds(edge);
    for (const [end, pointIndex] of [
      [0, 0],
      [1, points.length - 1],
    ] as const) {
      const node = graph.nodesById.get(endpointIds[end]);
      if (!node || points.length < 2) {
        continue;
      }
      const next = points[pointIndex === 0 ? 1 : points.length - 2];
      const side = getEndpointSide(
        points[pointIndex],
        next,
        boxFor(node, positions),
      );
      if (!side) {
        continue;
      }
      const key = `${node.id}:${side}`;
      const group = sides.get(key) ?? { node, side, ports: [] };
      group.ports.push({
        edge,
        pointIndex,
        coordinate:
          side === "left" || side === "right"
            ? points[pointIndex][1]
            : points[pointIndex][0],
        // Moving one end of a straight route would bend it. Out-of-scope
        // routes keep their stored geometry.
        movable: points.length > 2 && isRouted(edge),
      });
      sides.set(key, group);
    }
  }

  const routeLabelBoxes = new Map<string, Box | null>();
  let bendCount = 0;
  for (const [id, route] of routes) {
    const routedEdge = graph.edgesById.get(id);
    routeLabelBoxes.set(
      id,
      routedEdge
        ? getCauscapeEdgeLabelBox(routedEdge, route, labelClearance)
        : null,
    );
    bendCount += countRouteBends(route);
  }
  for (const { node, side, ports } of sides.values()) {
    const box = boxFor(node, positions);
    const [sideStart, sideLength] =
      side === "left" || side === "right"
        ? [box.y, box.height]
        : [box.x, box.width];
    const ordered = [...ports].sort(
      (a, b) =>
        a.coordinate - b.coordinate || a.edge.id.localeCompare(b.edge.id),
    );
    // Routes that cannot move stay as anchors; the movable routes between
    // two anchors (or a side end) spread evenly over that stretch.
    const targets = new Map<SidePort, number>();
    let stretchStart = sideStart;
    let stretch: SidePort[] = [];
    const spread = (stretchEnd: number) => {
      stretch.forEach((port, index) => {
        targets.set(
          port,
          stretchStart +
            ((stretchEnd - stretchStart) * (index + 1)) / (stretch.length + 1),
        );
      });
      stretch = [];
    };
    for (const port of ordered) {
      if (port.movable) {
        stretch.push(port);
      } else {
        spread(port.coordinate);
        stretchStart = port.coordinate;
      }
    }
    spread(sideStart + sideLength);
    for (const port of ordered) {
      const target = targets.get(port);
      if (target === undefined || Math.abs(port.coordinate - target) < 0.5) {
        continue;
      }
      const previous = routes.get(port.edge.id)!;
      const pointIndex = port.pointIndex === 0 ? 0 : previous.points.length - 1;
      const replacement = shiftRouteEndpoint(
        previous,
        pointIndex,
        side,
        target,
      );
      // A bend may collapse (an L becoming a straight line is fine), but
      // both ends must still leave their cards through the same sides;
      // otherwise a route could end up running along a card's edge.
      if (
        getRouteEndSides(graph, port.edge, replacement, positions) !==
        getRouteEndSides(graph, port.edge, previous, positions)
      ) {
        continue;
      }
      // Centering must not make two routes touch where they did not before.
      const contacts = (route: CauscapeEdgeGeometry) => {
        const points = absolutePoints(route);
        let count = 0;
        for (const [id, other] of routes) {
          if (id !== port.edge.id) {
            count += countRouteContacts(
              points,
              absolutePoints(other),
              GRAPH_SPACING.labelPadding,
            );
          }
        }
        return count;
      };
      if (contacts(replacement) > contacts(previous)) {
        continue;
      }
      const edgePenalty = (route: CauscapeEdgeGeometry) =>
        getEdgePenalty(
          graph,
          port.edge,
          route,
          routes,
          routeLabelBoxes,
          positions,
          edgeClearance,
          labelClearance,
        );
      const nextBendCount =
        bendCount - countRouteBends(previous) + countRouteBends(replacement);
      const delta =
        edgePenalty(replacement) -
        edgePenalty(previous) +
        getBendPenalty(nextBendCount) -
        getBendPenalty(bendCount);
      if (delta <= 0) {
        routes.set(port.edge.id, replacement);
        routeLabelBoxes.set(
          port.edge.id,
          getCauscapeEdgeLabelBox(port.edge, replacement, labelClearance),
        );
        bendCount = nextBendCount;
      }
    }
  }
};

/** Readability failures that no amount of shorter routing makes up for. */
const countHardRouteDefects = (metrics: GraphQualityMetrics): number =>
  metrics.overlapCount +
  metrics.edgeThroughNodeCount +
  metrics.edgeDetachedCount +
  metrics.edgeClearanceCount +
  metrics.routeOverlapCount +
  metrics.edgeLabelOverlapCount;

const getSoftRouteCost = (
  routes: ReadonlyMap<string, CauscapeEdgeGeometry>,
  metrics: GraphQualityMetrics,
): number => {
  let cost = metrics.crossingCount * BALANCED_CROSSING_COST;
  for (const route of routes.values()) {
    const points = absolutePoints(route);
    for (let index = 1; index < points.length; index += 1) {
      cost += Math.hypot(
        points[index][0] - points[index - 1][0],
        points[index][1] - points[index - 1][1],
      );
    }
    cost += Math.max(0, points.length - 2) * BALANCED_BEND_COST;
  }
  return cost;
};

/**
 * Route with balanced weights first. Only when that leaves hard readability
 * defects, also try strict routing and keep whichever is more readable.
 */
const computeBestRoutes = (
  graph: CauscapeGraph,
  positions: ReadonlyMap<string, Position>,
  options: CauscapeLayoutOptions,
): {
  routes: Map<string, CauscapeEdgeGeometry>;
  report: GraphQualityReport;
} => {
  // Same options as the caller's final report, so it can reuse this one.
  const qualityOptions = {
    positions,
    viewport: options.viewport,
    edgeClearance: options.edgeClearance,
    labelClearance: options.labelClearance,
  };
  const balanced = computeRoutes(graph, positions, options, BALANCED_ROUTING);
  const balancedReport = analyzeGraphQuality(graph, {
    ...qualityOptions,
    routes: balanced,
  });
  const balancedDefects = countHardRouteDefects(balancedReport.metrics);
  if (balancedDefects === 0) {
    return { routes: balanced, report: balancedReport };
  }
  const strict = computeRoutes(graph, positions, options, STRICT_ROUTING);
  const strictReport = analyzeGraphQuality(graph, {
    ...qualityOptions,
    routes: strict,
  });
  const strictDefects = countHardRouteDefects(strictReport.metrics);
  return strictDefects < balancedDefects ||
    (strictDefects === balancedDefects &&
      getSoftRouteCost(strict, strictReport.metrics) <
        getSoftRouteCost(balanced, balancedReport.metrics))
    ? { routes: strict, report: strictReport }
    : { routes: balanced, report: balancedReport };
};

const storedEdgeRoute = (edge: CauscapeEdge): CauscapeEdgeGeometry | null => {
  const { x, y, width, height, points } = edge.element;
  return points && points.length >= 2
    ? {
        x,
        y,
        width,
        height,
        points: points.map((point) => [point[0], point[1]] as Point),
      }
    : null;
};

export type CauscapeRerouteOptions = Readonly<{
  /** Cards that moved or changed size. */
  changedNodeIds?: ReadonlySet<string>;
  /** Edges whose label, relationship, or endpoints changed. */
  changedEdgeIds?: ReadonlySet<string>;
  /**
   * Where changed cards used to be. Routes that passed beside those spots
   * were probably detouring around the card and are re-routed too, so a
   * moved card does not leave a detour around empty space.
   */
  vacatedBoxes?: readonly Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>[];
  edgeClearance?: number;
  labelClearance?: number;
}>;

/**
 * Re-route only the edges a local change affects: edges attached to changed
 * cards, explicitly changed edges, edges without usable stored geometry,
 * stored routes or labels that a changed card now sits on, and stored routes
 * that passed beside a card's previous position. Every other edge
 * keeps its stored route, so dragging one card does not reshuffle the whole
 * diagram and stays fast enough to run on pointer up.
 */
export const rerouteCauscapeEdges = (
  graph: CauscapeGraph,
  options: CauscapeRerouteOptions = {},
): Map<string, CauscapeEdgeGeometry> => {
  const changedNodeIds = options.changedNodeIds ?? new Set<string>();
  const changedEdgeIds = options.changedEdgeIds ?? new Set<string>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const labelClearance = Math.max(
    0,
    options.labelClearance ?? DEFAULT_EDGE_CLEARANCE,
  );
  const clearance = Math.max(
    GRAPH_SPACING.nodeClearance,
    options.edgeClearance ?? 0,
  );
  const changedBoxes = [...changedNodeIds]
    .map((id) => nodeById.get(id))
    .filter((node): node is CauscapeNode => node !== undefined)
    .map((node) => ({ id: node.id, box: boxFor(node) }));
  // A detour hugs the card at about the clearance distance, so look a
  // little beyond it.
  const vacatedBoxes = (options.vacatedBoxes ?? []).map((box) =>
    inflateBox(box, clearance + GRAPH_SPACING.endpointRunway),
  );
  const fixedRoutes = new Map<string, CauscapeEdgeGeometry>();
  const edgeIds = new Set<string>();
  for (const edge of validEdges(graph)) {
    const stored = storedEdgeRoute(edge);
    if (stored) {
      fixedRoutes.set(edge.id, stored);
    }
    const [fromId, toId] = getCauscapeFlowEndpointIds(edge);
    const from = nodeById.get(fromId) as CauscapeNode;
    const to = nodeById.get(toId) as CauscapeNode;
    const points = stored ? absolutePoints(stored) : [];
    const labelBox = stored
      ? getCauscapeEdgeLabelBox(edge, stored, labelClearance)
      : null;
    if (
      !stored ||
      changedEdgeIds.has(edge.id) ||
      changedNodeIds.has(fromId) ||
      changedNodeIds.has(toId) ||
      !pointTouchesNodeBorder(points[0], boxFor(from)) ||
      !pointTouchesNodeBorder(points[points.length - 1], boxFor(to)) ||
      changedBoxes.some(
        ({ box }) =>
          pointsIntersectBox(points, inflateBox(box, clearance)) ||
          (labelBox !== null &&
            boxesOverlap(
              labelBox,
              inflateBox(box, GRAPH_SPACING.labelPadding),
            )),
      ) ||
      vacatedBoxes.some((box) => pointsIntersectBox(points, box))
    ) {
      edgeIds.add(edge.id);
    }
  }
  const routes = new Map<string, CauscapeEdgeGeometry>();
  if (edgeIds.size === 0) {
    return routes;
  }
  const positions = new Map(
    graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );
  const computed = computeRoutes(
    graph,
    positions,
    {
      edgeClearance: options.edgeClearance,
      labelClearance: options.labelClearance,
    },
    BALANCED_ROUTING,
    { edgeIds, fixedRoutes },
  );
  for (const id of edgeIds) {
    const route = computed.get(id);
    if (route) {
      routes.set(id, route);
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
  let { routes: edges, report: after } = computeBestRoutes(
    graph,
    positions,
    options,
  );
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
    const { routes: nextEdges, report: nextAfter } = computeBestRoutes(
      graph,
      nextPositions,
      options,
    );
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

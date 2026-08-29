import type { CauscapeNode, ViewportBounds } from "./types";

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 60;
const DEFAULT_GAP_X = 40;
const DEFAULT_GAP_Y = 30;
const MAX_SEARCH = 100;

const doBoxesOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const suggestPosition = (
  existingNodes: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
  }[],
  viewport?: ViewportBounds | null,
  opts?: {
    nodeWidth?: number;
    nodeHeight?: number;
    gapX?: number;
    gapY?: number;
  },
): { x: number; y: number } => {
  const nodeWidth = opts?.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const nodeHeight = opts?.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const gapX = opts?.gapX ?? DEFAULT_GAP_X;
  const gapY = opts?.gapY ?? DEFAULT_GAP_Y;

  let originX = 0;
  let originY = 0;

  if (viewport) {
    const zoom = viewport.zoom || 1;
    originX = viewport.scrollX + viewport.width / 2 / zoom - nodeWidth / 2;
    originY = viewport.scrollY + viewport.height / 2 / zoom - nodeHeight / 2;
  } else if (existingNodes.length > 0) {
    // Fallback: place after last node
    const last = existingNodes[existingNodes.length - 1];
    originX = last.x + last.width + gapX;
    originY = last.y;
  }

  // Snap origin to grid
  originX = Math.round(originX);
  originY = Math.round(originY);

  const stepX = nodeWidth + gapX;
  const stepY = nodeHeight + gapY;
  const cols = 5;

  for (let i = 0; i < MAX_SEARCH; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = originX + col * stepX;
    const y = originY + row * stepY;
    const candidate = { x, y, w: nodeWidth, h: nodeHeight };
    let overlaps = false;
    for (const n of existingNodes) {
      if (
        doBoxesOverlap(candidate, {
          x: n.x,
          y: n.y,
          w: n.width,
          h: n.height,
        })
      ) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      return { x, y };
    }
  }

  // Fallback: offset beyond all nodes
  return {
    x: originX + MAX_SEARCH * stepX,
    y: originY,
  };
};

const getTimelineTimestamp = (node: CauscapeNode): number => {
  const c = node.cache;
  let raw: string | undefined;
  if (c && typeof c === "object") {
    if ("date" in c) {
      const v = (c as Record<string, unknown>).date;
      if (typeof v === "string") {
        raw = v;
      }
    }
    if (!raw && "updatedAt" in c) {
      const v = (c as Record<string, unknown>).updatedAt;
      if (typeof v === "string") {
        raw = v;
      }
    }
  }
  if (raw) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) {
      return t;
    }
  }
  const el = node.element;
  if (el && typeof el === "object" && "updated" in el) {
    const v = el.updated;
    if (typeof v === "number" && v > 0) {
      return v;
    }
  }
  return 0;
};

export const layoutGithubTimeline = (
  nodes: readonly CauscapeNode[],
  opts?: {
    originX?: number;
    originY?: number;
    gapX?: number;
    gapY?: number;
    nodeWidth?: number;
    nodeHeight?: number;
  },
): Map<string, { x: number; y: number }> => {
  const nodeWidth = opts?.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const gapX = opts?.gapX ?? DEFAULT_GAP_X;
  const originX = opts?.originX ?? 0;
  const originY = opts?.originY ?? 0;

  const sorted = [...nodes].sort(
    (a, b) => getTimelineTimestamp(a) - getTimelineTimestamp(b),
  );

  const stepX = nodeWidth + gapX;
  const result = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    const x = originX + i * stepX;
    const y = originY;
    result.set(n.id, { x, y });
  }
  return result;
};

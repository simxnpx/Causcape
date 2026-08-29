export const CAUSCAPE_EDGE_LABEL_POOL = [
  "caused",
  "fixed by",
  "reverted",
  "preceded",
  "relates to",
  "blocked",
] as const;

export type CauscapeEdgeLabel = typeof CAUSCAPE_EDGE_LABEL_POOL[number];

import type {
  ExcalidrawCauscapeEdgeElement,
  ExcalidrawCauscapeNodeElement,
} from "@excalidraw/element/types";

import { CAUSCAPE_EDGE_LABEL_POOL } from "./constants";

export { CAUSCAPE_EDGE_LABEL_POOL };
export type { CauscapeEdgeLabel } from "./constants";
export type DiagnosticLevel = "error" | "warning" | "info";

export type Diagnostic = Readonly<{
  level: DiagnosticLevel;
  code: string;
  message: string;
  elementIds: readonly string[];
}>;

export type CauscapeNodeKind =
  | "variable"
  | "github-issue"
  | "github-pr"
  | "github-commit"
  | "github-repo";

export type GithubRef =
  | { kind: "github-issue"; owner: string; repo: string; number: number; url: string }
  | { kind: "github-pr"; owner: string; repo: string; number: number; url: string }
  | { kind: "github-commit"; owner: string; repo: string; sha: string; url: string }
  | { kind: "github-repo"; owner: string; repo: string; url: string };

export type GithubIssuePrCache = Readonly<{
  title: string;
  state: "open" | "closed" | "merged" | string;
  updatedAt: string;
  labels?: readonly string[];
  author?: string;
  stale?: boolean;
}>;

export type GithubCommitCache = Readonly<{
  message: string;
  author: string;
  date: string;
  stats?: Readonly<{ add: number; del: number }>;
  updatedAt: string;
  stale?: boolean;
}>;

export type GithubRepoCache = Readonly<{
  stars: number;
  language: string;
  description: string;
  updatedAt: string;
  stale?: boolean;
}>;

export type GithubCache = GithubIssuePrCache | GithubCommitCache | GithubRepoCache;

export type GithubCacheWithSnapshot = GithubCache & Readonly<{ snapshotAt: string }>;


export const githubCacheKey = (ref: GithubRef): string => {
  const owner = ref.owner.toLowerCase();
  const repo = ref.repo.toLowerCase();
  const kind = ref.kind.toLowerCase();
  if (ref.kind === "github-commit") {
    const sha = (ref as Extract<GithubRef, { kind: "github-commit" }>).sha.toLowerCase();
    return `github:${kind}:${owner}/${repo}@${sha}`;
  }
  if (ref.kind === "github-repo") {
    return `github:${kind}:${owner}/${repo}`;
  }
  const num = (ref as Extract<GithubRef, { kind: "github-issue" | "github-pr" }>).number;
  return `github:${kind}:${owner}/${repo}#${num}`;
};

export type CauscapeNode = Readonly<{
  id: string;
  label: string;
  kind: CauscapeNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  github?: GithubRef;
  cache?: GithubCache | GithubCacheWithSnapshot;
  element: ExcalidrawCauscapeNodeElement;
}>;

export type CauscapeEdge = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  element: ExcalidrawCauscapeEdgeElement;
}>;

export type CauscapeGraph = Readonly<{
  nodes: readonly CauscapeNode[];
  edges: readonly CauscapeEdge[];
  diagnostics: readonly Diagnostic[];
  nodesById: ReadonlyMap<string, CauscapeNode>;
  edgesById: ReadonlyMap<string, CauscapeEdge>;
  adjacency: ReadonlyMap<string, readonly string[]>;
}>;

export type ViewportBounds = Readonly<{
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: number;
}>;

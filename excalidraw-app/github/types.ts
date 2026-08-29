/**
 * App-local GitHub types.
 * Re-exports canonical element types so app-local and package types share
 * identity (avoiding duplicate-union incompatibility in graphMCP).
 * No publish required; file stays app-local.
 */

import type {
  GithubRef as GithubRefImported,
  GithubCache as GithubCacheImported,
} from "@excalidraw/element/types";

export type {
  CauscapeNodeKind,
  GithubRef,
  GithubIssuePrCache,
  GithubCommitCache,
  GithubRepoCache,
  GithubCache,
  CauscapeNodeData,
} from "@excalidraw/element/types";

export type GithubCacheWithSnapshot = GithubCacheImported & Readonly<{ snapshotAt: string }>;

export type GithubCacheRecord = Readonly<{
  etag?: string;
  data: GithubCacheImported;
  fetchedAt: number;
}>;

export type FetchGithubResult = Readonly<{
  data: GithubCacheImported;
  etag?: string;
  notModified: boolean;
}>;

/**
 * Canonical cache key. Lowercased as required.
 * `github:${kind}:${owner}/${repo}#${number}|@${sha}`
 * Uses canonical GithubRef identity.
 */
export const githubCacheKey = (ref: GithubRefImported): string => {
  const base = `github:${ref.kind}:${ref.owner}/${ref.repo}`;
  if (ref.kind === "github-commit") {
    return `${base}@${ref.sha}`.toLowerCase();
  }
  if (ref.kind === "github-repo") {
    return base.toLowerCase();
  }
  return `${base}#${ref.number}`.toLowerCase();
};

// Alias required by contract spelling.
export const cacheKey = githubCacheKey;

export const isGithubCacheRecord = (v: unknown): v is GithubCacheRecord => {
  if (!v || typeof v !== "object") {
    return false;
  }
  const r = v as Record<string, unknown>;
  return typeof r.fetchedAt === "number" && typeof r.data === "object" && r.data !== null;
};

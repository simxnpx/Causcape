import { defaultGithubCacheStore } from "./cache";
import type { FetchGithubResult, GithubCache, GithubRef } from "./types";
import { githubCacheKey } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GITHUB_API_BASE = "https://api.github.com";
const FETCH_TIMEOUT_MS = 15_000;

// Deduplication for inflight fetches. Key is githubCacheKey(ref) lowercased.
export const pendingFetches: Map<string, Promise<FetchGithubResult>> = new Map();

// Re-export helpers so WebMCP layer can import from a single entry.
export { getCachedGithubData } from "./cache";
export { githubCacheKey as getCacheKey } from "./types";
export { githubCacheKey as cacheKey } from "./types";

// ---------------------------------------------------------------------------
// URL + mapping
// ---------------------------------------------------------------------------

const getGithubApiUrl = (ref: GithubRef): string => {
  const owner = encodeURIComponent(ref.owner);
  const repo = encodeURIComponent(ref.repo);
  if (ref.kind === "github-issue") {
    return `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${encodeURIComponent(String(ref.number))}`;
  }
  if (ref.kind === "github-pr") {
    return `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${encodeURIComponent(String(ref.number))}`;
  }
  if (ref.kind === "github-commit") {
    return `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref.sha)}`;
  }
  return `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
};

type GithubIssueApi = {
  title?: string;
  state?: string;
  updated_at?: string;
  labels?: readonly { name?: string }[] | readonly string[];
  user?: { login?: string } | null;
};

type GithubPrApi = {
  title?: string;
  state?: string;
  merged?: boolean;
  updated_at?: string;
  labels?: readonly { name?: string }[] | readonly string[];
  user?: { login?: string } | null;
};

type GithubCommitApi = {
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
  stats?: { additions?: number; deletions?: number };
};

type GithubRepoApi = {
  stargazers_count?: number;
  language?: string | null;
  description?: string | null;
  updated_at?: string;
};

const toIssueCache = (json: GithubIssueApi): GithubCache => {
  const labelsRaw = json.labels ?? [];
  const labels: string[] = labelsRaw.map((l) =>
    typeof l === "string" ? l : (l.name ?? ""),
  ).filter((s) => s.length > 0);

  return {
    title: json.title ?? "Untitled",
    state: json.state ?? "open",
    updatedAt: json.updated_at ?? new Date().toISOString(),
    labels,
    author: json.user?.login,
  } as GithubCache;
};

const toPrCache = (json: GithubPrApi): GithubCache => {
  const labelsRaw = json.labels ?? [];
  const labels: string[] = labelsRaw.map((l) =>
    typeof l === "string" ? l : (l.name ?? ""),
  ).filter((s) => s.length > 0);
  const state = json.merged ? "merged" : (json.state ?? "open");
  return {
    title: json.title ?? "Untitled",
    state,
    updatedAt: json.updated_at ?? new Date().toISOString(),
    labels,
    author: json.user?.login,
  } as GithubCache;
};

const toCommitCache = (json: GithubCommitApi): GithubCache => {
  const msg = json.commit?.message ?? "";
  const author = json.commit?.author?.name ?? json.author?.login ?? "unknown";
  const date = json.commit?.author?.date ?? new Date().toISOString();
  const stats =
    json.stats
      ? {
          add: json.stats.additions ?? 0,
          del: json.stats.deletions ?? 0,
        }
      : undefined;
  return {
    message: msg,
    author,
    date,
    stats,
    updatedAt: date,
  } as GithubCache;
};

const toRepoCache = (json: GithubRepoApi): GithubCache =>
  ({
    stars: json.stargazers_count ?? 0,
    language: json.language ?? "",
    description: json.description ?? "",
    updatedAt: json.updated_at ?? new Date().toISOString(),
  }) as GithubCache;

const mapResponseToCache = (ref: GithubRef, json: unknown): GithubCache => {
  if (ref.kind === "github-issue") {
    return toIssueCache(json as GithubIssueApi);
  }
  if (ref.kind === "github-pr") {
    return toPrCache(json as GithubPrApi);
  }
  if (ref.kind === "github-commit") {
    return toCommitCache(json as GithubCommitApi);
  }
  return toRepoCache(json as GithubRepoApi);
};

const syntheticNotFound = (ref: GithubRef): GithubCache => {
  const now = new Date().toISOString();
  if (ref.kind === "github-issue" || ref.kind === "github-pr") {
    return {
      title: "Not found",
      state: "closed",
      updatedAt: now,
      stale: true,
    } as GithubCache;
  }
  if (ref.kind === "github-commit") {
    return {
      message: "Not found",
      author: "unknown",
      date: now,
      updatedAt: now,
      stale: true,
    } as GithubCache;
  }
  return {
    stars: 0,
    language: "",
    description: "Not found",
    updatedAt: now,
    stale: true,
  } as GithubCache;
};

// ---------------------------------------------------------------------------
// fetchGithub
// ---------------------------------------------------------------------------

export const fetchGithub = async (
  ref: GithubRef,
  token?: string,
  etag?: string,
): Promise<FetchGithubResult> => {
  const key = githubCacheKey(ref);
  const existing = pendingFetches.get(key);
  if (existing) {
    return existing;
  }

  const task: Promise<FetchGithubResult> = (async (): Promise<FetchGithubResult> => {
    const url = getGithubApiUrl(ref);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (etag) {
      headers["If-None-Match"] = etag;
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      throw new Error(aborted ? `GitHub fetch timed out: ${url}` : `GitHub fetch failed: ${String(err)}`);
    } finally {
      clearTimeout(tid);
    }

    const responseEtag = response.headers.get("etag") ?? undefined;

    if (response.status === 304) {
      // Try to return cached data if we have it; otherwise synthesize minimal.
      const cached = await defaultGithubCacheStore.get(key);
      const data = cached?.data ?? syntheticNotFound(ref);
      // Preserve stale flag semantics — 304 means our cache is still current,
      // so return it without marking stale.
      if (cached?.data) {
        return { data: cached.data, etag: responseEtag ?? etag, notModified: true };
      }
      return { data, etag: responseEtag ?? etag, notModified: true };
    }

    if (response.status === 404) {
      const data = syntheticNotFound(ref);
      // Persist 404 as stale so UI can render fallback and avoid hot-loop.
      // ETag absent on 404; keep fetchedAt for expiry decisions upstream.
      const record = { etag: responseEtag, data, fetchedAt: Date.now() };
      await defaultGithubCacheStore.set(key, record);
      return { data, etag: responseEtag, notModified: false };
    }

    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get("retry-after") ?? undefined;
      const body = await response.text().catch(() => "");
      const hint = retryAfter ? ` retry-after ${retryAfter}` : "";
      throw new Error(
        `GitHub rate limited (${response.status})${hint}: ${body.slice(0, 500)}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub fetch ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
    }

    const json: unknown = await response.json().catch(() => null);
    if (!json || typeof json !== "object") {
      throw new Error("GitHub fetch returned invalid JSON");
    }

    const data = mapResponseToCache(ref, json);
    const record = { etag: responseEtag, data, fetchedAt: Date.now() };
    await defaultGithubCacheStore.set(key, record);

    return { data, etag: responseEtag, notModified: false };
  })();

  pendingFetches.set(key, task);
  try {
    return await task;
  } finally {
    pendingFetches.delete(key);
  }
};

// ---------------------------------------------------------------------------
// batchFetchGithub — REST MVP (GraphQL future TODO)
// ---------------------------------------------------------------------------

/**
 * Batch fetch a set of refs via REST in parallel.
 * - Deduplicates refs by cacheKey.
 * - Uses pendingFetches dedup per-item.
 * - Returns Map<cacheKey, GithubCache> for successful fetches; 404 entries
 *   are included as stale cache values; rate-limit/ network errors are
 *   omitted (caller may keep prior cache).
 *
 * TODO: replace with GitHub GraphQL batch when token is available to reduce
 * request count under 60/h unauth limits.
 */
export const batchFetchGithub = async (
  refs: readonly GithubRef[],
  token?: string,
): Promise<Map<string, GithubCache>> => {
  const unique = new Map<string, GithubRef>();
  for (const r of refs) {
    const k = githubCacheKey(r);
    if (!unique.has(k)) {
      unique.set(k, r);
    }
  }

  const entries = Array.from(unique.entries());

  // Gather ETags in parallel where available to support conditional requests.
  const etagByKey = new Map<string, string | undefined>();
  await Promise.all(
    entries.map(async ([k]) => {
      const rec = await defaultGithubCacheStore.get(k);
      if (rec?.etag) {
        etagByKey.set(k, rec.etag);
      }
    }),
  );

  const results = await Promise.all(
    entries.map(async ([k, ref]) => {
      try {
        const res = await fetchGithub(ref, token, etagByKey.get(k));
        return [k, res.data] as const;
      } catch {
        // Omit failed fetches; caller retains prior cache.
        return null;
      }
    }),
  );

  const out = new Map<string, GithubCache>();
  for (const row of results) {
    if (row) {
      out.set(row[0], row[1]);
    }
  }
  return out;
};

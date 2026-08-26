# ADR 001 — GitHub Nodes as Postmortem Map

**Date:** 2026-08-26
**Status:** Accepted
**Branch:** `feature/graph-engine`
**Deciders:** Causcape core (graph / element / app / WebMCP slices)
**Scope:** Local MVP — GitHub entities as causal nodes for incident reconstruction

---

## Context

Causcape is a fork of Excalidraw. `feature/graph-engine` introduces a causal graph substrate:

- `causcape-node` (kind `variable`) + `causcape-edge` elements in `packages/element`
- `buildGraph` / `validateGraph` / `position` in `packages/graph`

Goal is to reconstruct incidents as **postmortem maps**: a directed graph where nodes are observations/events and edges are causal/temporal relations. GitHub is the primary fact-source for software incidents. The MVP must let a local operator create GitHub-backed nodes via **local WebMCP**, hydrate them with live GitHub data without mandatory auth, and persist/share maps without a backend or Vercel deploy.

Constraints: TypeScript, no allocation, immutable, `app.ownerDocument`/`app.ownerWindow`, boring explicit code; `yarn test:typecheck` must pass; no new deps unless trivial — **no Octokit**, use `fetch`; `60/h` unauthenticated fallback must work; token memory-only; layout owned by graph engine.

---

## Decision — Settled Q1–Q18

The following records the 18 settled questions. Wording mirrors the canonical issue; settled answers are normative and reflected in § Contract.

### Q1 — What job are you actually hiring GitHub nodes for?

*Evidence-linking (variable + GitHub citation) vs project graph (GitHub dependency viewer). Why commit/issue/repo as first-class node vs attachment on variable?*

**Settled: Postmortem map; PR included as first-class.**

Causcape optimizes for incident reconstruction (what happened / in what order / what caused/fixed/reverted what), not a GitHub project/dependency viewer. GitHub entities are **first-class `causcape-node` kinds**, not attachments on `variable`. `variable` remains for operator-authored causal factors without a GitHub URL. PR is included from the start — the most common fix-evidence for postmortems — alongside issue/commit/repo.

- *Consequence:* Single `causcape-node` element type branching on `causcape.kind`; render/type-checks discriminate `variable` vs `github-*`. Snapshot travels with the node.

### Q2 — Why commits + issues + repos and not PRs?

*Minimal useful entity set for software engineer schemas; why this triple and not pr/discussion/release/workflow/file; sprawl cost (guards/fetchers/render).*

**Settled: MVP is issue / PR / commit / repo (four kinds + variable).**

Four GitHub kinds cover ~95% of postmortem citations (bug report → fix PR → landing commit → repo context). Excluded for MVP: discussion, release, workflow run, deployment, comment-as-node, branch, file. Each extra kind multiplies guards, fetchers, render branches, and cache shapes; we pay that only after MVP proves the map.

```
CauscapeNodeKind = "variable" | "github-issue" | "github-pr" | "github-commit" | "github-repo"
```

### Q3 — Live vs snapshot — what does a node store?

*Live mirror (fetch on render, fresh but offline/rate-limit broken) vs frozen citation (deterministic JSON, stale) vs hybrid.*

**Settled: Hybrid.**

- **Frozen snapshot** embedded in the node guarantees deterministic, offline-readable maps and versioned exports.
- **Live fetch** hydrates on explicit refresh. Neither alone is acceptable: live-only breaks offline/reproducibility; frozen-only goes stale.

### Q4 — Public-only unauth — are you okay with 60 req/h?

*Unauth IP limit, 20 nodes × 3 opens = 403. Optional PAT in localStorage vs hard unauth.*

**Settled: GitHub App + unauthenticated (local MVP: unauth + ephemeral PAT; App deferred).**

Unauthenticated `fetch` (`60/h` per IP) is the **default**. The map must remain usable with no token (graceful stale rendering, rate-limit diagnostics, never block editing). Elevated path is an **ephemeral PAT** supplied via WebMCP memory-only (see Q7/Q12/Q18). For MVP we do **not** persist PAT in `localStorage` — that was explicitly rejected. The GitHub App path that removes per-user PAT friction is deferred to § Future.

### Q5 — What does an edge mean between GitHub entities?

*Causal vs reference/depends; cycle/orphan validation meaningful?*

**Settled: Pool-based freeform causal/temporal semantics; validation remains meaningful.**

Edges denote causal/temporal claims between *postmortem nodes* (not GitHub dependency graph). Cycles, orphans, and duplicates are still diagnosed via `validateGraph` (warning/info, not blocking). Label pool (Q9/Q14) gives the semantics; graph-engine validates structure.

### Q6 — Which GitHub entities are actually useful for a postmortem?

*issue/pr/commit/repo/release/workflow run/deployment/comment/branch/file; MVP 3–4 that reconstructs what changed/broke/fixed.*

**Settled: MVP four (Q2) is sufficient.**

Issue (what broke), PR (proposed fix), commit (what landed / what reverted), repo (scope context) reconstruct the narrative. Releases/workflows/deployments/comments/branches/files remain cache detail or future kinds — not MVP nodes.

### Q7 — GitHub App vs OAuth — where does private key live?

*Frontend Vite cannot hold PEM/client_secret (CORS, bundle leak); needs Vercel edge function / proxy vs PAT/Device Flow.*

**Settled: Safest — private key never in frontend bundle; server-side mint.**

PEM / `client_secret` cannot live in Vite frontend (bundle leak + CORS). The safe shape is a **server component (Vercel edge / proxy) that mints installation tokens** from the App private key. Frontend holds only the short-lived token in memory. For local MVP the server is **not deployed** (see Q18); the PAT-via-WebMCP path stands in with the same memory-only discipline.

### Q8 — Hybrid live+snapshot — who is source of truth?

*SnapshotAt + cache + stale bool; who overwrites label (user edit vs GitHub title), invalidation (poll/manual/If-None-Match), load-time fetch?*

**Settled: Hybrid with embedded snapshot as source of truth on load; explicit invalidation; user label wins.**

- Node stores `cache?: GithubCache & { snapshotAt: string }` plus `stale?: boolean`.
- On load: **snapshot wins**; no fetch. Rendering reads embedded cache.
- `refreshGithubNode` / `refreshAllGithubNodes` revalidate via `ETag` / `If-None-Match`, update `cache` + `snapshotAt`, clear `stale`. On `304`, bump `fetchedAt` only.
- **Label precedence:** if operator edits `label`, that value is preserved; GitHub `title`/`message` only populates `cache`, not `label`, unless the operator clears it (future UI: "reset to GitHub title" affordance).
- Polling is rejected; explicit manual refresh only.

### Q9 — What does an edge mean in postmortem if "doesn't matter"?

*Temporal (preceded) vs causal (caused) vs fixes/reverts; need typed label pool or freeform?*

**Settled: Pool-based freeform.**

A global pool covers the common postmortem verbs; edges remain `string` freeform so novel phrasing isn't blocked. See Q14 for pool location.

```
CAUSCAPE_EDGE_LABEL_POOL = ["caused","fixed by","reverted","preceded","relates to","blocked"] as const
```

### Q10 — How do nodes get created in real postmortem flow?

*Paste URL vs import window (owner/repo+time range → batch fetch) vs Cmd+K search picker; node count 10/50/200.*

**Settled: WebMCP agent is the entry point; paste-URL / bulk import are future affordances on top.**

In the MVP the **spawned subagent / local WebMCP** creates nodes via `createCauscapeNode` (single or batch). Paste-URL, time-range import, and `Cmd+K` picker are compatible future UIs that would call the same tool. Expected postmortem size is tens, not hundreds; batch tool `createNodes` exists for 10–50 node imports without per-node history spam.

### Q11 — What is WebMCP — who calls what, where does GitHub fetch happen?

*Browser MCP tools createCauscapeNode/Edge, server-side vs browser fetch, token boundary.*

**Settled: Fetch by app after creation; WebMCP creates structure, app hydrates.**

- **WebMCP** (in `excalidraw-app/mcp`) exposes `createCauscapeNode` / `createCauscapeEdge` / `getGraph` / `setGithubToken` / `refresh*` over `navigator.mcp` (fallback `window.CauscapeMCP` for debug).
- WebMCP **does not fetch GitHub** itself. It creates node skeletons with `github: GithubRef` (+ optional initial `cache`). The **app** performs `fetch` against `api.github.com` (or GraphQL batch) on `refresh*`, using the memory-only token if present.
- Token boundary: WebMCP `setGithubToken` writes to the app's `useRef`; the app attaches `Authorization` header; no token crosses to a server in the MVP.

### Q12 — Safest GitHub App — which permissions and token lifecycle?

*Permissions (metadata/read, issues:read, etc.), token lifetime (1h install vs long PAT), storage (memory vs httpOnly cookie vs localStorage), per-repo vs per-org.*

**Settled: Spawned subagent — cannot be pure-local; App deferred, PAT memory-only for MVP.**

The safest App shape is **read-only, short-lived installation token** (1h, `metadata:read`, `contents:read`, `issues:read`, `pull-requests:read`), scoped per-repo, stored **memory-only** (`useRef`) or `httpOnly` cookie if proxied — never `localStorage`. A pure-local frontend cannot hold the PEM, so the mint must be a spawned server component. For the local MVP this whole piece is **deferred**; we keep the ephemeral PAT memory-only discipline now so the App can swap in without changing storage semantics. `expiresAt` is plumbed through `setGithubToken` for the future short-lived token.

### Q13 — Agent scale — dedup, layout, rate limit?

*Same issue twice → one node vs duplicate, x,y agent vs position.ts auto-layout, 50 nodes batch vs 50 REST calls, cap.*

**Settled: Yes — dedup, layout, and fetch optimizations are required.**

- **Dedup:** `createCauscapeNode` is idempotent by `github.url` (lowercased). Second create returns `{ id, created: false }`.
- **Layout:** `position.ts` owns `x,y`; agents never invent coordinates. Omitted `x,y` → timeline layout by `createdAt` (viewport-aware `suggestPosition`).
- **Rate limit / scale:** `Map` inflight dedup + `ETag`/`If-None-Match` + GraphQL batch on `refreshAllGithubNodes` + soft cap (warn when bulk > 50). Prevents 50 REST calls for 50 nodes.

### Q14 — Pool of edge labels — where does pool live and who curates it?

*Global constants vs per-board appState vs org config .causcape/config.json.*

**Settled: Global pool in `packages/graph`.**

`CAUSCAPE_EDGE_LABEL_POOL` lives as `readonly` constants in `packages/graph`. No per-board `appState` fork, no repo config file for MVP. Future org config can extend (not replace) the pool; the global remains the single source of truth.

### Q15 — Caching — embedded in node vs separate store, and optimization?

*Embedded cache (versioned) vs IndexedDB ETag store (cross-board dedup, 304) + Map inflight + GraphQL batch.*

**Settled: Both — embedded snapshot + IndexedDB ETag store.**

- **Embedded** `element.causcape.cache` (+ `snapshotAt`) makes exports self-contained and offline-readable; this is the load-time source of truth.
- **IndexedDB** `github-cache-v1` / `github-cache` keyed by `cacheKey` stores `{ etag?, data: GithubCache, fetchedAt }` for cross-board reuse, 304 revalidation, inflight dedup, and GraphQL batch. No fetch on load; explicit `refresh*` only.

### Q16 — WebMCP idempotency + layout — who owns x,y?

*Idempotent upsert by github.url lowercased, x,y omitted → graph-engine timeline layout.*

**Settled: Graph-engine owns `x,y`; idempotent by lowercased `github.url`.**

- Dedup key: `github.url` lowercased (with `cacheKey` as storage key `github:${kind}:${owner}/${repo}#${number}|@${sha}` lowercased).
- `createCauscapeNode` without `x,y` delegates to `position.ts` → **timeline by `createdAt`** (issue/PR `createdAt`, commit `date`, repo `updatedAt`), left-to-right, viewport-aware fallback. Supplied `x,y` bypass auto-layout.

### Q17 — Where does postmortem live after agent populates?

*localStorage autosave vs file in repo postmortems/*.excalidraw vs Causcape share link; source of truth & sharing.*

**Settled: Within component — local persistence (scene), not Vercel/hosted share for MVP.**

Scene elements (including embedded caches) are the source of truth, persisted via existing Excalidraw local persistence (localStorage autosave + file export). No repo-file write and no hosted share link in the MVP. Sharing is **file export** (`.excalidraw` with snapshots) or copy. Future repo-file or Causcape share can be additive.

### Q18 — Scalable safest without per-user edge function — which compromise?

*A) unauth + ephemeral token via WebMCP (agent supplies gh auth token memory-only, zero backend) vs B) hosted proxy you run once (App mint in your Vercel, users zero setup). Causcape not on Vercel, keep local then future App secure session in background.*

**Settled: A — local, future App background mint.**

For the MVP choose **A**: **unauthenticated by default + ephemeral token via WebMCP memory-only (`useRef`, never `localStorage`/`VITE_*`)**, zero backend. Causcape is not on Vercel in this phase; no edge function is required. Track **B** as the follow-up: a Vercel (or equivalent) edge function that **mints GitHub App installation tokens in the background** (secure session), still holding only short-lived tokens in memory. The MVP contract already supports `expiresAt` so B can land without breaking A.

---

## Contract — normative interfaces

All slices must conform to these types. Drift requires an ADR amendment.

### `packages/element/src/types.ts`

```ts
type CauscapeNodeKind = "variable" | "github-issue" | "github-pr" | "github-commit" | "github-repo";

type GithubRef =
  | { kind: "github-issue"; owner: string; repo: string; number: number; url: string }
  | { kind: "github-pr";    owner: string; repo: string; number: number; url: string }
  | { kind: "github-commit"; owner: string; repo: string; sha: string; url: string }
  | { kind: "github-repo";  owner: string; repo: string; url: string };

type GithubCache =
  | { title: string; state: "open" | "closed" | "merged" | string; updatedAt: string; labels?: string[]; author?: string; stale?: boolean }
  | { message: string; author: string; date: string; stats?: { add: number; del: number }; updatedAt: string; stale?: boolean }
  | { stars: number; language: string; description: string; updatedAt: string; stale?: boolean };

type CauscapeNodeData =
  | { schemaVersion: 1; kind: "variable"; label: string }
  | { schemaVersion: 1; kind: "github-issue" | "github-pr" | "github-commit" | "github-repo"; label: string; github: GithubRef; cache?: GithubCache & { snapshotAt: string } };

type ExcalidrawCauscapeNodeElement = _ExcalidrawElementBase & {
  type: "causcape-node";
  causcape: CauscapeNodeData;
};
```

### `packages/graph/src/types.ts`

```ts
type CauscapeNode = {
  id: string; label: string; kind: CauscapeNodeKind;
  x: number; y: number; width: number; height: number;
  github?: GithubRef; cache?: GithubCache;
  element: ExcalidrawCauscapeNodeElement;
};

const CAUSCAPE_EDGE_LABEL_POOL = [
  "caused", "fixed by", "reverted", "preceded", "relates to", "blocked",
] as const;

// cacheKey: `github:${kind}:${owner}/${repo}#${number}|@${sha}`  lowercased
```

### `excalidraw-app/mcp` — WebMCP tools

```ts
createCauscapeNode({ kind, github, label?, cache? }): { id: string; created: boolean } // idempotent by github.url
createCauscapeEdge({ fromNodeId, toNodeId, label? }): { id: string }
getGraph(): CauscapeGraph
setGithubToken({ token, expiresAt? }): void // memory-only useRef, never persisted
clearGithubToken(): void
refreshGithubNode({ id }): Promise<void>
refreshAllGithubNodes(): Promise<void>
```

`label` is optional on node create — if omitted, derived from `cache.title` / `cache.message` / `owner/repo`. Edges may omit `label`. `getGraph` returns the `buildGraph` snapshot. No Vercel tool is exposed in this phase.

### Cache (IndexedDB)

```
DB:    github-cache-v1
Store: github-cache
Key:   cacheKey  // `github:${kind}:${owner}/${repo}#${number}|@${sha}` lowercased
Value: { etag?: string; data: GithubCache; fetchedAt: number }
Policy: ETag / If-None-Match + Map inflight dedup + GraphQL batch on bulk refresh
Rule:   No fetch on load; explicit refresh only
```

---

## Consequences

**Positive**

- Maps are shareable as plain `.excalidraw` files with embedded snapshots — no backend required.
- Unauthenticated use works; authenticated use is opt-in and leak-resistant (memory-only).
- Layout/validation centralised in `packages/graph`; idempotent create + global pool keep graphs consistent.
- Optimizations (ETag, inflight dedup, GraphQL batch) make bulk refresh viable without `60/h` collapse.

**Negative / risks**

- Snapshot can go stale; operator must trigger refresh. Mitigated by `stale` affordance.
- `60/h` unauth limit still reachable on bulk; future diagnostics should surface `Retry-After` / remaining quota.
- Memory-only token lost on reload — intentional friction for security.
- Hand-rolled GitHub API nuance lives in app code (no Octokit).

**Neutral**

- `x,y` owned by graph engine — WebMCP cannot do per-agent bespoke layouts.

---

## Future — GitHub App background mint

The deferred GitHub App replaces the ephemeral PAT **without breaking the MVP contract**:

- **Background mint:** a server component (Vercel edge or equivalent) mints short-lived installation tokens (1h, `metadata:read` / `contents:read` / `issues:read` / `pull-requests:read`, per-repo) from the App private key.
- **Secure session:** the app holds only the short-lived token in memory (same `useRef` + `expiresAt` discipline); silent refresh until expiry, then re-mint.
- **No breaking change** to `GithubRef` / `GithubCache` / `CauscapeNodeData`; only how `setGithubToken` is populated changes (user PAT today, server mint tomorrow).
- **Rate limit:** App tokens raise quota and allow private-repo hydration.
- **Open question for follow-up ADR:** on-demand mint during `refreshAllGithubNodes` vs proactive on scene open (opt-in).

Until that ADR lands, **unauth + ephemeral WebMCP token (memory-only, zero backend)** is the only auth elevation.

---

## Alternatives considered

- **Octokit / graphql-request** — rejected for MVP bundle/typecheck cost; `fetch` suffices for four entity shapes.
- **Auto-fetch on load** — rejected; burns quota and hides staleness.
- **Per-node layout hints** — rejected; centralising in `position.ts` avoids divergent placement.
- **Strict edge-label enum** — rejected; causal language is open-ended, pool as suggestions is more useful.
- **Persisted token (`localStorage` / `VITE_*`)** — rejected on security grounds; memory-only is the only accepted storage.
- **Hosted proxy now (Q18 B)** — deferred; requires Vercel deploy and App setup that Causcape is not ready for. Local-first keeps the MVP shippable.

---

## References

- `packages/element/src/types.ts` — `ExcalidrawCauscapeNodeElement`, `CauscapeNodeData`
- `packages/graph/src/types.ts` — `CauscapeNode`, `CAUSCAPE_EDGE_LABEL_POOL`, `cacheKey`
- `packages/graph/src/position.ts` — `suggestPosition` / timeline layout
- `packages/graph/src/graph.ts` / `validate.ts` — `buildGraph`, diagnostics
- `excalidraw-app/mcp/graphMCP.ts` — WebMCP handlers (`getGraph`, `createNode`, `createEdge`, token refs)

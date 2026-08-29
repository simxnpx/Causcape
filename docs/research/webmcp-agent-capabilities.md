# Causcape WebMCP agent capability audit

**Date:** 2026-08-26
**Scope:** Current local WebMCP and graph surface for collaborative incident reconstruction
**Application code changed:** None

## Executive summary

Causcape already exposes the basic graph CRUD loop: create nodes and edges, read a graph snapshot, validate it, refresh GitHub-backed nodes, search nodes, update labels/positions, and reset the scene. That is enough for a demo, but not enough for a human and an agent to safely reconstruct an incident together.

The highest-priority work is:

1. Define one versioned, atomic graph-operation contract that includes node settings, edge routing, provenance, actor/revision metadata, and an explicit result/diff.
2. Make the scene model and renderer total over every `causcape-*` element. A malformed or incomplete edge must become a diagnostic or repairable object, never a pointer-interaction exception.
3. Add an agent-owned layout and routing operation with incremental/interactive behavior, pinned human positions, obstacle-aware edge endpoints, and readable labels.
4. Add incident evidence and timeline capabilities: GitHub timeline events, PR commits/reviews/files, deployment statuses, and user/agent observations must be linkable to graph claims.
5. Add collaboration controls: actor attribution, revisions, idempotency keys, conflict detection, undo/checkpoints, and a cross-tab/server synchronization seam.

The current WebMCP API is still a draft Community Group Report rather than a W3C Standard. Its API gives Causcape useful interoperability hooks—structured schemas, read-only/untrusted-content annotations, cancellation, tool-change events, origin information, and page observations—but it does not define Causcape’s graph semantics, transactions, confirmation UX, layout, or collaboration model. Those are application contracts Causcape must make explicit. [WebMCP specification](https://webmachinelearning.github.io/webmcp/)

## Current capability surface

### Registered functionality

The canonical definitions in [`packages/graph/src/mcp.ts`](../../packages/graph/src/mcp.ts) currently describe:

| Area | Current tools | What an agent can do | Important limitation |
| --- | --- | --- | --- |
| Read | `getGraph`, `validateGraph` | Obtain nodes, edges, and diagnostics | No viewport, selection, revision, provenance, settings, or rendered/interaction health |
| Create | `createNode`, `createNodes`, `createCauscapeNode`, `createEdge`, `createCauscapeEdge` | Create variable and GitHub issue/PR/commit/repo nodes and directed edges | Creation and extended creation are split; no transaction identifier or operation result/diff; coordinates can still be supplied by callers |
| Edit | `updateElement` | Change a node label/position or an edge label | No node appearance/settings, edge style/route, relation type, evidence, pin, lock, or metadata patch |
| Search | `searchNodes` | Case-insensitive search over IDs, labels, GitHub refs, and cache values | Node-only; no edge/evidence/timeline search and no focus/selection action |
| GitHub | `setGithubToken`, `clearGithubToken`, `refreshGithubNode`, `refreshAllGithubNodes` | Hydrate cached GitHub data | Refresh output is not a provenance-bearing evidence record; no incident timeline expansion |
| Destructive control | `resetCanvas` | Remove the scene | Destructive action has no confirmation, expected revision, checkpoint, or recoverable operation result |

The implementation additionally exposes aliases and a debug `window.CauscapeMCP` map in [`excalidraw-app/mcp/graphMCP.ts`](../../excalidraw-app/mcp/graphMCP.ts). The modern registration path separately defines the extended GitHub tools. This creates schema drift risk: there are two places to keep descriptions and schemas synchronized, and the canonical list does not describe every registered extended tool.

The graph model in [`packages/graph/src/types.ts`](../../packages/graph/src/types.ts) contains node geometry, a free-form edge label, GitHub references, and a cache snapshot. It has no first-class node settings, relation semantics, evidence/provenance, actor, revision, confidence, time interval, or layout/routing metadata. The ADR explicitly limits the current contract to labels, coordinates, GitHub snapshots, and a small free-form edge-label pool. [`ADR-001`](../../docs/adr/ADR-001-github-nodes-postmortem.md)

### WebMCP integration findings

The implementation is using the right general integration point—`document.modelContext`—and derives it from the owning document. The WebMCP IDL exposes `registerTool`, `getTools`, `executeTool`, and `ontoolchange`; `executeTool` returns the stringified tool result. The draft’s current algorithm parses the execution argument as JSON before invoking the callback, even though the IDL presents `inputObject` as an object. In local Chromium testing, passing a JavaScript object rejected with `Failed to parse input arguments`, while passing `JSON.stringify(input)` worked. Causcape should keep a small compatibility adapter and test both shapes until the implementation/spec converge. [WebMCP API and execution algorithm](https://webmachinelearning.github.io/webmcp/#api)

The current registrations do not consistently use the draft’s `title`, `annotations`, or execution `AbortSignal`. Read operations should advertise `readOnlyHint: true`; GitHub-derived results and user-authored incident text should be marked with `untrustedContentHint: true` where appropriate. The callback should accept the execution options and cancel fetch/layout work when `options.signal` aborts. WebMCP defines both annotations and the signal for these purposes. [Tool annotations and callback options](https://webmachinelearning.github.io/webmcp/#model-context-tool-dictionary)

Tool availability is dynamic: the draft defines `ontoolchange` and says that tools can be registered/unregistered and exposed across documents/origins. Causcape should treat the tool schema as a stable public interface, version it deliberately, and avoid silently changing the meaning of a name while an agent holds an older tool description. [WebMCP tool-change and registration behavior](https://webmachinelearning.github.io/webmcp/#events)

WebMCP observations may include the tool map plus implementation-defined useful state such as screenshots, accessibility-tree data, or other page context. That is not a graph-specific state contract. Causcape should therefore expose compact structured view state and graph summaries instead of requiring an agent to infer selection, viewport, or layout health from pixels. [WebMCP page observations](https://webmachinelearning.github.io/webmcp/#page-observations)

Finally, WebMCP’s security section explicitly calls out prompt injection through tool metadata and output, misrepresentation of intent, and the risk of direct tool paths having different validation than UI paths. GitHub titles, descriptions, issue bodies, comments, and agent-supplied labels must be treated as data, not instructions. Tool descriptions should state exact side effects, and destructive operations should have an explicit confirmation/checkpoint policy. [WebMCP security and privacy considerations](https://webmachinelearning.github.io/webmcp/#security-and-privacy-considerations) and [Chrome WebMCP guidance](https://developer.chrome.com/docs/ai/webmcp?hl=en)

## Capability gaps for collaborative incident reconstruction

### 1. Settings are not a graph capability yet

The Excalidraw element already has visual fields such as `backgroundColor`, `strokeColor`, `strokeWidth`, `fillStyle`, `roundness`, `roughness`, and `opacity`, but the Causcape node data and `updateElement` schema do not expose a controlled settings object. That explains why agents must guess at low-level element patches and why style changes are difficult to make consistent.

Recommendation: add a versioned, constrained `settings` object to node data, for example:

```ts
type CauscapeNodeSettings = {
  palette?: "default" | "warning" | "critical" | "resolved" | "evidence";
  backgroundColor?: string;
  strokeColor?: string;
  textColor?: string;
  emphasis?: "normal" | "muted" | "focused";
  size?: "compact" | "default" | "large";
  pinned?: boolean;
};
```

Expose it through the same operation as labels and positions, not a separate tool per property. Validate the palette/size enums, clamp dimensions, preserve unknown future fields on load, and return the normalized settings actually applied. Keep raw Excalidraw fields as the renderer projection rather than the primary agent contract.

Recommended operation: `updateNodes` with an array of `{ id, patch }`, `expectedRevision`, `operationId`, and `dryRun`. It should support settings, label, position, pinning, and optionally selection/focus metadata in one atomic history entry.

### 2. The graph has no safe operation or concurrency contract

`resetCanvas` calls the imperative API directly, and the create/update handlers independently read the current scene and write a new scene. The public result does not include a graph revision, changed IDs, inverse operation, or whether a concurrent human edit was observed. This is acceptable for a single demo caller but unsafe when a human is dragging nodes while an agent is applying a large reconstruction.

Recommendation: introduce an application-level operation envelope:

```ts
type GraphOperation = {
  operationId: string;
  actor: { id: string; kind: "human" | "agent" | "system" };
  expectedRevision?: number;
  atomic?: boolean;
  dryRun?: boolean;
  ops: GraphOp[];
};
```

Return `{ revision, applied, changedIds, diagnostics, inverse }`. Reject a stale `expectedRevision` with a structured conflict rather than overwriting a human move. Make repeated `operationId`s idempotent. `resetCanvas` should accept an expected revision and create a recoverable checkpoint; a hard reset without those controls is too easy for an agent to invoke accidentally.

This also gives the UI a single place to record human and agent changes, undo them, display “agent is editing,” and explain what changed.

### 3. The renderer/interaction boundary is not total

The reported `deconstructLinearOrFreeDrawElement(... reading 'length')` exception means a Causcape element reached generic Excalidraw distance/collision code without satisfying the linear-element invariant. The failure is especially damaging in a collaborative canvas: a human cannot select or move the element that an agent created.

Recommendation, in priority order:

- Normalize and validate every created or imported `causcape-edge` before it enters the scene. Ensure `points` is a non-empty finite sequence and all binding/arrow fields satisfy the element contract.
- Make `buildGraph`/`validateGraph` report malformed element shape as a diagnostic with the element ID.
- Add a repair operation, such as `repairGraph`, that returns a before/after summary and does not silently discard evidence.
- Add interaction tests that create every node/edge shape, reload it, hit-test it, drag it, undo it, and export/import it.
- Keep custom rendering, hit-testing, distance, binding, and serialization projections in sync; a node or edge is not complete when it only renders.

The WebMCP tool should return a structured error such as `ELEMENT_INVALID` or `GRAPH_CONFLICT`, never an unclassified JavaScript `TypeError`. This is both better UX and better agent recovery.

### 4. Current placement is a collision-avoiding fallback, not incident layout

`packages/graph/src/position.ts` currently provides viewport-aware placement and a simple timeline arrangement. It does not minimize crossings, route edges around node rectangles, place endpoints on node borders, reserve label space, preserve manually pinned positions, or separate dense connected components. The earlier stress test demonstrated the resulting failure mode: edges passed through node bodies and text.

Recommendation: expose `autoLayout` as a graph operation with:

- `mode: "timeline" | "layered" | "force" | "compact"`;
- `scope: "all" | "selection" | { nodeIds: string[] }`;
- `direction`, spacing, and label policy;
- `respectPinned: true` by default;
- a deterministic seed and `operationId`;
- output containing node positions, edge bend points, endpoint attachment points, crossing count, overlap count, and warnings.

For the incident-map default, a layered DAG-oriented layout is the strongest fit: it emphasizes edge direction, performs cycle breaking and crossing minimization, computes node coordinates and bend points, and supports orthogonal routing, labels, ports, multi-edges, and compound graphs. Eclipse ELK’s official `org.eclipse.elk.layered` documentation describes those capabilities and exposes an interactive-layout option. [Eclipse ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)

Use the layout engine behind a worker or cancellable task for large reconstructions. Preserve human moves as pins or constraints and rerun only affected components when possible. Do not make an agent responsible for inventing raw `x/y` values.

### 5. Incident evidence is under-modeled

The current GitHub cache is useful for display but is not an evidence model. A title or snapshot does not record which API response, event, review, deployment, or human observation supports a causal claim. A free-form edge label such as `caused` also does not distinguish fact, hypothesis, inference, or disagreement.

Recommendation: add first-class evidence and claim metadata:

```ts
type CauscapeEvidence = {
  id: string;
  sourceUrl: string;
  sourceKind: "github" | "log" | "metric" | "trace" | "human-note" | "agent-note";
  capturedAt: string;
  observedAt?: { start: string; end?: string };
  snapshot?: unknown;
  trust: "unverified" | "observed" | "corroborated";
};

type CauscapeClaim = {
  relation: "caused" | "fixed-by" | "reverted" | "preceded" | "blocked" | "related";
  confidence: number;
  status: "hypothesis" | "supported" | "rejected" | "confirmed";
  evidenceIds: string[];
  author: { id: string; kind: "human" | "agent" };
};
```

Recommended tools are `addEvidence`, `searchEvidence`, `linkEvidence`, `updateClaim`, and `getIncidentTimeline`. Keep untrusted source text separate from trusted tool instructions and return source URLs and capture timestamps with every hydrated result.

This maps directly to available GitHub source material. GitHub provides issue/PR timeline events, including activity that can establish ordering; pull-request APIs expose commits, files, and reviews; deployment APIs expose deployment statuses over time. These should be expandable evidence streams rather than only one cache blob on a node. [GitHub timeline events](https://docs.github.com/en/rest/issues/timeline), [GitHub pull requests](https://docs.github.com/en/rest/pulls), and [GitHub deployment statuses](https://docs.github.com/en/rest/deployments/statuses)

### 6. Collaboration state is absent

The ADR currently chooses local scene persistence and file export. That is compatible with an MVP, but it is not collaboration: two tabs/people/agents need an operation stream, actor identity, conflict policy, and presence/selection signals.

Recommendation: separate three layers:

1. **Graph document:** durable nodes, edges, evidence, settings, and layout constraints.
2. **Operation log:** ordered/idempotent human and agent operations with revisions and inverse operations.
3. **Presence:** ephemeral actor, selection, cursor, running-tool, and lock/checkpoint state.

For a local same-origin bridge, `BroadcastChannel` can carry structured operation and presence messages between browsing contexts. The HTML Standard defines same-storage-key channel delivery and structured object messages, while noting that more elaborate synchronization is a better fit for shared workers. It is a useful local transport, not a conflict-resolution algorithm or a substitute for a server/CRDT when users are on different devices. [HTML Standard: BroadcastChannel](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts)

Recommended tools are `getDocumentState`, `getOperations`, `applyOperation`, `undoOperation`, `createCheckpoint`, `restoreCheckpoint`, and `getPresence`. Include `actor`, `operationId`, `baseRevision`, and `resultRevision` in every mutating result.

### 7. Agent view/control tools are missing

The agent can change scene data but cannot reliably ask the application to show the relevant part of the map. `searchNodes` returns matches but does not focus, select, or zoom to them.

Add read-only `getViewport`, `getSelection`, `getFocusedSubgraph`, and `getDiagnostics` tools. Add mutating-but-presentational `focusNodes`, `selectElements`, `zoomToFit`, and `highlightEvidence`. Each should report the resulting viewport/selection, so a human can see what the agent is discussing. Mark the read tools read-only and make the focus tools explicit in their descriptions.

### 8. Bulk workflows need bounded, cancellable results

`createNodes` and `refreshAllGithubNodes` are useful, but large incident reconstruction needs progress, partial failure, rate-limit state, and cancellation. A single opaque promise is hard for both the user and agent to recover from.

Add `beginIncidentImport`/`getImportStatus`/`cancelImport`, or make the existing bulk tools return a bounded operation result with `completed`, `failed`, `skipped`, `diagnostics`, and `nextCursor`. Use the WebMCP execution signal for cancellation. Keep GitHub fetches deduplicated and preserve stale snapshots when a request fails.

## Prioritized tool roadmap

### P0 — safety and correctness

1. `getDocumentState`: revision, actor/presence summary, viewport, selection, graph counts, diagnostics, layout health, and pending operations.
2. `applyGraphOperation`: atomic batch create/update/delete/settings/evidence/claims/layout constraints with `operationId`, `expectedRevision`, `dryRun`, and structured inverse/result.
3. `repairGraph`: validate and repair malformed Causcape elements, reporting every change.
4. `autoLayout`: deterministic layered/interactive layout, respecting pins, returning routes and quality metrics.
5. `focusNodes` and `zoomToFit`: make agent explanations visible in the human’s current screen.
6. Add WebMCP `title`, `annotations`, stable schema versioning, `AbortSignal` handling, and one canonical registry.

### P1 — evidence and human-agent workflow

7. `getIncidentTimeline`: normalize GitHub issue/PR events, commits, reviews, and deployments into evidence records.
8. `addEvidence` / `linkEvidence` / `updateClaim`: make causal claims inspectable, confidence-bearing, and attributable.
9. `getSubgraph`: return a bounded neighborhood with node/edge/evidence counts and diagnostics, instead of forcing agents to consume the entire canvas.
10. `createCheckpoint`, `undoOperation`, `restoreCheckpoint`, and a guarded `resetCanvas`.
11. `getPresence` and operation status; add `BroadcastChannel` locally and leave a transport seam for a server/CRDT.

### P2 — scale and analyst ergonomics

12. `beginIncidentImport`/status/cancel with cursors and partial results.
13. `searchGraph`: search nodes, edges, evidence, claims, timestamps, GitHub refs, and diagnostics with ranked results.
14. `exportIncidentBundle` and `importIncidentBundle` with schema version, source manifest, and validation report.
15. `compareSnapshots` / `explainChange`: summarize what a human or agent operation changed between revisions.
16. `getLayoutQuality`: crossings, overlaps, edge-through-node count, clipped labels, and disconnected components for evals.

## Settings and operation shape proposal

Do not add one WebMCP tool per visual property. Use a small set of deep operations whose schemas mirror the user’s intent:

```ts
type GraphOp =
  | { type: "createNode"; node: NodeInput }
  | { type: "updateNode"; id: string; patch: NodePatch }
  | { type: "createEdge"; edge: EdgeInput }
  | { type: "updateEdge"; id: string; patch: EdgePatch }
  | { type: "deleteElements"; ids: string[] }
  | { type: "linkEvidence"; claimId: string; evidenceIds: string[] }
  | { type: "setLayoutConstraints"; constraints: LayoutConstraint[] };
```

Every mutating tool should:

- accept `operationId`, `expectedRevision`, `actor`, and `dryRun`;
- be idempotent for retries;
- return normalized changed objects, diagnostics, and the new revision;
- create one undo/history entry for an atomic batch;
- never silently replace a human edit;
- distinguish validation failure, conflict, network failure, rate limit, and cancellation;
- keep source content and agent instructions in separate fields;
- declare read-only and untrusted-output annotations.

This makes customization, complex architecture generation, human movement, and agent repair use the same predictable path.

## Evaluation plan

The next stress test should measure more than “nodes appeared.” Chrome’s WebMCP guidance recommends checking that agents understand when to call a tool, how to execute it, and whether the returned output is clear and acceptable. [Chrome WebMCP eval guidance](https://developer.chrome.com/docs/ai/webmcp/evals)

Run the suite in the visible Chromium context and record screenshots plus structured results for:

- 100–500 nodes across incident, service, deployment, metric, trace, and hypothesis categories;
- dense fan-in/fan-out, cycles, parallel edges, disconnected components, and long edges;
- labels of one line, two lines, long URLs, Unicode, and untrusted GitHub text;
- node settings updates while a human drags another node;
- malformed edge points loaded from an exported file, hit-tested, dragged, repaired, and re-exported;
- repeated/retried operations and stale `expectedRevision` conflicts;
- layout with pinned nodes, incremental additions, and a manually moved node;
- GitHub 404, 403/rate-limit, stale-cache, partial-refresh, and cancellation cases;
- reset confirmation, checkpoint restore, undo, and cross-tab synchronization;
- object-vs-string WebMCP execution arguments and tool re-registration during an invocation.

Success criteria should include zero uncaught interaction exceptions, zero edge-through-node routes in the quality report, stable IDs across retries, visible agent focus state, and an auditable evidence/operation trail—not just a non-empty canvas.

## Bottom line

Causcape’s missing capability is a coherent collaborative graph protocol, not merely a longer list of WebMCP functions. First make every graph mutation safe, versioned, settings-aware, and renderer-safe. Then add layout/routing and evidence as first-class operations. Finally add presence, operation history, and cross-context synchronization. This sequence lets agents build complex incident architectures while preserving the human’s ability to move, inspect, correct, and trust the map.

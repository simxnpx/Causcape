import { CaptureUpdateAction } from "@excalidraw/element";
import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@excalidraw/element";
import type {
  ExcalidrawCauscapeEdgeElement,
  ExcalidrawCauscapeNodeElement,
  GithubCache as ElementGithubCache,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  buildGraph,
  CAUSCAPE_MCP_TOOLS,
  suggestPosition,
} from "@excalidraw/graph";
import type {
  CreateEdgeInput,
  CreateNodeInput,
  GraphSnapshot,
  UpdateElementPatch,
} from "@excalidraw/graph";

import { defaultGithubCacheStore } from "../github/cache";
import { batchFetchGithub, fetchGithub } from "../github/client";
import type { GithubCache, GithubRef } from "../github/types";
import { githubCacheKey } from "../github/types";
import {
  clearGithubToken as clearMemoryToken,
  getGithubToken,
  setGithubToken as setMemoryToken,
} from "../github/tokenStore";

// ---------------------------------------------------------------------------
// Types for extended WebMCP surface
// ---------------------------------------------------------------------------

export type GraphMCPContext = {
  getApi: () => ExcalidrawImperativeAPI | null;
  getOwnerDocument?: () => Document | null;
};

type CauscapeNodeKind =
  | "variable"
  | "github-issue"
  | "github-pr"
  | "github-commit"
  | "github-repo";

type CreateCauscapeNodeInput = {
  kind?: CauscapeNodeKind;
  github?: GithubRef;
  label?: string;
  cache?: GithubCache;
  x?: number;
  y?: number;
};

type CreateCauscapeEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
};

type SetTokenInput = {
  token: string;
  expiresAt?: number | string;
};

type RefreshNodeInput = {
  id: string;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;
const VALID_KINDS = new Set<CauscapeNodeKind>([
  "variable",
  "github-issue",
  "github-pr",
  "github-commit",
  "github-repo",
]);

const assertValidOwner = (owner: string): void => {
  if (typeof owner !== "string" || !OWNER_RE.test(owner)) {
    throw new Error(`Invalid github owner: ${owner}`);
  }
};

const assertValidRepo = (repo: string): void => {
  if (typeof repo !== "string" || !REPO_RE.test(repo)) {
    throw new Error(`Invalid github repo: ${repo}`);
  }
};

const assertValidKind = (kind: string, expected?: CauscapeNodeKind): void => {
  if (!VALID_KINDS.has(kind as CauscapeNodeKind)) {
    throw new Error(`Invalid kind: ${kind}`);
  }
  if (expected && kind !== expected) {
    throw new Error(`Kind mismatch: expected ${expected} got ${kind}`);
  }
};

const assertValidGithubRef = (ref: GithubRef, kind?: CauscapeNodeKind): void => {
  if (!ref || typeof ref !== "object") {
    throw new Error("github ref must be an object");
  }
  const k = (ref as GithubRef).kind;
  assertValidKind(k);
  if (kind && k !== kind) {
    throw new Error(`github.kind ${k} does not match requested kind ${kind}`);
  }
  assertValidOwner(ref.owner);
  assertValidRepo(ref.repo);
  if (typeof ref.url !== "string" || ref.url.trim().length === 0) {
    throw new Error("github url must be a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(ref.url);
  } catch {
    throw new Error(`Invalid github url: ${ref.url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid github url protocol: ${ref.url}`);
  }
  // Host should be github.com
  if (!parsed.hostname.toLowerCase().includes("github.com")) {
    throw new Error(`github url must be github.com: ${ref.url}`);
  }
  if (k === "github-issue" || k === "github-pr") {
    const num = (ref as Extract<GithubRef, { kind: "github-issue" | "github-pr" }>).number;
    if (!Number.isInteger(num) || num <= 0) {
      throw new Error(`Invalid github number for ${k}: ${String(num)}`);
    }
  }
  if (k === "github-commit") {
    const sha = (ref as Extract<GithubRef, { kind: "github-commit" }>).sha;
    if (typeof sha !== "string" || !SHA_RE.test(sha)) {
      throw new Error(`Invalid github sha for commit: ${sha}`);
    }
  }
};

// ---------------------------------------------------------------------------
// Helpers: element ↔ github mapping
// ---------------------------------------------------------------------------

const canonicalUrl = (url: string): string => url.trim().toLowerCase();

const findGithubNodeByUrl = (
  elements: readonly import("@excalidraw/element/types").ExcalidrawElement[],
  url: string,
): ExcalidrawCauscapeNodeElement | undefined => {
  const target = canonicalUrl(url);
  for (const el of elements) {
    if (el.type !== "causcape-node") {
      continue;
    }
    const ce = el as ExcalidrawCauscapeNodeElement;
    const g = (ce.causcape as unknown as { github?: GithubRef })?.github;
    if (g?.url && canonicalUrl(g.url) === target) {
      return ce;
    }
  }
  return undefined;
};

const deriveLabelFromGithub = (ref: GithubRef, cache?: GithubCache): string => {
  if (cache) {
    if ("title" in cache && (cache as { title?: string }).title) {
      return (cache as { title: string }).title as string;
    }
    if ("message" in cache && (cache as { message?: string }).message) {
      const msg = (cache as { message: string }).message;
      return msg.split("\n")[0]?.slice(0, 80) ?? `${ref.owner}/${ref.repo}`;
    }
    if ("description" in cache) {
      return `${ref.owner}/${ref.repo}`;
    }
  }
  if (ref.kind === "github-issue" || ref.kind === "github-pr") {
    return `${ref.owner}/${ref.repo}#${(ref as { number: number }).number}`;
  }
  if (ref.kind === "github-commit") {
    return `${ref.owner}/${ref.repo}@${(ref as { sha: string }).sha.slice(0, 7)}`;
  }
  return `${ref.owner}/${ref.repo}`;
};

const withSnapshot = (data: GithubCache): GithubCache & { snapshotAt: string } =>
  ({ ...data, snapshotAt: new Date().toISOString() }) as GithubCache & {
    snapshotAt: string;
  };

const getApiOwnerDocument = (ctx: GraphMCPContext): Document | null => {
  if (ctx.getOwnerDocument) {
    const d = ctx.getOwnerDocument();
    if (d) {
      return d;
    }
  }
  // Fallback: try to derive from api container if present — best effort
  try {
    const api = ctx.getApi() as unknown as {
      app?: { ownerDocument?: Document };
      excalidrawContainerRef?: { current?: { ownerDocument?: Document } | null };
    } | null;
    const d =
      api?.app?.ownerDocument ??
      api?.excalidrawContainerRef?.current?.ownerDocument ??
      null;
    if (d) {
      return d;
    }
  } catch {
    // ignore
  }
  if (typeof document !== "undefined") {
    return document as unknown as Document;
  }
  return null;
};

const updateNodeCacheInScene = (
  api: ExcalidrawImperativeAPI,
  nodeId: string,
  patch: Partial<{
    label?: string;
    github?: GithubRef;
    cache?: GithubCache & { snapshotAt: string };
  }>,
): void => {
  const elements = api.getSceneElements();
  const next = elements.map((el) => {
    if (el.id !== nodeId || el.type !== "causcape-node") {
      return el;
    }
    const node = el as ExcalidrawCauscapeNodeElement;
    const baseCauscape = node.causcape as unknown as Record<string, unknown>;
    const nextCauscape: Record<string, unknown> = { ...baseCauscape };
    if (patch.label !== undefined) {
      nextCauscape.label = patch.label;
    }
    if (patch.github !== undefined) {
      nextCauscape.github = patch.github;
    }
    if (patch.cache !== undefined) {
      nextCauscape.cache = patch.cache;
    }
    return { ...node, causcape: nextCauscape } as unknown as typeof el;
  });
  api.updateScene({
    elements: next as unknown as typeof elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

// Trigger fetch after creation / refresh. Fire-and-forget but also update
// scene when resolved.
const triggerFetchForNode = (
  api: ExcalidrawImperativeAPI,
  ref: GithubRef,
  nodeId: string,
  ownerDocument: Document | null,
): void => {
  void (async () => {
    try {
      const token = getGithubToken();
      const key = githubCacheKey(ref);
      const record = await defaultGithubCacheStore.get(key);
      const etag = record?.etag;
      const result = await fetchGithub(ref, token, etag);
      const snap = withSnapshot(result.data);
      // Persist snapshotAt overlay via element — IndexedDB already has data/etag
      updateNodeCacheInScene(api, nodeId, { cache: snap });
      // Mirror stored record with snapshot? fetchGithub already stored data without snapshotAt;
      // we keep snapshot only in element.
      void ownerDocument;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[Causcape] fetchGithub failed", err);
    }
  })();
};

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

const toSnapshot = (api: ExcalidrawImperativeAPI): GraphSnapshot => {
  const elements = api.getSceneElements();
  const graph = buildGraph(elements, { includeDiagnostics: true });
  // GraphSnapshot currently is loose, but we include github/cache when present for debug
  const nodes = graph.nodes.map((n) => {
    const ce = n.element as unknown as { causcape?: { github?: GithubRef; cache?: GithubCache } };
    const github = ce.causcape?.github;
    const cache = ce.causcape?.cache;
    const base: Record<string, unknown> = {
      id: n.id,
      label: n.label,
      kind: n.kind,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    };
    if (github) {
      base.github = github;
    }
    if (cache) {
      base.cache = cache;
    }
    return base as GraphSnapshot["nodes"][number] & {
      github?: GithubRef;
      cache?: GithubCache;
    };
  });
  return {
    nodes: nodes as unknown as GraphSnapshot["nodes"],
    edges: graph.edges.map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      label: e.label,
    })),
    diagnostics: [...graph.diagnostics],
  };
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const createGraphMCPHandlers = (ctx: GraphMCPContext) => {
  const getGraph = async (): Promise<GraphSnapshot> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    return toSnapshot(api);
  };

  const validateGraph = async () => {
    const snapshot = await getGraph();
    return { diagnostics: snapshot.diagnostics };
  };

  // Legacy variable-only path used by original tools.
  const createNode = async (input: CreateNodeInput) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    // Delegate to createCauscapeNode for uniformity
    const kind = (input.kind ?? "variable") as CauscapeNodeKind;
    if (kind !== "variable") {
      throw new Error(`createNode only supports kind=variable, got ${kind}`);
    }
    if (!input.label || typeof input.label !== "string" || input.label.trim().length === 0) {
      throw new Error("createNode: label must be non-empty string");
    }
    const appState = api.getAppState();
    const elements = api.getSceneElements();
    const existingNodes = elements.filter((el) => el.type === "causcape-node");

    let x = input.x;
    let y = input.y;
    if (x == null || y == null) {
      const pos = suggestPosition(
        existingNodes.map((n) => ({
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
        })),
        {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          width: appState.width,
          height: appState.height,
          zoom: appState.zoom.value,
        },
      );
      x = pos.x;
      y = pos.y;
    }

    const node = newCauscapeNodeElement({
      label: input.label,
      kind: "variable",
      x: x as number,
      y: y as number,
    });

    const currentElements = api.getSceneElementsIncludingDeleted();
    api.updateScene({
      elements: [...currentElements, node],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    return { id: node.id, element: node };
  };

  const createNodes = async (input: { nodes: CreateNodeInput[] }) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    const appState = api.getAppState();
    const elements = api.getSceneElements();
    const existingNodes = elements.filter((el) => el.type === "causcape-node");

    const finalNodes: ReturnType<typeof newCauscapeNodeElement>[] = [];
    for (const nodeInput of input.nodes) {
      if (!nodeInput.label || typeof nodeInput.label !== "string") {
        throw new Error("createNodes: each node requires a label");
      }
      let x = nodeInput.x;
      let y = nodeInput.y;
      if (x == null || y == null) {
        const allNodes = [
          ...existingNodes.map((n) => ({
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
          })),
          ...finalNodes.map((n) => ({
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
          })),
        ];
        const pos = suggestPosition(allNodes, {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          width: appState.width,
          height: appState.height,
          zoom: appState.zoom.value,
        });
        x = pos.x;
        y = pos.y;
      }
      finalNodes.push(
        newCauscapeNodeElement({
          label: nodeInput.label,
          kind: nodeInput.kind ?? "variable",
          x: x as number,
          y: y as number,
        }),
      );
    }

    const currentElements = api.getSceneElementsIncludingDeleted();
    api.updateScene({
      elements: [...currentElements, ...finalNodes],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    return { ids: finalNodes.map((n) => n.id), elements: finalNodes };
  };

  const createCauscapeNode = async (
    input: CreateCauscapeNodeInput,
  ): Promise<{ id: string; created: boolean; element?: unknown }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    if (!input || typeof input !== "object") {
      throw new Error("createCauscapeNode: input must be an object");
    }
    const rawKind = (input.kind ?? input.github?.kind ?? "variable") as CauscapeNodeKind;
    assertValidKind(rawKind);

    const ownerDocument = getApiOwnerDocument(ctx);

    // Variable path — no github
    if (rawKind === "variable") {
      if (input.github) {
        throw new Error("createCauscapeNode: github must be absent for kind=variable");
      }
      const label = input.label?.trim();
      if (!label) {
        throw new Error("createCauscapeNode: label required for variable nodes");
      }
      const appState = api.getAppState();
      const elements = api.getSceneElements();
      const existingNodes = elements.filter((el) => el.type === "causcape-node");
      let x = input.x;
      let y = input.y;
      if (x == null || y == null) {
        const pos = suggestPosition(
          existingNodes.map((n) => ({
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
          })),
          {
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            width: appState.width,
            height: appState.height,
            zoom: appState.zoom.value,
          },
        );
        x = pos.x;
        y = pos.y;
      }
      const node = newCauscapeNodeElement({
        label,
        kind: "variable",
        x: x as number,
        y: y as number,
      });
      const all = api.getSceneElementsIncludingDeleted();
      api.updateScene({
        elements: [...all, node],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return { id: node.id, created: true, element: node };
    }

    // GitHub path
    const github = input.github;
    if (!github) {
      throw new Error(`createCauscapeNode: github is required for kind=${rawKind}`);
    }
    assertValidGithubRef(github, rawKind);

    // Idempotency: canonical url lowercased
    const existing = findGithubNodeByUrl(api.getSceneElements(), github.url);
    const incomingCache = input.cache;
    const labelOverride = input.label?.trim();

    if (existing) {
      // Update existing node if label/cache/x/y provided
      const patch: Record<string, unknown> = {};
      let needsPatch = false;
      if (labelOverride && labelOverride !== existing.causcape.label) {
        patch.label = labelOverride;
        needsPatch = true;
      }
      if (incomingCache) {
        const snap = withSnapshot(incomingCache as GithubCache);
        patch.cache = snap;
        needsPatch = true;
      }
      // x,y explicit updates are rare for idempotent call; support if provided
      if (input.x !== undefined || input.y !== undefined) {
        const nextX = input.x ?? existing.x;
        const nextY = input.y ?? existing.y;
        // mutate position directly via scene patch
        const elems = api.getSceneElements();
        const nextElems = elems.map((el) =>
          el.id === existing.id ? { ...el, x: nextX, y: nextY } : el,
        );
        api.updateScene({
          elements: nextElems as unknown as typeof elems,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        // If we also need causcape patch, apply after
        if (needsPatch) {
          updateNodeCacheInScene(api, existing.id, {
            label: patch.label as string | undefined,
            cache: patch.cache as GithubCache & { snapshotAt: string } | undefined,
          });
        }
      } else if (needsPatch) {
        updateNodeCacheInScene(api, existing.id, {
          label: patch.label as string | undefined,
          cache: patch.cache as GithubCache & { snapshotAt: string } | undefined,
        });
      }

      // If no explicit cache but element has no cache yet, trigger fetch
      const currentCauscape = (existing.causcape as unknown as { cache?: GithubCache }).cache;
      if (!incomingCache && !currentCauscape) {
        triggerFetchForNode(api, github, existing.id, ownerDocument);
      }
      return { id: existing.id, created: false, element: existing };
    }

    // Create new github node
    const appState = api.getAppState();
    const elements = api.getSceneElements();
    const existingNodes = elements.filter((el) => el.type === "causcape-node");

    let x = input.x;
    let y = input.y;
    if (x == null || y == null) {
      // Timeline-sensitive: gather existing github nodes sorted by cache.updatedAt if possible,
      // but suggestPosition fallback is correct for MVP.
      const pos = suggestPosition(
        existingNodes.map((n) => ({
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
        })),
        {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          width: appState.width,
          height: appState.height,
          zoom: appState.zoom.value,
        },
      );
      x = pos.x;
      y = pos.y;
    }

    const label = labelOverride ?? deriveLabelFromGithub(github, incomingCache as GithubCache | undefined);
    if (!label || label.trim().length === 0) {
      throw new Error("createCauscapeNode: label could not be derived");
    }
    const cacheWithSnapshot = incomingCache
      ? (withSnapshot(incomingCache as GithubCache) as unknown as ElementGithubCache & {
          snapshotAt: string;
        })
      : undefined;

    const node = newCauscapeNodeElement({
      label,
      kind: rawKind,
      github,
      cache: cacheWithSnapshot,
      x: x as number,
      y: y as number,
    });

    const currentElements = api.getSceneElementsIncludingDeleted();
    api.updateScene({
      elements: [...currentElements, node],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    // Trigger fetch to populate/update cache with snapshotAt (hybrid snapshot+ephemeral cache)
    triggerFetchForNode(api, github, node.id, ownerDocument);

    return { id: node.id, created: true, element: node };
  };

  const createCauscapeEdge = async (
    input: CreateCauscapeEdgeInput,
  ): Promise<{ id: string; element: unknown }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    if (!input || typeof input !== "object") {
      throw new Error("createCauscapeEdge: input required");
    }
    const { fromNodeId, toNodeId, label } = input as CreateCauscapeEdgeInput;
    if (typeof fromNodeId !== "string" || fromNodeId.trim().length === 0) {
      throw new Error("createCauscapeEdge: fromNodeId required");
    }
    if (typeof toNodeId !== "string" || toNodeId.trim().length === 0) {
      throw new Error("createCauscapeEdge: toNodeId required");
    }
    if (fromNodeId === toNodeId) {
      throw new Error("createCauscapeEdge: fromNodeId and toNodeId must differ");
    }
    if (label !== undefined && typeof label !== "string") {
      throw new Error("createCauscapeEdge: label must be a string");
    }

    const elements = api.getSceneElements();
    const graph = buildGraph(elements, { includeDiagnostics: false });
    const fromNode = graph.nodesById.get(fromNodeId);
    const toNode = graph.nodesById.get(toNodeId);

    if (!fromNode || !toNode) {
      throw new Error(
        `Missing node: ${!fromNode ? fromNodeId : ""} ${!toNode ? toNodeId : ""}`.trim(),
      );
    }

    const fromCx = fromNode.x + fromNode.width / 2;
    const fromCy = fromNode.y + fromNode.height / 2;
    const toCx = toNode.x + toNode.width / 2;
    const toCy = toNode.y + toNode.height / 2;

    const edge = newCauscapeEdgeElement({
      fromNodeId,
      toNodeId,
      label,
      x: Math.min(fromCx, toCx),
      y: Math.min(fromCy, toCy),
      points: [
        [fromCx - Math.min(fromCx, toCx), fromCy - Math.min(fromCy, toCy)],
        [toCx - Math.min(fromCx, toCx), toCy - Math.min(fromCy, toCy)],
      ] as unknown as ExcalidrawCauscapeEdgeElement["points"],
    });

    const currentElements = api.getSceneElementsIncludingDeleted();
    api.updateScene({
      elements: [...currentElements, edge],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    return { id: edge.id, element: edge };
  };

  const createEdge = async (input: CreateEdgeInput) => {
    // Back-compat alias to causcape edge
    return createCauscapeEdge(input as unknown as CreateCauscapeEdgeInput);
  };

  const setGithubToken = async (input: SetTokenInput): Promise<{ ok: true }> => {
    if (!input || typeof input !== "object") {
      throw new Error("setGithubToken: input must be an object");
    }
    const { token, expiresAt } = input as SetTokenInput;
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new Error("setGithubToken: token must be a non-empty string");
    }
    setMemoryToken({ token, expiresAt });
    return { ok: true as const };
  };

  const clearGithubToken = async (): Promise<{ ok: true }> => {
    clearMemoryToken();
    return { ok: true as const };
  };

  const refreshGithubNode = async (input: RefreshNodeInput): Promise<{ ok: true; id: string }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    if (!input || typeof input !== "object" || typeof input.id !== "string") {
      throw new Error("refreshGithubNode: id required");
    }
    const id = input.id;
    const elements = api.getSceneElements();
    const el = elements.find((e) => e.id === id);
    if (!el) {
      throw new Error(`Element ${id} not found`);
    }
    if (el.type !== "causcape-node") {
      throw new Error(`Element ${id} is not a causcape-node`);
    }
    const causcape = (el as ExcalidrawCauscapeNodeElement).causcape as unknown as {
      github?: GithubRef;
    };
    const ref = causcape.github;
    if (!ref) {
      throw new Error(`Node ${id} has no github ref`);
    }
    assertValidGithubRef(ref);
    const token = getGithubToken();
    const key = githubCacheKey(ref);
    const record = await defaultGithubCacheStore.get(key);
    const etag = record?.etag;
    const result = await fetchGithub(ref, token, etag);
    const snap = withSnapshot(result.data);
    updateNodeCacheInScene(api, id, { cache: snap });
    return { ok: true as const, id };
  };

  const refreshAllGithubNodes = async (): Promise<{
    ok: true;
    refreshed: number;
  }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    const elements = api.getSceneElements();
    const githubNodes = elements.filter(
      (el) =>
        el.type === "causcape-node" &&
        !!(
          el as unknown as { causcape?: { github?: unknown } }
        ).causcape?.github,
    ) as unknown as readonly ExcalidrawCauscapeNodeElement[];
    if (githubNodes.length === 0) {
      return { ok: true as const, refreshed: 0 };
    }
    const refs = githubNodes.map(
      (n) => (n.causcape as unknown as { github: GithubRef }).github,
    );
    // Validate all before fetch
    for (const r of refs) {
      assertValidGithubRef(r);
    }
    const token = getGithubToken();
    const resultMap = await batchFetchGithub(refs, token);
    let refreshed = 0;
    for (const node of githubNodes) {
      const ref = (node.causcape as unknown as { github: GithubRef }).github;
      const key = githubCacheKey(ref);
      const data = resultMap.get(key);
      if (data) {
        const snap = withSnapshot(data);
        updateNodeCacheInScene(api, node.id, { cache: snap });
        refreshed += 1;
      }
    }
    return { ok: true as const, refreshed };
  };

  const updateElement = async (input: { id: string; patch: UpdateElementPatch }) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Excalidraw API not ready");
    }
    const elements = api.getSceneElements();
    const element = elements.find((el) => el.id === input.id);
    if (!element) {
      throw new Error(`Element ${input.id} not found`);
    }

    if (element.type === "causcape-node") {
      const patch: Partial<typeof element> & { causcape?: typeof element.causcape } = {};
      if (input.patch.label !== undefined) {
        patch.causcape = {
          ...element.causcape,
          label: input.patch.label,
        };
      }
      if (input.patch.x !== undefined) {
        (patch as unknown as Record<string, unknown>).x = input.patch.x;
      }
      if (input.patch.y !== undefined) {
        (patch as unknown as Record<string, unknown>).y = input.patch.y;
      }
      const nextElements = elements.map((el) =>
        el.id === input.id ? { ...el, ...patch } : el,
      );
      api.updateScene({
        elements: nextElements as unknown as typeof elements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return { id: input.id, element: { ...element, ...patch } };
    }

    if (element.type === "causcape-edge") {
      const patch: Partial<typeof element> & { causcape?: typeof element.causcape } = {};
      if (input.patch.label !== undefined) {
        patch.causcape = {
          ...element.causcape,
          label: input.patch.label,
        };
      }
      const nextElements = elements.map((el) =>
        el.id === input.id ? { ...el, ...patch } : el,
      );
      api.updateScene({
        elements: nextElements as unknown as typeof elements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return { id: input.id, element: { ...element, ...patch } };
    }

    throw new Error(`Element ${input.id} is not a causcape node/edge`);
  };

  return {
    getGraph,
    validateGraph,
    createNode,
    createNodes,
    createEdge,
    createCauscapeNode,
    createCauscapeEdge,
    setGithubToken,
    clearGithubToken,
    refreshGithubNode,
    refreshAllGithubNodes,
    updateElement,
  };
};

export type GraphMCPHandlers = {
  getGraph: () => Promise<GraphSnapshot>;
  validateGraph: () => Promise<{ diagnostics: readonly import("@excalidraw/graph").Diagnostic[] }>;
  createNode: (input: CreateNodeInput) => Promise<{ id: string; element: unknown }>;
  createNodes: (input: { nodes: CreateNodeInput[] }) => Promise<{ ids: string[]; elements: unknown[] }>;
  createEdge: (input: CreateEdgeInput) => Promise<{ id: string; element: unknown }>;
  createCauscapeNode: (input: CreateCauscapeNodeInput) => Promise<{ id: string; created: boolean; element?: unknown }>;
  createCauscapeEdge: (input: CreateCauscapeEdgeInput) => Promise<{ id: string; element: unknown }>;
  setGithubToken: (input: SetTokenInput) => Promise<{ ok: true }>;
  clearGithubToken: () => Promise<{ ok: true }>;
  refreshGithubNode: (input: RefreshNodeInput) => Promise<{ ok: true; id: string }>;
  refreshAllGithubNodes: () => Promise<{ ok: true; refreshed: number }>;
  updateElement: (input: { id: string; patch: UpdateElementPatch }) => Promise<{ id: string; element: unknown }>;
};

export const MCP_TOOL_DEFINITIONS = CAUSCAPE_MCP_TOOLS;

/**
 * Registers tools with WebMCP if available, otherwise exposes on window for manual use.
 * WebMCP spec: `navigator.mcp.registerTool` or `window.mcp` — we probe both.
 * Uses ownerDocument derivation where possible (AGENTS.md).
 */
export const registerGraphMCP = (handlers: GraphMCPHandlers) => {
  const toolMap: Record<string, (input: unknown) => Promise<unknown>> = {
    getGraph: handlers.getGraph as (input: unknown) => Promise<unknown>,
    validateGraph: handlers.validateGraph as (input: unknown) => Promise<unknown>,
    createNode: handlers.createNode as (input: unknown) => Promise<unknown>,
    createNodes: handlers.createNodes as (input: unknown) => Promise<unknown>,
    createEdge: handlers.createEdge as (input: unknown) => Promise<unknown>,
    updateElement: handlers.updateElement as (input: unknown) => Promise<unknown>,
    // Extended Causcape GitHub tools
    createCauscapeNode:
      handlers.createCauscapeNode as (input: unknown) => Promise<unknown>,
    createCauscapeEdge:
      handlers.createCauscapeEdge as (input: unknown) => Promise<unknown>,
    getGraphSnapshot: handlers.getGraph as (input: unknown) => Promise<unknown>,
    setGithubToken: handlers.setGithubToken as (input: unknown) => Promise<unknown>,
    clearGithubToken: handlers.clearGithubToken as (input: unknown) => Promise<unknown>,
    refreshGithubNode:
      handlers.refreshGithubNode as (input: unknown) => Promise<unknown>,
    refreshAllGithubNodes:
      handlers.refreshAllGithubNodes as (input: unknown) => Promise<unknown>,
  };

  // Expose for debugging / manual agent use
  (globalThis as unknown as Record<string, unknown>).CauscapeMCP = {
    tools: CAUSCAPE_MCP_TOOLS,
    handlers: toolMap,
    call: async (name: string, input: unknown) => {
      const fn = toolMap[name];
      if (!fn) {
        throw new Error(`Unknown tool ${name}`);
      }
      return fn(input);
    },
  };

  // Attempt WebMCP auto-registration (best-effort, no hard dependency)
  const maybeMCP = (globalThis as unknown as Record<string, unknown>).mcp as
    | { registerTool?: (def: unknown, handler: unknown) => void }
    | undefined;

  const maybeNavigatorMCP = (
    globalThis as unknown as { navigator?: Record<string, unknown> }
  ).navigator?.mcp as
    | { registerTool?: (def: unknown, handler: unknown) => void }
    | undefined;

  const mcp = maybeMCP ?? maybeNavigatorMCP;
  if (mcp?.registerTool) {
    for (const tool of CAUSCAPE_MCP_TOOLS) {
      const handler = toolMap[tool.name];
      if (handler) {
        try {
          mcp.registerTool(tool, handler);
        } catch {
          // ignore per-tool registration failures
        }
      }
    }
    // Register extended tools that may not be in static CAUSCAPE_MCP_TOOLS yet
    const extraDefs: Array<{ name: string; description: string; inputSchema: unknown }> = [
      {
        name: "createCauscapeNode",
        description:
          "Create a Causcape node (variable or github-issue/pr/commit/repo). Idempotent by github.url lowercased.",
        inputSchema: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["variable", "github-issue", "github-pr", "github-commit", "github-repo"],
            },
            github: { type: "object" },
            label: { type: "string" },
            cache: { type: "object" },
            x: { type: "number" },
            y: { type: "number" },
          },
        },
      },
      {
        name: "createCauscapeEdge",
        description: "Create a directed edge between causcape nodes with optional freeform label.",
        inputSchema: {
          type: "object",
          properties: {
            fromNodeId: { type: "string" },
            toNodeId: { type: "string" },
            label: { type: "string" },
          },
          required: ["fromNodeId", "toNodeId"],
        },
      },
      {
        name: "setGithubToken",
        description: "Set ephemeral GitHub token (memory-only, never persisted).",
        inputSchema: {
          type: "object",
          properties: {
            token: { type: "string" },
            expiresAt: { type: ["number", "string"] },
          },
          required: ["token"],
        },
      },
      {
        name: "clearGithubToken",
        description: "Clear ephemeral GitHub token from memory.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "refreshGithubNode",
        description: "Refresh a single GitHub node via API (ETag aware) and update element cache.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "refreshAllGithubNodes",
        description: "Batch refresh all GitHub nodes (REST batch, deduped).",
        inputSchema: { type: "object", properties: {} },
      },
    ];
    for (const def of extraDefs) {
      const handler = toolMap[def.name];
      if (handler) {
        try {
          mcp.registerTool(def, handler);
        } catch {
          // ignore
        }
      }
    }
  }

  return toolMap;
};

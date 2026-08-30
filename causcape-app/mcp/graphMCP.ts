import {
  CaptureUpdateAction,
  getCauscapeNodeSize,
  newElementWith,
  normalizeCauscapeNodeData,
} from "@causcape/element";
import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@causcape/element";

import {
  buildGraph,
  ARCHITECTURE_REFERENCE_TYPES,
  ARCHITECTURE_RELATIONSHIP_TYPES,
  CAUSCAPE_MCP_TOOLS,
  createGraphProvenance,
  isArchitectureNodeKind,
  layoutCauscapeGraph,
  routeCauscapeEdge,
  suggestPosition,
} from "@causcape/graph";

import type {
  CauscapeEdgeElement,
  CauscapeNodeElement,
  CauscapeElement,
  GithubCache as ElementGithubCache,
  CauscapeReference as ElementCauscapeReference,
  NonDeleted,
} from "@causcape/element/types";
import type { CauscapeImperativeAPI } from "@causcape/causcape/types";
import type {
  SearchNodesInput,
  AutoLayoutInput,
  CreateEdgeInput,
  CreateNodeInput,
  ArchitectureNodeFields,
  ArchitectureRelationshipType,
  CauscapeReference,
  CauscapeNodeKind,
  GraphSnapshot,
  GraphQualityMetrics,
  NodeSettings,
  UpdateElementPatch,
} from "@causcape/graph";

import { defaultGithubCacheStore } from "../github/cache";
import { batchFetchGithub, fetchGithub } from "../github/client";

import { githubCacheKey } from "../github/types";

import {
  clearGithubToken as clearMemoryToken,
  getGithubToken,
  setGithubToken as setMemoryToken,
} from "../github/tokenStore";

import type { GithubCache, GithubRef } from "../github/types";

// ---------------------------------------------------------------------------
// Types for extended WebMCP surface
// ---------------------------------------------------------------------------

export type GraphMCPContext = {
  getApi: () => CauscapeImperativeAPI | null;
  getOwnerDocument?: () => Document | null;
};

type CreateCauscapeNodeInput = {
  kind?: CauscapeNodeKind;
  github?: GithubRef;
  label?: string;
  cache?: GithubCache;
  x?: number;
  y?: number;
} & ArchitectureNodeFields;

type CreateCauscapeEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  relationship?: ArchitectureRelationshipType;
};

type SetTokenInput = {
  token: string;
  expiresAt?: number | string;
};

type RefreshNodeInput = {
  id: string;
};

type SearchNodeResult = {
  id: string;
  label: string;
  kind: CauscapeNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  github?: GithubRef;
  cache?: GithubCache;
  environment?: string;
  health?: CreateNodeInput["health"];
  description?: string;
  technologies?: readonly string[];
  references?: readonly CauscapeReference[];
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
  "service",
  "datastore",
  "queue",
  "external-system",
  "user",
]);

const VALID_HEALTH = new Set(["healthy", "degraded", "failed", "unknown"]);

const assertValidArchitectureFields = (
  input: Pick<
    CreateCauscapeNodeInput,
    "environment" | "health" | "description" | "technologies" | "references"
  >,
): void => {
  if (
    input.environment !== undefined &&
    (typeof input.environment !== "string" ||
      input.environment.trim().length === 0)
  ) {
    throw new Error("architecture environment must be a non-empty string");
  }
  if (input.health !== undefined && !VALID_HEALTH.has(input.health)) {
    throw new Error(`Invalid architecture health: ${input.health}`);
  }
  if (
    input.description !== undefined &&
    typeof input.description !== "string"
  ) {
    throw new Error("architecture description must be a string");
  }
  if (input.technologies !== undefined) {
    if (
      !Array.isArray(input.technologies) ||
      input.technologies.some(
        (technology) =>
          typeof technology !== "string" || technology.trim().length === 0,
      )
    ) {
      throw new Error("architecture technologies must be non-empty strings");
    }
  }
  if (input.references !== undefined) {
    if (!Array.isArray(input.references)) {
      throw new Error("architecture references must be an array");
    }
    input.references.forEach((reference, index) => {
      if (
        !reference ||
        !ARCHITECTURE_REFERENCE_TYPES.includes(reference.type) ||
        typeof reference.url !== "string" ||
        reference.url.trim().length === 0
      ) {
        throw new Error(`Invalid architecture reference at index ${index}`);
      }
      try {
        const url = new URL(reference.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("unsupported protocol");
        }
      } catch {
        throw new Error(`Invalid architecture reference URL at index ${index}`);
      }
      if (
        reference.label !== undefined &&
        typeof reference.label !== "string"
      ) {
        throw new Error(
          `Invalid architecture reference label at index ${index}`,
        );
      }
    });
  }
};

const assertValidRelationship = (
  relationship: ArchitectureRelationshipType | undefined,
): void => {
  if (
    relationship !== undefined &&
    !ARCHITECTURE_RELATIONSHIP_TYPES.includes(relationship)
  ) {
    throw new Error(`Invalid architecture relationship: ${relationship}`);
  }
};

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

const assertValidGithubRef = (
  ref: GithubRef,
  kind?: CauscapeNodeKind,
): void => {
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
    const num = (
      ref as Extract<GithubRef, { kind: "github-issue" | "github-pr" }>
    ).number;
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

const assertValidNodeSettings = (settings: NodeSettings): void => {
  if (!settings || typeof settings !== "object") {
    throw new Error("updateNodeSettings: settings must be an object");
  }

  const allowedKeys = new Set<keyof NodeSettings>([
    "backgroundColor",
    "strokeColor",
    "fillStyle",
    "strokeWidth",
    "strokeStyle",
    "roughness",
    "opacity",
    "roundness",
    "locked",
  ]);
  for (const key of Object.keys(settings)) {
    if (!allowedKeys.has(key as keyof NodeSettings)) {
      throw new Error(`updateNodeSettings: unsupported setting ${key}`);
    }
  }
  if (Object.keys(settings).length === 0) {
    throw new Error("updateNodeSettings: settings cannot be empty");
  }

  for (const key of ["backgroundColor", "strokeColor"] as const) {
    const value = settings[key];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      throw new Error(`updateNodeSettings: ${key} must be a non-empty string`);
    }
  }
  if (
    settings.fillStyle !== undefined &&
    !["hachure", "cross-hatch", "solid", "zigzag"].includes(settings.fillStyle)
  ) {
    throw new Error(
      `updateNodeSettings: invalid fillStyle ${settings.fillStyle}`,
    );
  }
  if (
    settings.strokeStyle !== undefined &&
    !["solid", "dashed", "dotted"].includes(settings.strokeStyle)
  ) {
    throw new Error(
      `updateNodeSettings: invalid strokeStyle ${settings.strokeStyle}`,
    );
  }
  for (const key of ["strokeWidth", "roughness"] as const) {
    const value = settings[key];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(
        `updateNodeSettings: ${key} must be a non-negative number`,
      );
    }
  }
  if (
    settings.opacity !== undefined &&
    (!Number.isFinite(settings.opacity) ||
      settings.opacity < 0 ||
      settings.opacity > 100)
  ) {
    throw new Error("updateNodeSettings: opacity must be between 0 and 100");
  }
  if (settings.roundness !== undefined && settings.roundness !== null) {
    if (
      typeof settings.roundness !== "object" ||
      !Number.isFinite(settings.roundness.type)
    ) {
      throw new Error(
        "updateNodeSettings: roundness must be null or an object with a numeric type",
      );
    }
    if (
      settings.roundness.value !== undefined &&
      (!Number.isFinite(settings.roundness.value) ||
        settings.roundness.value < 0)
    ) {
      throw new Error(
        "updateNodeSettings: roundness.value must be a non-negative number",
      );
    }
  }
  if (settings.locked !== undefined && typeof settings.locked !== "boolean") {
    throw new Error("updateNodeSettings: locked must be a boolean");
  }
};

// ---------------------------------------------------------------------------
// Helpers: element ↔ github mapping
// ---------------------------------------------------------------------------

const canonicalUrl = (url: string): string => url.trim().toLowerCase();

const findGithubNodeByUrl = (
  elements: readonly import("@causcape/element/types").CauscapeElement[],
  url: string,
): CauscapeNodeElement | undefined => {
  const target = canonicalUrl(url);
  for (const el of elements) {
    if (el.type !== "causcape-node") {
      continue;
    }
    const ce = el as CauscapeNodeElement;
    const g = (ce.causcape as unknown as { github?: GithubRef })?.github;
    if (g?.url && canonicalUrl(g.url) === target) {
      return ce;
    }
  }
  return undefined;
};

const deriveLabelFromGithub = (ref: GithubRef, cache?: GithubCache): string => {
  const isUsable = (value: unknown): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value !== "Not found";
  if (cache) {
    if ("title" in cache && isUsable((cache as { title?: string }).title)) {
      return (cache as { title: string }).title as string;
    }
    if (
      "message" in cache &&
      isUsable((cache as { message?: string }).message)
    ) {
      const msg = (cache as { message: string }).message;
      return msg.split("\n")[0]?.slice(0, 80) ?? `${ref.owner}/${ref.repo}`;
    }
    if ("description" in cache && isUsable(cache.description)) {
      return `${ref.owner}/${ref.repo}`;
    }
  }
  if (ref.kind === "github-issue" || ref.kind === "github-pr") {
    return `${ref.owner}/${ref.repo}#${(ref as { number: number }).number}`;
  }
  if (ref.kind === "github-commit") {
    return `${ref.owner}/${ref.repo}@${(ref as { sha: string }).sha.slice(
      0,
      7,
    )}`;
  }
  return `${ref.owner}/${ref.repo}`;
};

const withSnapshot = (
  data: GithubCache,
): GithubCache & { snapshotAt: string } =>
  ({ ...data, snapshotAt: new Date().toISOString() } as GithubCache & {
    snapshotAt: string;
  });

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
      causcapeContainerRef?: {
        current?: { ownerDocument?: Document } | null;
      };
    } | null;
    const d =
      api?.app?.ownerDocument ??
      api?.causcapeContainerRef?.current?.ownerDocument ??
      null;
    if (d) {
      return d;
    }
  } catch {
    // ignore
  }
  return null;
};

const getSearchableNodeValues = (node: SearchNodeResult): readonly string[] => {
  const values = [node.id, node.label, node.kind];
  if (node.github) {
    values.push(
      node.github.url,
      node.github.owner,
      node.github.repo,
      node.github.kind,
    );
    if ("number" in node.github) {
      values.push(String(node.github.number));
    }
    if ("sha" in node.github) {
      values.push(node.github.sha);
    }
  }
  if (node.cache) {
    values.push(...Object.values(node.cache).map((value) => String(value)));
  }
  for (const value of [
    node.environment,
    node.health,
    node.description,
    ...(node.technologies ?? []),
    ...(node.references ?? []).flatMap((reference) => [
      reference.type,
      reference.url,
      reference.label ?? "",
    ]),
  ]) {
    if (value) {
      values.push(value);
    }
  }
  return values.map((value) => value.toLowerCase());
};

const createGraphNodeElement = (
  input: CreateCauscapeNodeInput,
  x: number,
  y: number,
): NonDeleted<CauscapeNodeElement> => {
  const kind = input.kind ?? "variable";
  return newCauscapeNodeElement({
    label: input.label as string,
    kind,
    github: input.github,
    cache: input.cache as
      | (ElementGithubCache & { snapshotAt: string })
      | undefined,
    environment: input.environment,
    health: input.health,
    description: input.description,
    technologies: input.technologies,
    references: input.references as
      | readonly ElementCauscapeReference[]
      | undefined,
    x,
    y,
  });
};

const graphEntities = (
  elements: readonly CauscapeElement[],
): readonly { id: string; value: CauscapeElement }[] =>
  elements
    .filter(
      (element) =>
        !element.isDeleted &&
        (element.type === "causcape-node" || element.type === "causcape-edge"),
    )
    .map((element) => ({ id: element.id, value: element }));

const rerouteCauscapeEdges = (
  elements: readonly CauscapeElement[],
): CauscapeElement[] => {
  const graph = buildGraph(elements, { includeDiagnostics: false });
  if (graph.nodes.length === 0 || graph.edges.length === 0) {
    return [...elements];
  }
  const result = layoutCauscapeGraph(graph, {
    pinnedNodeIds: new Set(graph.nodes.map((node) => node.id)),
    respectLocked: false,
    maxIterations: 1,
  });
  return elements.map((element) => {
    if (element.type !== "causcape-edge") {
      return element;
    }
    const geometry = result.edges.get(element.id);
    return geometry
      ? newElementWith(element, {
          ...geometry,
          points: geometry.points as unknown as typeof element.points,
        } as never)
      : element;
  });
};

const restoreGraphEntities = (
  elements: readonly CauscapeElement[],
  restored: readonly { id: string; value: CauscapeElement }[],
  touchedIds: readonly string[],
): CauscapeElement[] => {
  const restoredById = new Map(
    restored.map((entity) => [entity.id, entity.value]),
  );
  const touched = new Set(touchedIds);
  const seen = new Set<string>();
  const next: CauscapeElement[] = [];
  for (const element of elements) {
    if (!touched.has(element.id)) {
      next.push(element);
      continue;
    }
    seen.add(element.id);
    const replacement = restoredById.get(element.id);
    if (replacement) {
      next.push(replacement);
    }
  }
  for (const entity of restored) {
    if (!seen.has(entity.id) && touched.has(entity.id)) {
      next.push(entity.value);
    }
  }
  return next;
};

const updateNodeCacheInScene = (
  api: CauscapeImperativeAPI,
  nodeId: string,
  patch: Partial<{
    label?: string;
    github?: GithubRef;
    cache?: GithubCache & { snapshotAt: string };
  }>,
  onSceneUpdate?: (
    before: readonly CauscapeElement[],
    after: readonly CauscapeElement[],
  ) => void,
): void => {
  const elements = api.getSceneElements();
  const next = elements.map((el) => {
    if (el.id !== nodeId || el.type !== "causcape-node") {
      return el;
    }
    const node = el as CauscapeNodeElement;
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
  onSceneUpdate?.(elements, next);
};

// Trigger fetch after creation / refresh. Fire-and-forget but also update
// scene when resolved.
const triggerFetchForNode = (
  api: CauscapeImperativeAPI,
  ref: GithubRef,
  nodeId: string,
  ownerDocument: Document | null,
  onSceneUpdate?: (
    before: readonly CauscapeElement[],
    after: readonly CauscapeElement[],
  ) => void,
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
      updateNodeCacheInScene(api, nodeId, { cache: snap }, onSceneUpdate);
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

const toSnapshot = (api: CauscapeImperativeAPI): GraphSnapshot => {
  const elements = api.getSceneElements();
  const graph = buildGraph(elements, { includeDiagnostics: true });
  // GraphSnapshot currently is loose, but we include github/cache when present for debug
  const nodes = graph.nodes.map((n) => {
    const ce = n.element as unknown as {
      causcape?: { github?: GithubRef; cache?: GithubCache };
    };
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
    if (n.architecture) {
      Object.assign(base, n.architecture);
    }
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
      relationship: e.relationship,
    })),
    diagnostics: [...graph.diagnostics],
  };
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const createGraphMCPHandlers = (ctx: GraphMCPContext) => {
  const provenance = createGraphProvenance<CauscapeElement>();

  const recordSceneUpdate = (
    before: readonly CauscapeElement[],
    after: readonly CauscapeElement[],
  ): void => {
    const mutation = provenance.startMutation(graphEntities(before));
    provenance.commitMutation(mutation, graphEntities(after));
  };

  const applySceneUpdate = (
    api: CauscapeImperativeAPI,
    elements: readonly CauscapeElement[],
  ): void => {
    const before = api.getSceneElementsIncludingDeleted();
    const mutation = provenance.startMutation(graphEntities(before));
    api.updateScene({
      elements: elements as CauscapeElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    provenance.commitMutation(
      mutation,
      graphEntities(api.getSceneElementsIncludingDeleted()),
    );
  };

  const beginAgentSession = async (input?: { sessionId?: string }) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    return provenance.beginSession(
      graphEntities(api.getSceneElementsIncludingDeleted()),
      input?.sessionId,
    );
  };

  const getAgentSession = async () => provenance.getState();

  const rollbackAgentChanges = async (input?: { sessionId?: string }) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const current = api.getSceneElementsIncludingDeleted();
    const result = provenance.rollback(
      graphEntities(current),
      input?.sessionId,
    );
    if (result.rolledBack) {
      api.updateScene({
        elements: restoreGraphEntities(
          current,
          result.entities,
          result.touchedEntityIds,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    }
    return {
      rolledBack: result.rolledBack,
      reason: result.reason,
      sessionId: result.sessionId,
      revision: result.revision,
      segmentId: result.segmentId,
      touchedEntityIds: result.touchedEntityIds,
      restoredEntityIds: result.restoredEntityIds,
      removedEntityIds: result.removedEntityIds,
    };
  };

  const getGraph = async (): Promise<GraphSnapshot> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    return toSnapshot(api);
  };

  const validateGraph = async () => {
    const snapshot = await getGraph();
    return { diagnostics: snapshot.diagnostics };
  };

  const resetCanvas = async (): Promise<{ ok: true; cleared: number }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const cleared = api.getSceneElementsIncludingDeleted().length;
    api.resetScene({ resetLoadingState: true });
    return { ok: true, cleared };
  };

  const searchNodes = async (
    input: SearchNodesInput,
  ): Promise<{ query: string; total: number; matches: SearchNodeResult[] }> => {
    const query = input?.query?.trim();
    if (!query) {
      throw new Error("searchNodes: query must be a non-empty string");
    }
    if (input.kind !== undefined) {
      assertValidKind(input.kind);
    }
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error(
        "searchNodes: limit must be an integer between 1 and 200",
      );
    }

    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const graph = buildGraph(api.getSceneElements(), {
      includeDiagnostics: false,
    });
    const needle = query.toLowerCase();
    const ranked = graph.nodes
      .filter((node) => !input.kind || node.kind === input.kind)
      .map((node, index) => {
        const result: SearchNodeResult = {
          id: node.id,
          label: node.label,
          kind: node.kind as CauscapeNodeKind,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          github: node.github as GithubRef | undefined,
          cache: node.cache as GithubCache | undefined,
          ...node.architecture,
        };
        const values = getSearchableNodeValues(result);
        const rank = values.some((value) => value === needle)
          ? 0
          : values.some((value) => value.startsWith(needle))
          ? 1
          : values.some((value) => value.includes(needle))
          ? 2
          : 3;
        return { result, rank, index };
      })
      .filter(({ rank }) => rank < 3)
      .sort((a, b) => a.rank - b.rank || a.index - b.index);

    return {
      query,
      total: ranked.length,
      matches: ranked.slice(0, limit).map(({ result }) => result),
    };
  };

  // Legacy variable-only path used by original tools.
  const createNode = async (input: CreateNodeInput) => {
    if (
      !input.label ||
      typeof input.label !== "string" ||
      input.label.trim().length === 0
    ) {
      throw new Error("createNode: label must be non-empty string");
    }
    const result = await createCauscapeNode({
      ...input,
      kind: input.kind ?? "variable",
    });
    return { id: result.id, element: result.element };
  };

  const createNodes = async (input: { nodes: CreateNodeInput[] }) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const appState = api.getAppState();
    const elements = api.getSceneElements();
    const existingNodes = elements.filter((el) => el.type === "causcape-node");

    const finalNodes: ReturnType<typeof newCauscapeNodeElement>[] = [];
    for (const nodeInput of input.nodes) {
      if (!nodeInput.label || typeof nodeInput.label !== "string") {
        throw new Error("createNodes: each node requires a label");
      }
      const kind = nodeInput.kind ?? "variable";
      if (kind !== "variable" && !isArchitectureNodeKind(kind)) {
        throw new Error(`createNodes does not support kind=${kind}`);
      }
      assertValidArchitectureFields(nodeInput);
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
        createGraphNodeElement(
          { ...nodeInput, kind },
          x as number,
          y as number,
        ),
      );
    }

    const currentElements = api.getSceneElementsIncludingDeleted();
    applySceneUpdate(api, [...currentElements, ...finalNodes]);

    return { ids: finalNodes.map((n) => n.id), elements: finalNodes };
  };

  const createCauscapeNode = async (
    input: CreateCauscapeNodeInput,
  ): Promise<{ id: string; created: boolean; element?: unknown }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    if (!input || typeof input !== "object") {
      throw new Error("createCauscapeNode: input must be an object");
    }
    const rawKind = (input.kind ??
      input.github?.kind ??
      "variable") as CauscapeNodeKind;
    assertValidKind(rawKind);
    assertValidArchitectureFields(input);

    const ownerDocument = getApiOwnerDocument(ctx);

    if (isArchitectureNodeKind(rawKind)) {
      if (input.github) {
        throw new Error(
          `createCauscapeNode: github must be absent for kind=${rawKind}`,
        );
      }
      const label = input.label?.trim();
      if (!label) {
        throw new Error(
          `createCauscapeNode: label required for kind=${rawKind}`,
        );
      }
      const appState = api.getAppState();
      const elements = api.getSceneElements();
      const existingNodes = elements.filter(
        (el) => el.type === "causcape-node",
      );
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
      const node = createGraphNodeElement(
        { ...input, kind: rawKind, label },
        x as number,
        y as number,
      );
      const currentElements = api.getSceneElementsIncludingDeleted();
      applySceneUpdate(api, [...currentElements, node]);
      return { id: node.id, created: true, element: node };
    }

    // Variable path — no github
    if (rawKind === "variable") {
      if (input.github) {
        throw new Error(
          "createCauscapeNode: github must be absent for kind=variable",
        );
      }
      const label = input.label?.trim();
      if (!label) {
        throw new Error(
          "createCauscapeNode: label required for variable nodes",
        );
      }
      const appState = api.getAppState();
      const elements = api.getSceneElements();
      const existingNodes = elements.filter(
        (el) => el.type === "causcape-node",
      );
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
      const node = createGraphNodeElement(
        { label, kind: "variable" },
        x as number,
        y as number,
      );
      const all = api.getSceneElementsIncludingDeleted();
      applySceneUpdate(api, [...all, node]);
      return { id: node.id, created: true, element: node };
    }

    // GitHub path
    const github = input.github;
    if (!github) {
      throw new Error(
        `createCauscapeNode: github is required for kind=${rawKind}`,
      );
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
        applySceneUpdate(api, nextElems as unknown as CauscapeElement[]);
        // If we also need causcape patch, apply after
        if (needsPatch) {
          updateNodeCacheInScene(
            api,
            existing.id,
            {
              label: patch.label as string | undefined,
              cache: patch.cache as
                | (GithubCache & { snapshotAt: string })
                | undefined,
            },
            recordSceneUpdate,
          );
        }
      } else if (needsPatch) {
        updateNodeCacheInScene(
          api,
          existing.id,
          {
            label: patch.label as string | undefined,
            cache: patch.cache as
              | (GithubCache & { snapshotAt: string })
              | undefined,
          },
          recordSceneUpdate,
        );
      }

      // If no explicit cache but element has no cache yet, trigger fetch
      const currentCauscape = (
        existing.causcape as unknown as { cache?: GithubCache }
      ).cache;
      if (!incomingCache && !currentCauscape) {
        triggerFetchForNode(
          api,
          github,
          existing.id,
          ownerDocument,
          recordSceneUpdate,
        );
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

    const label =
      labelOverride ??
      deriveLabelFromGithub(github, incomingCache as GithubCache | undefined);
    if (!label || label.trim().length === 0) {
      throw new Error("createCauscapeNode: label could not be derived");
    }
    const cacheWithSnapshot = incomingCache
      ? (withSnapshot(
          incomingCache as GithubCache,
        ) as unknown as ElementGithubCache & {
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
    applySceneUpdate(api, [...currentElements, node]);

    // Trigger fetch to populate/update cache with snapshotAt (hybrid snapshot+ephemeral cache)
    triggerFetchForNode(api, github, node.id, ownerDocument, recordSceneUpdate);

    return { id: node.id, created: true, element: node };
  };

  const createCauscapeEdge = async (
    input: CreateCauscapeEdgeInput,
  ): Promise<{ id: string; element: unknown }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    if (!input || typeof input !== "object") {
      throw new Error("createCauscapeEdge: input required");
    }
    const { fromNodeId, toNodeId, label, relationship } =
      input as CreateCauscapeEdgeInput;
    if (typeof fromNodeId !== "string" || fromNodeId.trim().length === 0) {
      throw new Error("createCauscapeEdge: fromNodeId required");
    }
    if (typeof toNodeId !== "string" || toNodeId.trim().length === 0) {
      throw new Error("createCauscapeEdge: toNodeId required");
    }
    if (fromNodeId === toNodeId) {
      throw new Error(
        "createCauscapeEdge: fromNodeId and toNodeId must differ",
      );
    }
    if (label !== undefined && typeof label !== "string") {
      throw new Error("createCauscapeEdge: label must be a string");
    }
    assertValidRelationship(relationship);

    const elements = api.getSceneElements();
    const graph = buildGraph(elements, { includeDiagnostics: false });
    const fromNode = graph.nodesById.get(fromNodeId);
    const toNode = graph.nodesById.get(toNodeId);

    if (!fromNode || !toNode) {
      throw new Error(
        `Missing node: ${!fromNode ? fromNodeId : ""} ${
          !toNode ? toNodeId : ""
        }`.trim(),
      );
    }

    const geometry = routeCauscapeEdge(fromNode, toNode);

    const baseEdge = newCauscapeEdgeElement({
      fromNodeId,
      toNodeId,
      label,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      points: geometry.points as unknown as CauscapeEdgeElement["points"],
    });
    const edge = (
      relationship === undefined
        ? baseEdge
        : {
            ...baseEdge,
            causcape: { ...baseEdge.causcape, relationship },
          }
    ) as CauscapeEdgeElement;

    const currentElements = api.getSceneElementsIncludingDeleted();
    applySceneUpdate(api, [...currentElements, edge]);

    return { id: edge.id, element: edge };
  };

  const createEdge = async (input: CreateEdgeInput) => {
    // Back-compat alias to causcape edge
    return createCauscapeEdge(input as unknown as CreateCauscapeEdgeInput);
  };

  const setGithubToken = async (
    input: SetTokenInput,
  ): Promise<{ ok: true }> => {
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

  const refreshGithubNode = async (
    input: RefreshNodeInput,
  ): Promise<{ ok: true; id: string }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
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
    const causcape = (el as CauscapeNodeElement).causcape as unknown as {
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
    updateNodeCacheInScene(api, id, { cache: snap }, recordSceneUpdate);
    return { ok: true as const, id };
  };

  const refreshAllGithubNodes = async (): Promise<{
    ok: true;
    refreshed: number;
  }> => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const elements = api.getSceneElements();
    const githubNodes = elements.filter(
      (el) =>
        el.type === "causcape-node" &&
        !!(el as unknown as { causcape?: { github?: unknown } }).causcape
          ?.github,
    ) as unknown as readonly CauscapeNodeElement[];
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
        updateNodeCacheInScene(
          api,
          node.id,
          { cache: snap },
          recordSceneUpdate,
        );
        refreshed += 1;
      }
    }
    return { ok: true as const, refreshed };
  };

  const updateElement = async (input: {
    id: string;
    patch: UpdateElementPatch;
  }) => {
    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const elements = api.getSceneElements();
    const element = elements.find((el) => el.id === input.id);
    if (!element) {
      throw new Error(`Element ${input.id} not found`);
    }
    if (element.type === "causcape-node") {
      assertValidArchitectureFields(input.patch);
    }

    if (element.type === "causcape-node") {
      const nextCauscape = {
        ...(element.causcape as Record<string, unknown>),
      };
      let dataChanged = false;
      if (input.patch.label !== undefined) {
        nextCauscape.label = input.patch.label;
        dataChanged = true;
      }
      if (input.patch.kind !== undefined) {
        assertValidKind(input.patch.kind);
        nextCauscape.kind = input.patch.kind;
        dataChanged = true;
      }
      for (const key of [
        "environment",
        "health",
        "description",
        "technologies",
        "references",
      ] as const) {
        if (input.patch[key] !== undefined) {
          nextCauscape[key] = input.patch[key];
          dataChanged = true;
        }
      }
      const patch: Partial<typeof element> & {
        causcape?: typeof element.causcape;
      } = dataChanged
        ? {
            causcape: normalizeCauscapeNodeData(nextCauscape),
          }
        : {};
      if (input.patch.x !== undefined) {
        (patch as unknown as Record<string, unknown>).x = input.patch.x;
      }
      if (input.patch.y !== undefined) {
        (patch as unknown as Record<string, unknown>).y = input.patch.y;
      }
      if (dataChanged) {
        const size = getCauscapeNodeSize(patch.causcape);
        (patch as unknown as Record<string, unknown>).width = size.width;
        (patch as unknown as Record<string, unknown>).height = size.height;
      }
      const nextElements = elements.map((el) =>
        el.id === input.id ? { ...el, ...patch } : el,
      );
      const nextSceneElements =
        dataChanged ||
        input.patch.x !== undefined ||
        input.patch.y !== undefined
          ? rerouteCauscapeEdges(
              nextElements as unknown as readonly CauscapeElement[],
            )
          : nextElements;
      applySceneUpdate(
        api,
        nextSceneElements as unknown as readonly CauscapeElement[],
      );
      return { id: input.id, element: { ...element, ...patch } };
    }

    if (element.type === "causcape-edge") {
      const patch: Partial<typeof element> & {
        causcape?: typeof element.causcape;
      } = {};
      if (
        input.patch.label !== undefined ||
        input.patch.relationship !== undefined
      ) {
        patch.causcape = {
          ...element.causcape,
          ...(input.patch.label !== undefined
            ? { label: input.patch.label }
            : {}),
          ...(input.patch.relationship !== undefined
            ? { relationship: input.patch.relationship }
            : {}),
        };
        assertValidRelationship(input.patch.relationship);
      }
      const nextElements = elements.map((el) =>
        el.id === input.id ? { ...el, ...patch } : el,
      );
      applySceneUpdate(
        api,
        nextElements as unknown as readonly CauscapeElement[],
      );
      return { id: input.id, element: { ...element, ...patch } };
    }

    throw new Error(`Element ${input.id} is not a causcape node/edge`);
  };

  const updateNodeSettings = async (input: {
    id: string;
    settings: NodeSettings;
  }) => {
    if (!input || typeof input.id !== "string" || !input.id.trim()) {
      throw new Error("updateNodeSettings: id must be a non-empty string");
    }
    assertValidNodeSettings(input.settings);

    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const elements = api.getSceneElements();
    const element = elements.find((el) => el.id === input.id);
    if (!element) {
      throw new Error(`Element ${input.id} not found`);
    }
    if (element.type !== "causcape-node") {
      throw new Error(`Element ${input.id} is not a causcape-node`);
    }

    const nextElement = newElementWith(
      element as CauscapeNodeElement,
      input.settings as never,
    );
    if (nextElement === element) {
      return {
        id: input.id,
        changed: false,
        settings: input.settings,
        element,
      };
    }
    const nextElements = elements.map((el) =>
      el.id === input.id ? nextElement : el,
    );
    api.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    return {
      id: input.id,
      changed: true,
      settings: input.settings,
      element: nextElement,
    };
  };

  const autoLayout = async (input: AutoLayoutInput = {}) => {
    for (const key of ["originX", "originY", "gapX", "gapY"] as const) {
      if (input[key] !== undefined && !Number.isFinite(input[key])) {
        throw new Error(`autoLayout: ${key} must be a finite number`);
      }
    }
    for (const key of ["gapX", "gapY"] as const) {
      if (input[key] !== undefined && input[key] < 0) {
        throw new Error(`autoLayout: ${key} must be non-negative`);
      }
    }

    const api = ctx.getApi();
    if (!api) {
      throw new Error("Causcape API not ready");
    }
    const elements = api.getSceneElements();
    const graph = buildGraph(elements, { includeDiagnostics: true });
    const result = layoutCauscapeGraph(graph, input);
    const movedNodeIds: string[] = [];
    const routedEdgeIds: string[] = [];
    const nextElements = elements.map((element) => {
      if (element.type === "causcape-node") {
        const position = result.positions.get(element.id);
        if (
          !position ||
          (position.x === element.x && position.y === element.y)
        ) {
          return element;
        }
        movedNodeIds.push(element.id);
        return newElementWith(element, position);
      }
      if (element.type === "causcape-edge") {
        const geometry = result.edges.get(element.id);
        if (!geometry) {
          return element;
        }
        routedEdgeIds.push(element.id);
        return newElementWith(element, {
          ...geometry,
          points: geometry.points as unknown as typeof element.points,
        } as never);
      }
      return element;
    });
    if (movedNodeIds.length > 0 || routedEdgeIds.length > 0) {
      api.updateScene({
        elements: nextElements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    }
    return {
      movedNodeIds,
      routedEdgeIds,
      metrics: result.metrics,
      diagnostics: result.after.diagnostics,
      before: result.before,
      after: result.after,
      iterations: result.iterations,
      converged: result.converged,
      changedNodeIds: result.changedNodeIds,
    };
  };

  return {
    getGraph,
    validateGraph,
    resetCanvas,
    searchNodes,
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
    updateNodeSettings,
    autoLayout,
    beginAgentSession,
    getAgentSession,
    rollbackAgentChanges,
  };
};

export type GraphMCPHandlers = {
  getGraph: () => Promise<GraphSnapshot>;
  validateGraph: () => Promise<{
    diagnostics: readonly import("@causcape/graph").Diagnostic[];
  }>;
  resetCanvas: () => Promise<{ ok: true; cleared: number }>;
  searchNodes: (
    input: SearchNodesInput,
  ) => Promise<{ query: string; total: number; matches: SearchNodeResult[] }>;
  createNode: (
    input: CreateNodeInput,
  ) => Promise<{ id: string; element: unknown }>;
  createNodes: (input: {
    nodes: CreateNodeInput[];
  }) => Promise<{ ids: string[]; elements: unknown[] }>;
  createEdge: (
    input: CreateEdgeInput,
  ) => Promise<{ id: string; element: unknown }>;
  createCauscapeNode: (
    input: CreateCauscapeNodeInput,
  ) => Promise<{ id: string; created: boolean; element?: unknown }>;
  createCauscapeEdge: (
    input: CreateCauscapeEdgeInput,
  ) => Promise<{ id: string; element: unknown }>;
  setGithubToken: (input: SetTokenInput) => Promise<{ ok: true }>;
  clearGithubToken: () => Promise<{ ok: true }>;
  refreshGithubNode: (
    input: RefreshNodeInput,
  ) => Promise<{ ok: true; id: string }>;
  refreshAllGithubNodes: () => Promise<{ ok: true; refreshed: number }>;
  updateElement: (input: {
    id: string;
    patch: UpdateElementPatch;
  }) => Promise<{ id: string; element: unknown }>;
  updateNodeSettings: (input: {
    id: string;
    settings: NodeSettings;
  }) => Promise<{
    id: string;
    changed: boolean;
    settings: NodeSettings;
    element: unknown;
  }>;
  autoLayout: (input?: AutoLayoutInput) => Promise<{
    movedNodeIds: string[];
    routedEdgeIds: string[];
    metrics: GraphQualityMetrics;
    diagnostics: readonly import("@causcape/graph").Diagnostic[];
    before: import("@causcape/graph").GraphQualityReport;
    after: import("@causcape/graph").GraphQualityReport;
    iterations: number;
    converged: boolean;
    changedNodeIds: readonly string[];
  }>;
  beginAgentSession: (input?: {
    sessionId?: string;
  }) => Promise<import("@causcape/graph").AgentSessionInfo>;
  getAgentSession: () => Promise<import("@causcape/graph").AgentSessionInfo>;
  rollbackAgentChanges: (input?: { sessionId?: string }) => Promise<{
    rolledBack: boolean;
    reason: string;
    sessionId: string | null;
    revision: number;
    segmentId: string | null;
    touchedEntityIds: readonly string[];
    restoredEntityIds: readonly string[];
    removedEntityIds: readonly string[];
  }>;
};

export const MCP_TOOL_DEFINITIONS = CAUSCAPE_MCP_TOOLS;

/**
 * Registers tools with WebMCP if available, otherwise exposes on window for manual use.
 * WebMCP spec (Chrome 149+): `document.modelContext.registerTool({name,description,inputSchema,execute})`
 * Legacy draft used `navigator.mcp` / `window.mcp` with 2-arg registerTool — kept as fallback for older builds.
 * Uses ownerDocument derivation where possible (AGENTS.md).
 */
export const registerGraphMCP = (
  handlers: GraphMCPHandlers,
  ownerDocument: Document | null = null,
) => {
  const toolMap: Record<string, (input: unknown) => Promise<unknown>> = {
    getGraph: handlers.getGraph as (input: unknown) => Promise<unknown>,
    validateGraph: handlers.validateGraph as (
      input: unknown,
    ) => Promise<unknown>,
    resetCanvas: handlers.resetCanvas as () => Promise<unknown>,
    searchNodes: handlers.searchNodes as (input: unknown) => Promise<unknown>,
    createNode: handlers.createNode as (input: unknown) => Promise<unknown>,
    createNodes: handlers.createNodes as (input: unknown) => Promise<unknown>,
    createEdge: handlers.createEdge as (input: unknown) => Promise<unknown>,
    updateElement: handlers.updateElement as (
      input: unknown,
    ) => Promise<unknown>,
    updateNodeSettings: handlers.updateNodeSettings as (
      input: unknown,
    ) => Promise<unknown>,
    autoLayout: handlers.autoLayout as (input: unknown) => Promise<unknown>,
    beginAgentSession: handlers.beginAgentSession as (
      input: unknown,
    ) => Promise<unknown>,
    getAgentSession: handlers.getAgentSession as (
      input: unknown,
    ) => Promise<unknown>,
    rollbackAgentChanges: handlers.rollbackAgentChanges as (
      input: unknown,
    ) => Promise<unknown>,
    // Extended Causcape GitHub tools
    createCauscapeNode: handlers.createCauscapeNode as (
      input: unknown,
    ) => Promise<unknown>,
    createCauscapeEdge: handlers.createCauscapeEdge as (
      input: unknown,
    ) => Promise<unknown>,
    getGraphSnapshot: handlers.getGraph as (input: unknown) => Promise<unknown>,
    setGithubToken: handlers.setGithubToken as (
      input: unknown,
    ) => Promise<unknown>,
    clearGithubToken: handlers.clearGithubToken as (
      input: unknown,
    ) => Promise<unknown>,
    refreshGithubNode: handlers.refreshGithubNode as (
      input: unknown,
    ) => Promise<unknown>,
    refreshAllGithubNodes: handlers.refreshAllGithubNodes as (
      input: unknown,
    ) => Promise<unknown>,
  };

  // Expose the combined Causcape surface on the canvas' own window. The merge
  // keeps independently mounted project-document tools available regardless
  // of which bridge registers first.
  const debugTarget = (ownerDocument?.defaultView ??
    globalThis) as unknown as Record<string, unknown>;
  const existingDebugApi = debugTarget.CauscapeMCP as
    | {
        tools?: readonly { name: string }[];
        handlers?: Record<string, (input: unknown) => Promise<unknown>>;
      }
    | undefined;
  const mergedHandlers = {
    ...existingDebugApi?.handlers,
    ...toolMap,
  };
  const mergedTools = [
    ...(existingDebugApi?.tools ?? []),
    ...CAUSCAPE_MCP_TOOLS,
  ].filter(
    (tool, index, tools) =>
      tools.findIndex((candidate) => candidate.name === tool.name) === index,
  );
  debugTarget.CauscapeMCP = {
    tools: mergedTools,
    handlers: mergedHandlers,
    call: async (name: string, input: unknown) => {
      const fn = mergedHandlers[name];
      if (!fn) {
        throw new Error(`Unknown tool ${name}`);
      }
      return fn(input);
    },
  };
  // Attempt WebMCP auto-registration (best-effort, no hard dependency)
  // Chrome 151: document.modelContext.registerTool({name,description,inputSchema,execute})
  // Prior draft: navigator.mcp / window.mcp with (def, handler) — kept for compat.
  const tryRegisterWebMCP = (): void => {
    const extraDefs: Array<{
      name: string;
      description: string;
      inputSchema: unknown;
    }> = [
      {
        name: "createCauscapeNode",
        description:
          "Create a Causcape node (variable or github-issue/pr/commit/repo). Idempotent by github.url lowercased.",
        inputSchema: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "variable",
                "github-issue",
                "github-pr",
                "github-commit",
                "github-repo",
              ],
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
        description:
          "Create a directed edge between causcape nodes with optional freeform label.",
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
        description:
          "Set ephemeral GitHub token (memory-only, never persisted).",
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
        description:
          "Refresh a single GitHub node via API (ETag aware) and update element cache.",
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

    const registerWith = async (
      registerFn: (def: Record<string, unknown>) => unknown,
    ) => {
      for (const tool of CAUSCAPE_MCP_TOOLS) {
        const handler = toolMap[tool.name];
        if (!handler) {
          continue;
        }
        try {
          await registerFn({ ...tool, execute: handler });
        } catch {
          // ignore per-tool registration failures
        }
      }
      for (const def of extraDefs) {
        const handler = toolMap[def.name];
        if (!handler) {
          continue;
        }
        try {
          await registerFn({ ...def, execute: handler });
        } catch {
          // ignore
        }
      }
    };

    // 1) Modern: document.modelContext (also navigator.modelContext deprecated but still present in 151)
    try {
      const doc = ownerDocument as unknown as
        | {
            modelContext?: {
              registerTool: (def: unknown, opts?: unknown) => unknown;
            };
          }
        | undefined;
      const nav = ownerDocument?.defaultView?.navigator as unknown as
        | {
            modelContext?: {
              registerTool: (def: unknown, opts?: unknown) => unknown;
            };
          }
        | undefined;
      const modern = doc?.modelContext ?? nav?.modelContext;
      if (modern?.registerTool) {
        void registerWith((def) => modern.registerTool(def as never));
        return;
      }
    } catch {
      // ignore
    }

    // 2) Legacy draft: window.mcp / navigator.mcp with 2-arg (def, handler)
    try {
      const ownerWindow = ownerDocument?.defaultView as unknown as
        | Record<string, unknown>
        | undefined;
      const maybeMCP = ownerWindow?.mcp as
        | { registerTool?: (def: unknown, handler: unknown) => void }
        | undefined;
      const maybeNavigatorMCP = (
        ownerDocument?.defaultView?.navigator as unknown as
          | Record<string, unknown>
          | undefined
      )?.mcp as
        | { registerTool?: (def: unknown, handler: unknown) => void }
        | undefined;
      const legacy = maybeMCP ?? maybeNavigatorMCP;
      if (legacy?.registerTool) {
        for (const tool of CAUSCAPE_MCP_TOOLS) {
          const handler = toolMap[tool.name];
          if (handler) {
            try {
              legacy.registerTool(tool, handler);
            } catch {
              // ignore
            }
          }
        }
        for (const def of extraDefs) {
          const handler = toolMap[def.name];
          if (handler) {
            try {
              legacy.registerTool(def, handler);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  };

  tryRegisterWebMCP();

  return toolMap;
};

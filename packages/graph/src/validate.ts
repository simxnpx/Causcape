import type {
  CauscapeEdge,
  CauscapeNode,
  Diagnostic,
} from "./types";

const isValidGithubRef = (node: CauscapeNode): boolean => {
  const ref = node.github;
  if (!ref) {
    return false;
  }
  if (ref.kind !== node.kind) {
    return false;
  }
  if (!ref.owner || ref.owner.trim().length === 0) {
    return false;
  }
  if (!ref.repo || ref.repo.trim().length === 0) {
    return false;
  }
  if (!ref.url || ref.url.trim().length === 0) {
    return false;
  }
  if (ref.kind === "github-issue" || ref.kind === "github-pr") {
    const n = (ref as Extract<typeof ref, { kind: "github-issue" | "github-pr" }>).number;
    if (!Number.isInteger(n) || n <= 0) {
      return false;
    }
  }
  if (ref.kind === "github-commit") {
    const sha = (ref as Extract<typeof ref, { kind: "github-commit" }>).sha;
    if (!sha || sha.trim().length === 0) {
      return false;
    }
  }
  return true;
};

const isGithubNotFoundPlaceholder = (node: CauscapeNode): boolean => {
  const c = node.cache as unknown as Record<string, unknown> | undefined;
  if (!c) {
    return false;
  }
  if (c["stale"] !== true) {
    return false;
  }
  const title = c["title"];
  const message = c["message"];
  const description = c["description"];
  return title === "Not found" || message === "Not found" || description === "Not found";
};

export const validateGraph = (
  nodes: readonly CauscapeNode[],
  edges: readonly CauscapeEdge[],
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  const nodesById = new Map<string, CauscapeNode>();
  for (const node of nodes) {
    nodesById.set(node.id, node);
    if (!node.label || node.label.trim().length === 0) {
      diagnostics.push({
        level: "error",
        code: "NODE_MISSING_LABEL",
        message: `Node ${node.id} has empty label`,
        elementIds: [node.id],
      });
    }
    // Github-specific validation
    if (node.kind.startsWith("github")) {
      const ref = node.github as unknown as Record<string, unknown> | undefined;
      const isValid = isValidGithubRef(node);
      if (!isValid) {
        diagnostics.push({
          level: "error",
          code: "GITHUB_INVALID_REF",
          message: `Node ${node.id} has invalid github ref for kind ${node.kind}`,
          elementIds: [node.id],
        });
      } else if (isGithubNotFoundPlaceholder(node)) {
        diagnostics.push({
          level: "warning",
          code: "GITHUB_NOT_FOUND",
          message: `Node ${node.id} github entity not found`,
          elementIds: [node.id],
        });
      }
      void ref;
    }
  }

  // Track endpoints and duplicates
  const edgeKeyCount = new Map<string, number>();
  const incidentCount = new Map<string, number>();

  for (const edge of edges) {
    const fromExists = nodesById.has(edge.fromNodeId);
    const toExists = nodesById.has(edge.toNodeId);

    if (!fromExists || !toExists) {
      const missingIds: string[] = [];
      if (!fromExists) {
        missingIds.push(edge.fromNodeId);
      }
      if (!toExists) {
        missingIds.push(edge.toNodeId);
      }
      diagnostics.push({
        level: "error",
        code: "EDGE_MISSING_ENDPOINT",
        message: `Edge ${edge.id} references missing node(s): ${missingIds.join(", ")}`,
        elementIds: [edge.id, ...missingIds],
      });
    }

    if (edge.fromNodeId === edge.toNodeId) {
      diagnostics.push({
        level: "error",
        code: "EDGE_SELF_LOOP",
        message: `Edge ${edge.id} is a self-loop on ${edge.fromNodeId}`,
        elementIds: [edge.id, edge.fromNodeId],
      });
    }

    const key = `${edge.fromNodeId}->${edge.toNodeId}`;
    edgeKeyCount.set(key, (edgeKeyCount.get(key) ?? 0) + 1);

    if (fromExists && toExists) {
      incidentCount.set(edge.fromNodeId, (incidentCount.get(edge.fromNodeId) ?? 0) + 1);
      incidentCount.set(edge.toNodeId, (incidentCount.get(edge.toNodeId) ?? 0) + 1);
    }
  }

  for (const [key, count] of edgeKeyCount) {
    if (count > 1) {
      const [from, to] = key.split("->");
      const dupEdges = edges.filter(
        (e) => e.fromNodeId === from && e.toNodeId === to,
      );
      diagnostics.push({
        level: "warning",
        code: "DUPLICATE_EDGE",
        message: `Duplicate edge ${from} -> ${to} (${count} times)`,
        elementIds: dupEdges.map((e) => e.id),
      });
    }
  }

  for (const node of nodes) {
    if ((incidentCount.get(node.id) ?? 0) === 0) {
      diagnostics.push({
        level: "warning",
        code: "ORPHAN_NODE",
        message: `Node ${node.id} (${node.label}) is disconnected`,
        elementIds: [node.id],
      });
    }
  }

  // Cycle detection via DFS (warning-level, not blocking)
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (nodesById.has(edge.fromNodeId) && nodesById.has(edge.toNodeId)) {
      adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    }
  }

  const visited = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 visiting, 2 done
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (nodeId: string) => {
    visited.set(nodeId, 1);
    stack.push(nodeId);
    const neighbors = adjacency.get(nodeId) ?? [];
    for (const nb of neighbors) {
      const state = visited.get(nb) ?? 0;
      if (state === 0) {
        dfs(nb);
      } else if (state === 1) {
        const idx = stack.indexOf(nb);
        if (idx !== -1) {
          cycles.push([...stack.slice(idx), nb]);
        }
      }
    }
    stack.pop();
    visited.set(nodeId, 2);
  };

  for (const node of nodes) {
    if ((visited.get(node.id) ?? 0) === 0) {
      dfs(node.id);
    }
  }

  const hasGithubNode = nodes.some((n) => n.kind.startsWith("github"));
  for (const cycle of cycles) {
    diagnostics.push({
      level: hasGithubNode ? "info" : "warning",
      code: "CYCLE_DETECTED",
      message: `Cycle detected: ${cycle.join(" -> ")}`,
      elementIds: [...new Set(cycle)],
    });
  }

  return diagnostics;
};

export const hashDiagnostics = (diagnostics: readonly Diagnostic[]): string => {
  if (diagnostics.length === 0) {
    return "empty";
  }
  // Deterministic hash: sorted by code + elementIds
  const sorted = [...diagnostics].sort((a, b) =>
    a.code === b.code
      ? a.elementIds.join(",").localeCompare(b.elementIds.join(","))
      : a.code.localeCompare(b.code),
  );
  return sorted.map((d) => `${d.level}:${d.code}:${d.elementIds.join(",")}`).join("|");
};

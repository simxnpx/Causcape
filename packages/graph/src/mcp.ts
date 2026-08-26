import type { Diagnostic } from "./types";

export type MCPToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type MCPToolDefinition = {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
};

export const CAUSCPE_MCP_TOOLS: readonly MCPToolDefinition[] = [
  {
    name: "getGraph",
    description:
      "Get the current causcape graph derived from scene elements, including nodes, edges, and diagnostics (errors/warnings).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "createNode",
    description:
      "Create a new causcape node (variable) on the canvas. If x/y omitted, viewport-aware placement is used.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Node label (required)" },
        x: { type: "number", description: "Scene X coordinate (optional)" },
        y: { type: "number", description: "Scene Y coordinate (optional)" },
        kind: {
          type: "string",
          enum: ["variable"],
          description: "Node kind (default variable)",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "createNodes",
    description: "Batch create multiple nodes atomically (single history entry, single graph rebuild).",
    inputSchema: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              kind: { type: "string", enum: ["variable"] },
            },
            required: ["label"],
          },
        },
      },
      required: ["nodes"],
    },
  },
  {
    name: "createEdge",
    description: "Create a directed edge between two causcape nodes.",
    inputSchema: {
      type: "object",
      properties: {
        fromNodeId: { type: "string", description: "Source node id" },
        toNodeId: { type: "string", description: "Target node id" },
        label: { type: "string", description: "Optional edge label" },
      },
      required: ["fromNodeId", "toNodeId"],
    },
  },
  {
    name: "updateElement",
    description:
      "Update a causcape node or edge by id. Patch may include label, position (x/y) for nodes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: {
          type: "object",
          properties: {
            label: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
          },
        },
      },
      required: ["id", "patch"],
    },
  },
  {
    name: "validateGraph",
    description: "Validate the current graph and return diagnostics (errors/warnings).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
] as const;

export type CreateNodeInput = {
  label: string;
  x?: number;
  y?: number;
  kind?: "variable";
};

export type CreateEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
};

export type UpdateElementPatch = {
  label?: string;
  x?: number;
  y?: number;
};

export type GraphSnapshot = {
  nodes: readonly { id: string; label: string; kind: string; x: number; y: number }[];
  edges: readonly { id: string; fromNodeId: string; toNodeId: string; label?: string }[];
  diagnostics: readonly Diagnostic[];
};

// Correctly spelled alias for backwards compat
export const CAUSCAPE_MCP_TOOLS = CAUSCPE_MCP_TOOLS;

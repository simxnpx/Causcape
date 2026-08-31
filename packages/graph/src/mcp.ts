import type {
  ArchitectureHealth,
  ArchitectureRelationshipType,
  CauscapeNodeKind,
  CauscapeReference,
  Diagnostic,
} from "./types";

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
      "Create an architecture node or legacy variable on the canvas. If x/y omitted, viewport-aware placement is used.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Node label (required)" },
        x: { type: "number", description: "Scene X coordinate (optional)" },
        y: { type: "number", description: "Scene Y coordinate (optional)" },
        kind: {
          type: "string",
          enum: [
            "variable",
            "service",
            "datastore",
            "queue",
            "external-system",
            "user",
          ],
          description: "Node kind (default variable)",
        },
        environment: { type: "string" },
        health: {
          type: "string",
          enum: ["healthy", "degraded", "failed", "unknown"],
        },
        description: { type: "string" },
        technologies: { type: "array", items: { type: "string" } },
        references: { type: "array", items: { type: "object" } },
      },
      required: ["label"],
    },
  },
  {
    name: "createNodes",
    description:
      "Batch create multiple nodes atomically (single history entry, single graph rebuild).",
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
              kind: {
                type: "string",
                enum: [
                  "variable",
                  "service",
                  "datastore",
                  "queue",
                  "external-system",
                  "user",
                ],
              },
              environment: { type: "string" },
              health: {
                type: "string",
                enum: ["healthy", "degraded", "failed", "unknown"],
              },
              description: { type: "string" },
              technologies: { type: "array", items: { type: "string" } },
              references: { type: "array", items: { type: "object" } },
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
    description:
      "Create a directed edge bound to the middle of the best available sides of two Causcape nodes.",
    inputSchema: {
      type: "object",
      properties: {
        fromNodeId: { type: "string", description: "Source node id" },
        toNodeId: { type: "string", description: "Target node id" },
        label: { type: "string", description: "Optional edge label" },
        relationship: {
          type: "string",
          enum: [
            "calls",
            "depends-on",
            "reads",
            "writes",
            "publishes",
            "subscribes",
          ],
          description: "Optional typed architecture relationship",
        },
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
            kind: {
              type: "string",
              enum: [
                "variable",
                "service",
                "datastore",
                "queue",
                "external-system",
                "user",
              ],
            },
            environment: { type: "string" },
            health: {
              type: "string",
              enum: ["healthy", "degraded", "failed", "unknown"],
            },
            description: { type: "string" },
            technologies: { type: "array", items: { type: "string" } },
            references: { type: "array", items: { type: "object" } },
            relationship: {
              type: "string",
              enum: [
                "calls",
                "depends-on",
                "reads",
                "writes",
                "publishes",
                "subscribes",
              ],
            },
          },
        },
      },
      required: ["id", "patch"],
    },
  },
  {
    name: "updateNodeSettings",
    description:
      "Atomically update the Causcape appearance settings of one causcape node. Omitted settings are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Causcape node id" },
        settings: {
          type: "object",
          properties: {
            backgroundColor: { type: "string" },
            strokeColor: { type: "string" },
            fillStyle: {
              type: "string",
              enum: ["hachure", "cross-hatch", "solid", "zigzag"],
            },
            strokeWidth: { type: "number", minimum: 0 },
            strokeStyle: {
              type: "string",
              enum: ["solid", "dashed", "dotted"],
            },
            roughness: { type: "number", minimum: 0 },
            opacity: { type: "number", minimum: 0, maximum: 100 },
            roundness: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  properties: {
                    type: { type: "number" },
                    value: { type: "number", minimum: 0 },
                  },
                  required: ["type"],
                },
              ],
            },
            locked: { type: "boolean" },
          },
        },
      },
      required: ["id", "settings"],
    },
  },
  {
    name: "autoLayout",
    description:
      "Organize causcape nodes with a deterministic incremental layered layout and route edges to node borders. Locked nodes remain anchored by default. Vertical side-flow packing is opt-in because it is only safe for a few isolated local chains.",
    inputSchema: {
      type: "object",
      properties: {
        originX: { type: "number" },
        originY: { type: "number" },
        gapX: { type: "number", minimum: 0 },
        gapY: { type: "number", minimum: 0 },
        respectLocked: { type: "boolean" },
        enableVerticalSubflows: {
          type: "boolean",
          description:
            "Opt into compact vertical side chains only when the agent has identified a suitable local flow.",
        },
      },
      required: [],
    },
  },
  {
    name: "validateGraph",
    description:
      "Inspect the stored graph geometry and bindings for detached edges, node or label overlaps, route crossings, and other quality problems. When repair is recommended, call autoLayout and validate again until the report is clean.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "resetCanvas",
    description:
      "Reset the canvas completely by removing every scene element and clearing scene history.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "searchNodes",
    description:
      "Find causcape nodes by case-insensitive match against id, label, GitHub reference, and cached metadata.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for (required)" },
        kind: {
          type: "string",
          enum: [
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
          ],
          description: "Optional node-kind filter",
        },
        limit: {
          type: "number",
          description: "Maximum matches to return (default 50, maximum 200)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "beginAgentSession",
    description:
      "Start a provenance checkpoint for subsequent agent graph mutations. A user scene change forms a hard rollback boundary.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Optional stable identifier for this agent session",
        },
      },
      required: [],
    },
  },
  {
    name: "getAgentSession",
    description:
      "Return the active agent session, revision, and entities that can be rolled back.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "rollbackAgentChanges",
    description:
      "Restore graph entities touched by the active agent segment to their exact prior visual state. User changes are never overwritten.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: [],
    },
  },
] as const;

export type ArchitectureNodeFields = Readonly<{
  environment?: string;
  health?: ArchitectureHealth;
  description?: string;
  technologies?: readonly string[];
  references?: readonly CauscapeReference[];
}>;

export type CreateNodeInput = {
  label: string;
  x?: number;
  y?: number;
} & ArchitectureNodeFields & { kind?: CauscapeNodeKind };

export type CreateEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  relationship?: ArchitectureRelationshipType;
};

export type UpdateElementPatch = {
  label?: string;
  x?: number;
  y?: number;
  kind?: CauscapeNodeKind;
  environment?: string;
  health?: ArchitectureHealth;
  description?: string;
  technologies?: readonly string[];
  references?: readonly CauscapeReference[];
  relationship?: ArchitectureRelationshipType;
};

export type NodeSettings = {
  backgroundColor?: string;
  strokeColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: number;
  opacity?: number;
  roundness?: null | { type: number; value?: number };
  locked?: boolean;
};

export type AutoLayoutInput = {
  originX?: number;
  originY?: number;
  gapX?: number;
  gapY?: number;
  respectLocked?: boolean;
  enableVerticalSubflows?: boolean;
};

export type SearchNodesInput = {
  query: string;
  kind?: CauscapeNodeKind;
  limit?: number;
};

export type GraphSnapshot = {
  nodes: readonly {
    id: string;
    label: string;
    kind: CauscapeNodeKind;
    x: number;
    y: number;
    width?: number;
    height?: number;
    environment?: string;
    health?: ArchitectureHealth;
    description?: string;
    technologies?: readonly string[];
    references?: readonly CauscapeReference[];
    github?: unknown;
    cache?: unknown;
  }[];
  edges: readonly {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    label?: string;
    relationship?: ArchitectureRelationshipType;
  }[];
  diagnostics: readonly Diagnostic[];
};

// Correctly spelled alias for backwards compat
export const CAUSCAPE_MCP_TOOLS = CAUSCPE_MCP_TOOLS;

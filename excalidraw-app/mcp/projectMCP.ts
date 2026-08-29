import { randomId } from "@excalidraw/common";

import { transactProject } from "@causcape/core";

import type { CanvasObject, CauscapeDocument, Project } from "@causcape/core";

export type ProjectMCPContext = {
  getProject: () => Project | null;
  setProject: (project: Project) => void;
};

export type ProjectDocumentSnapshot = {
  projectId: string;
  title: string;
  revision: number;
  document: CauscapeDocument;
  objects: Readonly<Record<string, CanvasObject>>;
};

export type ReplaceProjectDocumentInput = {
  expectedRevision: number;
  document: CauscapeDocument;
};

const cloneSnapshotValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const toSnapshot = (project: Project): ProjectDocumentSnapshot => ({
  projectId: project.id,
  title: project.title,
  revision: project.revision,
  document: cloneSnapshotValue(project.document),
  objects: cloneSnapshotValue(project.canvas.objects),
});

const requireProject = (ctx: ProjectMCPContext): Project => {
  const project = ctx.getProject();
  if (!project) {
    throw new Error("No Causcape project is open");
  }
  return project;
};

export const createProjectMCPHandlers = (ctx: ProjectMCPContext) => {
  const getProjectDocument = async (): Promise<ProjectDocumentSnapshot> =>
    toSnapshot(requireProject(ctx));

  const replaceProjectDocument = async (
    input: ReplaceProjectDocumentInput,
  ): Promise<ProjectDocumentSnapshot> => {
    if (
      !input ||
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw new Error(
        "replaceProjectDocument: expectedRevision must be a non-negative integer",
      );
    }

    const current = requireProject(ctx);
    const result = transactProject(current, {
      id: `webmcp-document-${randomId()}`,
      expectedRevision: input.expectedRevision,
      occurredAt: new Date().toISOString(),
      provenance: {
        actor: { type: "agent" },
        channel: "webmcp",
        summary: "Replaced the structured project document",
      },
      operations: [{ type: "document.replace", document: input.document }],
    });

    if (!result.ok) {
      throw new Error(
        result.issues
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join("; "),
      );
    }

    ctx.setProject(result.value);
    return toSnapshot(result.value);
  };

  return { getProjectDocument, replaceProjectDocument };
};

export type ProjectMCPHandlers = ReturnType<typeof createProjectMCPHandlers>;

type MCPToolDefinition = {
  name: keyof ProjectMCPHandlers;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    untrustedContentHint?: boolean;
  };
};

const inlineContentSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        type: { const: "text" },
        text: { type: "string" },
        styles: {
          type: "object",
          additionalProperties: { type: "boolean" },
        },
      },
      required: ["type", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "link" },
        href: { type: "string" },
        content: {
          type: "array",
          items: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
            additionalProperties: false,
          },
        },
      },
      required: ["type", "href", "content"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "canvas-reference" },
        objectId: { type: "string", minLength: 1 },
        labelOverride: { type: "string" },
      },
      required: ["type", "objectId"],
      additionalProperties: false,
    },
  ],
};

const documentSchema = {
  type: "object",
  properties: {
    schemaVersion: { const: 1 },
    blocks: {
      type: "array",
      items: { $ref: "#/$defs/block" },
    },
  },
  required: ["schemaVersion", "blocks"],
  additionalProperties: false,
};

export const PROJECT_MCP_TOOL_DEFINITIONS: readonly MCPToolDefinition[] = [
  {
    name: "getProjectDocument",
    title: "Read project document",
    description:
      "Read the open project's structured document, current revision, and canvas objects available for stable canvas-reference tokens.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
  },
  {
    name: "replaceProjectDocument",
    title: "Replace project document",
    description:
      "Replace the open project's structured document at an expected revision. Use canvas-reference inline content with an objectId returned by getProjectDocument.",
    inputSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
        document: documentSchema,
      },
      required: ["expectedRevision", "document"],
      additionalProperties: false,
      $defs: {
        block: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1 },
            type: {
              type: "string",
              enum: [
                "paragraph",
                "heading",
                "bullet-list-item",
                "numbered-list-item",
                "check-list-item",
                "code-block",
                "callout",
              ],
            },
            props: { type: "object" },
            content: { type: "array", items: inlineContentSchema },
            children: {
              type: "array",
              items: { $ref: "#/$defs/block" },
            },
          },
          required: ["id", "type", "props", "content", "children"],
          additionalProperties: false,
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
];

type CauscapeDebugAPI = {
  tools?: readonly { name: string }[];
  handlers?: Record<string, (input: unknown) => Promise<unknown>>;
  call?: (name: string, input: unknown) => Promise<unknown>;
};

export const registerProjectMCP = (
  handlers: ProjectMCPHandlers,
  ownerDocument: Document | null,
) => {
  const toolMap: Record<string, (input: unknown) => Promise<unknown>> = {
    getProjectDocument: handlers.getProjectDocument as (
      input: unknown,
    ) => Promise<unknown>,
    replaceProjectDocument: handlers.replaceProjectDocument as (
      input: unknown,
    ) => Promise<unknown>,
  };

  const debugTarget = (ownerDocument?.defaultView ?? globalThis) as unknown as
    | Record<string, unknown> & { CauscapeMCP?: CauscapeDebugAPI };
  const existingDebugApi = debugTarget.CauscapeMCP;
  const mergedHandlers = {
    ...existingDebugApi?.handlers,
    ...toolMap,
  };
  const mergedTools = [
    ...(existingDebugApi?.tools ?? []),
    ...PROJECT_MCP_TOOL_DEFINITIONS,
  ].filter(
    (tool, index, tools) =>
      tools.findIndex((candidate) => candidate.name === tool.name) === index,
  );
  debugTarget.CauscapeMCP = {
    tools: mergedTools,
    handlers: mergedHandlers,
    call: async (name, input) => {
      const handler = mergedHandlers[name];
      if (!handler) {
        throw new Error(`Unknown tool ${name}`);
      }
      return handler(input);
    },
  };

  const registerModernTools = async (
    registerTool: (definition: Record<string, unknown>) => unknown,
  ) => {
    for (const definition of PROJECT_MCP_TOOL_DEFINITIONS) {
      try {
        await registerTool({
          ...definition,
          execute: toolMap[definition.name],
        });
      } catch {
        // A browser may expose only a subset of the evolving WebMCP API.
      }
    }
  };

  try {
    const modelContextDocument = ownerDocument as
      | (Document & {
          modelContext?: {
            registerTool: (definition: Record<string, unknown>) => unknown;
          };
        })
      | null;
    const modelContextNavigator = ownerDocument?.defaultView?.navigator as
      | (Navigator & {
          modelContext?: {
            registerTool: (definition: Record<string, unknown>) => unknown;
          };
        })
      | undefined;
    const modelContext =
      modelContextDocument?.modelContext ?? modelContextNavigator?.modelContext;
    if (modelContext?.registerTool) {
      void registerModernTools((definition) =>
        modelContext.registerTool(definition),
      );
      return toolMap;
    }
  } catch {
    // Continue to the legacy registration surface below.
  }

  try {
    const ownerWindow = ownerDocument?.defaultView as
      | (Window & {
          mcp?: {
            registerTool: (
              definition: MCPToolDefinition,
              handler: (input: unknown) => Promise<unknown>,
            ) => void;
          };
        })
      | null;
    const navigatorMCP = ownerDocument?.defaultView?.navigator as
      | (Navigator & {
          mcp?: {
            registerTool: (
              definition: MCPToolDefinition,
              handler: (input: unknown) => Promise<unknown>,
            ) => void;
          };
        })
      | undefined;
    const legacyMCP = ownerWindow?.mcp ?? navigatorMCP?.mcp;
    if (legacyMCP?.registerTool) {
      PROJECT_MCP_TOOL_DEFINITIONS.forEach((definition) => {
        try {
          legacyMCP.registerTool(definition, toolMap[definition.name]);
        } catch {
          // Registration remains best-effort for legacy browser drafts.
        }
      });
    }
  } catch {
    // The debug API remains available even if WebMCP is not implemented.
  }

  return toolMap;
};

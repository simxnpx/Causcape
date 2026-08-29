import {
  createProjectFromTemplate,
  transactProject,
  type CauscapeDocument,
  type Project,
} from "@causcape/core";
import { describe, expect, it, vi } from "vitest";

import {
  createProjectMCPHandlers,
  PROJECT_MCP_TOOL_DEFINITIONS,
  registerProjectMCP,
} from "../mcp/projectMCP";
import { registerGraphMCP, type GraphMCPHandlers } from "../mcp/graphMCP";

const referencedDocument: CauscapeDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: "overview",
      type: "paragraph",
      props: {},
      content: [
        { type: "text", text: "Requests reach " },
        { type: "canvas-reference", objectId: "payment-service" },
      ],
      children: [],
    },
  ],
};

const createReferencedProject = (): Project => {
  const project = createProjectFromTemplate({
    id: "payments",
    title: "Payments architecture",
    template: "blank",
    occurredAt: "2026-08-29T09:00:00.000Z",
    provenance: {
      actor: { type: "human", id: "local-user" },
      channel: "browser",
    },
  });
  const result = transactProject(project, {
    id: "add-payment-service",
    expectedRevision: 0,
    occurredAt: "2026-08-29T09:01:00.000Z",
    provenance: {
      actor: { type: "human", id: "local-user" },
      channel: "browser",
    },
    operations: [
      {
        type: "object.upsert",
        object: {
          id: "payment-service",
          elementIds: ["payment-node"],
          name: "Payment Service",
          metadata: { kind: "service" },
          state: "active",
        },
      },
    ],
  });
  if (!result.ok) {
    throw new Error("Could not create project fixture");
  }
  return result.value;
};

describe("project document WebMCP handlers", () => {
  it("reads and replaces structured documents with revision checks", async () => {
    let project = createReferencedProject();
    const handlers = createProjectMCPHandlers({
      getProject: () => project,
      setProject: (nextProject) => {
        project = nextProject;
      },
    });

    await expect(handlers.getProjectDocument()).resolves.toMatchObject({
      projectId: "payments",
      title: "Payments architecture",
      revision: 1,
      objects: {
        "payment-service": {
          name: "Payment Service",
          metadata: { kind: "service" },
        },
      },
    });

    const updated = await handlers.replaceProjectDocument({
      expectedRevision: 1,
      document: referencedDocument,
    });

    expect(updated).toMatchObject({
      revision: 2,
      document: referencedDocument,
    });
    expect(project.document.blocks[0].content[1]).toEqual({
      type: "canvas-reference",
      objectId: "payment-service",
    });

    await expect(
      handlers.replaceProjectDocument({
        expectedRevision: 1,
        document: referencedDocument,
      }),
    ).rejects.toThrow(/REVISION_CONFLICT/);
    expect(project.revision).toBe(2);
  });

  it("rejects document references to canvas objects outside the project", async () => {
    let project = createReferencedProject();
    const handlers = createProjectMCPHandlers({
      getProject: () => project,
      setProject: (nextProject) => {
        project = nextProject;
      },
    });

    await expect(
      handlers.replaceProjectDocument({
        expectedRevision: 1,
        document: {
          ...referencedDocument,
          blocks: [
            {
              ...referencedDocument.blocks[0],
              content: [
                { type: "canvas-reference", objectId: "missing-service" },
              ],
            },
          ],
        },
      }),
    ).rejects.toThrow(/DANGLING_REFERENCE/);
    expect(project.revision).toBe(1);
  });

  it("registers both document tools with WebMCP and the owner window debug API", async () => {
    const project = createReferencedProject();
    const handlers = createProjectMCPHandlers({
      getProject: () => project,
      setProject: vi.fn(),
    });
    const registerTool = vi.fn();
    const modelContextDocument = document as Document & {
      modelContext?: { registerTool: typeof registerTool };
    };
    modelContextDocument.modelContext = { registerTool };

    registerProjectMCP(handlers, modelContextDocument);

    await vi.waitFor(() => {
      expect(registerTool).toHaveBeenCalledTimes(
        PROJECT_MCP_TOOL_DEFINITIONS.length,
      );
    });
    expect(
      registerTool.mock.calls.map(([definition]) => definition.name),
    ).toEqual(["getProjectDocument", "replaceProjectDocument"]);

    const debugApi = (
      modelContextDocument.defaultView as Window & {
        CauscapeMCP?: {
          call: (name: string, input: unknown) => Promise<unknown>;
        };
      }
    ).CauscapeMCP;
    await expect(
      debugApi?.call("getProjectDocument", {}),
    ).resolves.toMatchObject({ projectId: "payments", revision: 1 });

    delete modelContextDocument.modelContext;
    registerGraphMCP(
      {
        getGraph: async () => ({ source: "graph" }),
      } as unknown as GraphMCPHandlers,
      modelContextDocument,
    );
    const combinedDebugApi = (
      modelContextDocument.defaultView as Window & {
        CauscapeMCP?: {
          call: (name: string, input: unknown) => Promise<unknown>;
        };
      }
    ).CauscapeMCP;
    await expect(combinedDebugApi?.call("getGraph", {})).resolves.toEqual({
      source: "graph",
    });
    await expect(
      combinedDebugApi?.call("getProjectDocument", {}),
    ).resolves.toMatchObject({ projectId: "payments" });

    delete (
      modelContextDocument.defaultView as Window & {
        CauscapeMCP?: unknown;
      }
    ).CauscapeMCP;
  });
});

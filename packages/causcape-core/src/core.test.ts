import { describe, expect, it } from "vitest";

import {
  findCanvasReferences,
  openProject,
  resolveCanvasReference,
  serializeProject,
  transactProject,
  type Project,
  type ProjectTransaction,
} from "./index";

const provenance = {
  actor: { type: "human" as const, id: "local-user" },
  channel: "browser" as const,
};

const createProject = (): Project => {
  const result = transactProject(null, {
    id: "transaction-create",
    expectedRevision: null,
    occurredAt: "2026-08-26T10:00:00.000Z",
    provenance,
    operations: [
      {
        type: "project.create",
        id: "project-checkout",
        title: "Checkout architecture",
        document: {
          schemaVersion: 1,
          blocks: [],
        },
      },
    ],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected project creation to succeed");
  }
  return result.value;
};

describe("Causcape project transactions", () => {
  it("creates a valid project at revision zero", () => {
    const project = createProject();

    expect(project).toMatchObject({
      schemaVersion: 1,
      id: "project-checkout",
      title: "Checkout architecture",
      revision: 0,
      canvas: { objects: {} },
      document: { schemaVersion: 1, blocks: [] },
    });
  });

  it("applies canvas and document changes as one revision", () => {
    const project = createProject();
    const transaction: ProjectTransaction = {
      id: "transaction-document-payment",
      expectedRevision: 0,
      occurredAt: "2026-08-26T10:05:00.000Z",
      provenance,
      operations: [
        {
          type: "canvas.replace",
          scene: {
            elements: [{ id: "element-payment", type: "rectangle" }],
            appState: {},
            files: {},
          },
        },
        {
          type: "object.upsert",
          object: {
            id: "object-payment",
            elementIds: ["element-payment"],
            name: "Payment Service",
            metadata: {},
            state: "active",
          },
        },
        {
          type: "document.replace",
          document: {
            schemaVersion: 1,
            blocks: [
              {
                id: "block-overview",
                type: "paragraph",
                props: {},
                content: [
                  { type: "text", text: "Requests reach " },
                  {
                    type: "canvas-reference",
                    objectId: "object-payment",
                  },
                ],
                children: [],
              },
            ],
          },
        },
      ],
    };

    const result = transactProject(project, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.revision).toBe(1);
    expect(findCanvasReferences(result.value, "object-payment")).toEqual([
      { blockId: "block-overview", contentIndex: 1 },
    ]);
    expect(
      resolveCanvasReference(result.value, {
        type: "canvas-reference",
        objectId: "object-payment",
      }),
    ).toEqual({
      status: "active",
      objectId: "object-payment",
      displayText: "Payment Service",
    });
  });

  it("rejects a stale or partially invalid transaction without changing input", () => {
    const project = createProject();
    const serializedBefore = serializeProject(project);

    const stale = transactProject(project, {
      id: "transaction-stale",
      expectedRevision: 2,
      occurredAt: "2026-08-26T10:05:00.000Z",
      provenance,
      operations: [{ type: "project.rename", title: "Changed" }],
    });
    expect(stale).toMatchObject({
      ok: false,
      issues: [{ code: "REVISION_CONFLICT" }],
    });

    const invalid = transactProject(project, {
      id: "transaction-invalid",
      expectedRevision: 0,
      occurredAt: "2026-08-26T10:05:00.000Z",
      provenance,
      operations: [
        { type: "project.rename", title: "Changed" },
        {
          type: "document.replace",
          document: {
            schemaVersion: 1,
            blocks: [
              {
                id: "block-invalid",
                type: "paragraph",
                props: {},
                content: [
                  {
                    type: "canvas-reference",
                    objectId: "missing-object",
                  },
                ],
                children: [],
              },
            ],
          },
        },
      ],
    });
    expect(invalid).toMatchObject({
      ok: false,
      issues: [{ code: "DANGLING_REFERENCE" }],
    });
    expect(serializeProject(project)).toBe(serializedBefore);
  });

  it("keeps deleted references as explicit placeholders", () => {
    const initial = transactProject(createProject(), {
      id: "transaction-add-payment",
      expectedRevision: 0,
      occurredAt: "2026-08-26T10:05:00.000Z",
      provenance,
      operations: [
        {
          type: "object.upsert",
          object: {
            id: "object-payment",
            elementIds: ["element-payment"],
            name: "Payment Service",
            metadata: {},
            state: "active",
          },
        },
        {
          type: "document.replace",
          document: {
            schemaVersion: 1,
            blocks: [
              {
                id: "block-overview",
                type: "paragraph",
                props: {},
                content: [
                  {
                    type: "canvas-reference",
                    objectId: "object-payment",
                  },
                ],
                children: [],
              },
            ],
          },
        },
      ],
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) {
      return;
    }

    const deleted = transactProject(initial.value, {
      id: "transaction-delete-payment",
      expectedRevision: 1,
      occurredAt: "2026-08-26T10:10:00.000Z",
      provenance,
      operations: [{ type: "object.delete", objectId: "object-payment" }],
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) {
      return;
    }

    expect(
      resolveCanvasReference(deleted.value, {
        type: "canvas-reference",
        objectId: "object-payment",
      }),
    ).toEqual({
      status: "deleted",
      objectId: "object-payment",
      displayText: "Deleted object",
    });
  });

  it("round-trips canonical project JSON", () => {
    const serialized = serializeProject(createProject());
    const opened = openProject(serialized);

    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(serializeProject(opened.value.project)).toBe(serialized);
      expect(opened.value.migration).toBe(null);
    }
  });
});

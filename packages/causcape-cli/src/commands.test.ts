import { describe, expect, it } from "vitest";

import { createProjectFromTemplate, serializeProject } from "@causcape/core";

import { applyAgentPatch, inspectProject } from "./commands";
import { layoutEngineeringModel } from "./layout";

const project = createProjectFromTemplate({
  id: "checkout",
  title: "Checkout architecture",
  template: "architecture",
  occurredAt: "2026-08-26T10:00:00.000Z",
  provenance: {
    actor: { type: "human", id: "local-user" },
    channel: "browser",
  },
});

const model = {
  direction: "RIGHT" as const,
  nodes: [
    { id: "payments", name: "Payment Service", kind: "service" as const },
    { id: "ledger", name: "Ledger", kind: "database" as const },
  ],
  edges: [
    {
      id: "writes",
      from: "payments",
      to: "ledger",
      name: "writes",
    },
  ],
};

describe("Causcape agent commands", () => {
  it("lays out equivalent models deterministically", async () => {
    const first = await layoutEngineeringModel(model);
    const second = await layoutEngineeringModel({
      ...model,
      nodes: [...model.nodes].reverse(),
      edges: [...model.edges].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.scene.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "node-payments", type: "rectangle" }),
        expect.objectContaining({ id: "edge-writes", type: "arrow" }),
      ]),
    );
    expect(first.objects.payments).toMatchObject({
      name: "Payment Service",
      state: "active",
    });
  });

  it("applies model and document operations in one expected revision", async () => {
    const result = await applyAgentPatch(project, {
      schemaVersion: 1,
      transactionId: "agent-layout-1",
      expectedRevision: 0,
      occurredAt: "2026-08-26T10:05:00.000Z",
      provenance: {
        actor: { type: "agent", id: "architecture-agent" },
        channel: "cli",
        summary: "Lay out checkout dependencies",
      },
      model,
      operations: [
        {
          type: "project.rename",
          title: "Checkout dependencies",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      revision: 1,
      title: "Checkout dependencies",
      canvas: {
        objects: {
          payments: { name: "Payment Service" },
          ledger: { name: "Ledger" },
          writes: { name: "writes" },
        },
      },
    });
    expect(project.revision).toBe(0);
  });

  it("rejects stale patches without mutating their input", async () => {
    const before = serializeProject(project);
    const result = await applyAgentPatch(project, {
      schemaVersion: 1,
      transactionId: "agent-stale",
      expectedRevision: 3,
      occurredAt: "2026-08-26T10:05:00.000Z",
      provenance: {
        actor: { type: "agent" },
        channel: "cli",
      },
      operations: [{ type: "project.rename", title: "Should not apply" }],
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "REVISION_CONFLICT" }],
    });
    expect(serializeProject(project)).toBe(before);
  });

  it("inspects a project as stable machine-readable context", () => {
    expect(inspectProject(project)).toMatchObject({
      schemaVersion: 1,
      id: "checkout",
      title: "Checkout architecture",
      revision: 0,
      objectCount: 0,
      referenceCount: 0,
    });
  });
});

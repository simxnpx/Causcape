import {
  findCanvasReferences,
  transactProject,
  type Project,
  type ProjectOperation,
  type Result,
} from "@causcape/core";

import { layoutEngineeringModel } from "./layout";

import type { AgentPatch } from "./contracts";

export const applyAgentPatch = async (
  project: Project,
  patch: AgentPatch,
): Promise<Result<Project>> => {
  if (
    patch.schemaVersion !== 1 ||
    !patch.transactionId ||
    !Number.isInteger(patch.expectedRevision) ||
    !Number.isFinite(Date.parse(patch.occurredAt)) ||
    patch.provenance?.actor?.type !== "agent" ||
    patch.provenance?.channel !== "cli" ||
    (!patch.model && !patch.operations?.length) ||
    (patch.model &&
      patch.operations?.some(
        (operation) => operation.type === "canvas.replace",
      ))
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_TRANSACTION",
          message:
            "Patch envelope or mutually exclusive operations are invalid",
        },
      ],
    };
  }
  const operations: ProjectOperation[] = [];
  if (patch.model) {
    try {
      const layout = await layoutEngineeringModel(patch.model);
      operations.push({ type: "canvas.replace", scene: layout.scene });
      operations.push(
        ...Object.values(layout.objects).map(
          (object): ProjectOperation => ({ type: "object.upsert", object }),
        ),
      );
    } catch (error) {
      return {
        ok: false,
        issues: [
          {
            code: "INVALID_TRANSACTION",
            message:
              error instanceof Error ? error.message : "Invalid layout model",
          },
        ],
      };
    }
  }
  operations.push(...(patch.operations ?? []));
  return transactProject(project, {
    id: patch.transactionId,
    expectedRevision: patch.expectedRevision,
    occurredAt: patch.occurredAt,
    provenance: patch.provenance,
    operations,
  });
};

export const inspectProject = (project: Project) => {
  const objects = Object.values(project.canvas.objects).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return {
    schemaVersion: project.schemaVersion,
    id: project.id,
    title: project.title,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    objectCount: objects.length,
    referenceCount: objects.reduce(
      (count, object) =>
        count + findCanvasReferences(project, object.id).length,
      0,
    ),
    objects: objects.map((object) => ({
      id: object.id,
      name: object.name,
      state: object.state,
      elementIds: object.elementIds,
      metadata: object.metadata,
      references: findCanvasReferences(project, object.id),
    })),
    document: project.document,
    provenance: project.provenance,
  };
};

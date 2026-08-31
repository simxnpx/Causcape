import type {
  CanvasObject,
  DataFlowScenario,
  DataFlowStep,
} from "@causcape/core";
import type { OrderedCauscapeElement } from "@causcape/element/types";

export type DataFlowObjectOption = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
};

export type ResolvedDataFlowTransition = {
  readonly edgeElementId: string;
  readonly direction: "forward" | "reverse";
};

export type ResolvedDataFlowPlayback = {
  readonly activeStep: DataFlowStep;
  readonly activeNodeElementIds: readonly string[];
  readonly completedNodeElementIds: readonly string[];
  readonly activeTransition: ResolvedDataFlowTransition | null;
  readonly completedEdgeElementIds: readonly string[];
  readonly hasMissingConnection: boolean;
};

const NON_STEP_OBJECT_KINDS = new Set([
  "flow",
  "relationship",
  "trust-boundary",
]);

export const getDataFlowObjectOptions = (
  objects: Readonly<Record<string, CanvasObject>>,
): readonly DataFlowObjectOption[] =>
  Object.values(objects)
    .filter((object) => {
      const kind = object.metadata.kind;
      return (
        object.state === "active" &&
        typeof kind === "string" &&
        !NON_STEP_OBJECT_KINDS.has(kind)
      );
    })
    .map((object) => ({
      id: object.id,
      name: object.name ?? object.id,
      kind: String(object.metadata.kind),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

const getObjectElementIds = (
  objectId: string,
  objects: Readonly<Record<string, CanvasObject>>,
) => new Set(objects[objectId]?.elementIds ?? []);

const findTransition = (
  sourceObjectId: string,
  targetObjectId: string,
  objects: Readonly<Record<string, CanvasObject>>,
  elements: readonly OrderedCauscapeElement[],
): ResolvedDataFlowTransition | null => {
  const sourceElementIds = getObjectElementIds(sourceObjectId, objects);
  const targetElementIds = getObjectElementIds(targetObjectId, objects);
  if (!sourceElementIds.size || !targetElementIds.size) {
    return null;
  }

  for (const element of elements) {
    if (element.isDeleted || element.type !== "causcape-edge") {
      continue;
    }
    if (
      sourceElementIds.has(element.causcape.fromNodeId) &&
      targetElementIds.has(element.causcape.toNodeId)
    ) {
      return { edgeElementId: element.id, direction: "forward" };
    }
    if (
      sourceElementIds.has(element.causcape.toNodeId) &&
      targetElementIds.has(element.causcape.fromNodeId)
    ) {
      return { edgeElementId: element.id, direction: "reverse" };
    }
  }
  return null;
};

export const resolveDataFlowPlayback = (
  flow: DataFlowScenario,
  stepIndex: number,
  objects: Readonly<Record<string, CanvasObject>>,
  elements: readonly OrderedCauscapeElement[],
): ResolvedDataFlowPlayback => {
  const activeStep =
    flow.steps[Math.max(0, Math.min(stepIndex, flow.steps.length - 1))];
  const activeNodeElementIds = [
    ...(objects[activeStep.objectId]?.elementIds ?? []),
  ];
  const activeNodeIds = new Set(activeNodeElementIds);
  const completedNodeElementIds = [
    ...new Set(
      flow.steps
        .slice(0, stepIndex)
        .flatMap((step) => objects[step.objectId]?.elementIds ?? [])
        .filter((elementId) => !activeNodeIds.has(elementId)),
    ),
  ];
  const transitions = flow.steps
    .slice(1, stepIndex + 1)
    .map((step, index) =>
      findTransition(
        flow.steps[index].objectId,
        step.objectId,
        objects,
        elements,
      ),
    );
  const activeTransition = stepIndex > 0 ? transitions.at(-1) ?? null : null;
  const staysOnCurrentObject =
    stepIndex > 0 &&
    flow.steps[stepIndex - 1]?.objectId === activeStep.objectId;
  const activeEdgeId = activeTransition?.edgeElementId;
  const completedEdgeElementIds = [
    ...new Set(
      transitions
        .slice(0, -1)
        .map((transition) => transition?.edgeElementId)
        .filter(
          (elementId): elementId is string =>
            Boolean(elementId) && elementId !== activeEdgeId,
        ),
    ),
  ];

  return {
    activeStep,
    activeNodeElementIds,
    completedNodeElementIds,
    activeTransition,
    completedEdgeElementIds,
    hasMissingConnection:
      activeNodeElementIds.length === 0 ||
      (stepIndex > 0 && !staysOnCurrentObject && activeTransition === null),
  };
};

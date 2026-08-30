import { randomId } from "@causcape/common";
import { convertToCauscapeElements } from "@causcape/element";

import type { CauscapeElementSkeleton } from "@causcape/element";
import type { OrderedCauscapeElement } from "@causcape/element/types";
import type { AppState } from "@causcape/causcape/types";

import type { CanvasObject, MetadataValue } from "@causcape/core";

export type PreparedEngineeringShapeKind =
  | "service"
  | "database"
  | "queue"
  | "external-system"
  | "actor"
  | "trust-boundary"
  | "resource"
  | "flow"
  | "flow-bidirectional"
  | "flow-interrupted";

type PreparedEngineeringShape = {
  readonly kind: PreparedEngineeringShapeKind;
  readonly label: string;
  readonly elementType: "rectangle" | "ellipse" | "diamond" | "arrow";
  readonly width: number;
  readonly height: number;
  readonly strokeColor: string;
  readonly backgroundColor: string;
  readonly strokeStyle?: "solid" | "dashed";
  readonly objectKind?: string;
  readonly metadata?: Readonly<Record<string, MetadataValue>>;
  readonly startArrowhead?: "arrow";
  readonly endArrowhead?: "arrow";
};

export const PREPARED_ENGINEERING_SHAPES: readonly PreparedEngineeringShape[] =
  [
    {
      kind: "service",
      label: "Service",
      elementType: "rectangle",
      width: 220,
      height: 100,
      strokeColor: "#1971c2",
      backgroundColor: "#dbeafe",
    },
    {
      kind: "database",
      label: "Database",
      elementType: "ellipse",
      width: 210,
      height: 110,
      strokeColor: "#2b8a3e",
      backgroundColor: "#d3f9d8",
    },
    {
      kind: "queue",
      label: "Queue / Topic",
      elementType: "rectangle",
      width: 220,
      height: 90,
      strokeColor: "#6741d9",
      backgroundColor: "#e5dbff",
      strokeStyle: "dashed",
    },
    {
      kind: "external-system",
      label: "External System",
      elementType: "diamond",
      width: 220,
      height: 130,
      strokeColor: "#d9480f",
      backgroundColor: "#ffe8cc",
    },
    {
      kind: "actor",
      label: "User / Actor",
      elementType: "ellipse",
      width: 180,
      height: 110,
      strokeColor: "#a07900",
      backgroundColor: "#fff3bf",
    },
    {
      kind: "trust-boundary",
      label: "Trust Boundary",
      elementType: "rectangle",
      width: 300,
      height: 180,
      strokeColor: "#495057",
      backgroundColor: "transparent",
      strokeStyle: "dashed",
    },
    {
      kind: "resource",
      label: "Generic Resource",
      elementType: "rectangle",
      width: 220,
      height: 100,
      strokeColor: "#495057",
      backgroundColor: "#e9ecef",
    },
    {
      kind: "flow",
      label: "Flow / Packets",
      elementType: "arrow",
      width: 260,
      height: 0,
      strokeColor: "#4263eb",
      backgroundColor: "transparent",
      endArrowhead: "arrow",
    },
    {
      kind: "flow-bidirectional",
      label: "Bidirectional flow",
      elementType: "arrow",
      width: 260,
      height: 0,
      strokeColor: "#7048e8",
      backgroundColor: "transparent",
      objectKind: "flow",
      metadata: { direction: "bidirectional" },
      startArrowhead: "arrow",
      endArrowhead: "arrow",
    },
    {
      kind: "flow-interrupted",
      label: "Interrupted flow",
      elementType: "arrow",
      width: 260,
      height: 0,
      strokeColor: "#e03131",
      backgroundColor: "transparent",
      strokeStyle: "dashed",
      objectKind: "flow",
      metadata: { status: "interrupted" },
      endArrowhead: "arrow",
    },
  ];

type CauscapeElementData = {
  readonly objectId?: string;
  readonly name?: string;
  readonly kind?: string;
  readonly prepared?: boolean;
  readonly metadata?: Readonly<Record<string, MetadataValue>>;
};

const getCauscapeData = (
  element: OrderedCauscapeElement,
): CauscapeElementData => {
  if (element.type === "causcape-node") {
    const { label, kind } = element.causcape;
    const environment =
      typeof element.causcape.environment === "string"
        ? element.causcape.environment
        : undefined;
    const health =
      typeof element.causcape.health === "string"
        ? element.causcape.health
        : undefined;
    return {
      name: label,
      kind,
      metadata: {
        kind,
        ...(environment ? { environment } : {}),
        ...(health ? { health } : {}),
      },
    };
  }
  if (element.type === "causcape-edge") {
    return {
      name: element.causcape.label,
      kind: "relationship",
      metadata: {
        kind: "relationship",
        fromNodeId: element.causcape.fromNodeId,
        toNodeId: element.causcape.toNodeId,
      },
    };
  }
  return (element.customData?.causcape ?? {}) as CauscapeElementData;
};

const getObjectId = (
  element: OrderedCauscapeElement,
  elementsById: ReadonlyMap<string, OrderedCauscapeElement>,
): string => {
  const data = getCauscapeData(element);
  if ((data.prepared || data.objectId) && element.groupIds.length) {
    return element.groupIds[element.groupIds.length - 1];
  }
  if (typeof data.objectId === "string" && data.objectId) {
    return data.objectId;
  }
  if (element.type === "text" && element.containerId) {
    const container = elementsById.get(element.containerId);
    if (container) {
      return getObjectId(container, elementsById);
    }
  }
  return element.id;
};

export const createPreparedEngineeringShape = ({
  kind,
  name,
  x,
  y,
  objectId = randomId(),
}: {
  readonly kind: PreparedEngineeringShapeKind;
  readonly name?: string;
  readonly x: number;
  readonly y: number;
  readonly objectId?: string;
}): OrderedCauscapeElement[] => {
  const preparedShape = PREPARED_ENGINEERING_SHAPES.find(
    (shape) => shape.kind === kind,
  );
  if (!preparedShape) {
    throw new Error(`Unknown prepared engineering shape ${kind}`);
  }
  const objectName = name?.trim() || preparedShape.label;
  const objectKind = preparedShape.objectKind ?? kind;
  const elementData = {
    causcape: {
      kind: objectKind,
      name: objectName,
      prepared: true,
      metadata: { kind: objectKind, ...(preparedShape.metadata ?? {}) },
    },
  };
  const commonSkeleton = {
    x,
    y,
    width: preparedShape.width,
    height: preparedShape.height,
    strokeColor: preparedShape.strokeColor,
    backgroundColor: preparedShape.backgroundColor,
    fillStyle: "solid" as const,
    strokeWidth: preparedShape.elementType === "arrow" ? 3 : 2,
    strokeStyle: preparedShape.strokeStyle ?? ("solid" as const),
    groupIds: [objectId],
    customData: elementData,
    label: {
      text: objectName,
      fontSize: 20,
      groupIds: [objectId],
      customData: elementData,
    },
  };
  const skeleton: CauscapeElementSkeleton =
    preparedShape.elementType === "arrow"
      ? {
          ...commonSkeleton,
          id: `${objectId}-flow`,
          type: "arrow",
          startArrowhead: preparedShape.startArrowhead ?? null,
          endArrowhead: preparedShape.endArrowhead ?? "arrow",
          roughness: 0,
        }
      : {
          ...commonSkeleton,
          id: `${objectId}-shape`,
          type: preparedShape.elementType,
        };
  return convertToCauscapeElements([skeleton], {
    regenerateIds: false,
  }) as OrderedCauscapeElement[];
};

export const deriveCanvasObjects = (
  elements: readonly OrderedCauscapeElement[],
  previousObjects: Readonly<Record<string, CanvasObject>>,
): Readonly<Record<string, CanvasObject>> => {
  const elementsById = new Map(
    elements.map((element) => [element.id, element]),
  );
  const grouped = new Map<string, OrderedCauscapeElement[]>();
  for (const element of elements) {
    const objectId = getObjectId(element, elementsById);
    grouped.set(objectId, [...(grouped.get(objectId) ?? []), element]);
  }

  const objects: Record<string, CanvasObject> = {};
  for (const [objectId, objectElements] of grouped) {
    const previous = previousObjects[objectId];
    const activeElements = objectElements.filter(
      (element) => !element.isDeleted,
    );
    const textName = activeElements.find(
      (element) => element.type === "text" && element.text.trim(),
    );
    const data = objectElements.map(getCauscapeData);
    const isPrepared = data.some((entry) => entry.prepared);
    const storedName = data.find(
      (entry) => typeof entry.name === "string" && entry.name.trim(),
    )?.name;
    const name =
      (textName?.type === "text" ? textName.text.trim() : undefined) ||
      storedName?.trim() ||
      previous?.name;
    const embeddedMetadata = data.find((entry) => entry.metadata)?.metadata;
    const kind = data.find(
      (entry) => typeof entry.kind === "string" && entry.kind,
    )?.kind;
    const state = activeElements.length ? "active" : "deleted";
    objects[objectId] = {
      id: objectId,
      elementIds:
        state === "active" ? activeElements.map((element) => element.id) : [],
      ...(name ? { name } : {}),
      metadata: {
        ...(!isPrepared ? previous?.metadata ?? {} : {}),
        ...(embeddedMetadata ?? {}),
        ...(kind ? { kind } : {}),
      },
      state,
      ...(state === "deleted" && (previous?.name || name)
        ? { lastKnownName: previous?.name || name }
        : {}),
    };
  }
  return objects;
};

export const getSelectedCanvasObjectIds = (
  elements: readonly OrderedCauscapeElement[],
  selectedElementIds: AppState["selectedElementIds"],
): readonly string[] => {
  const elementsById = new Map(
    elements.map((element) => [element.id, element]),
  );
  const objectIds = new Set<string>();
  for (const element of elements) {
    if (selectedElementIds[element.id]) {
      objectIds.add(getObjectId(element, elementsById));
    }
  }
  return [...objectIds];
};

export const getCanvasObjectIdForElement = (
  element: OrderedCauscapeElement,
  elements: readonly OrderedCauscapeElement[],
) => getObjectId(element, new Map(elements.map((entry) => [entry.id, entry])));

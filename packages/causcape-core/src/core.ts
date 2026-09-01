import type {
  CanvasObject,
  CanvasReference,
  CauscapeDocument,
  CreateProjectFromTemplateOptions,
  DataFlowScenario,
  DocumentBlock,
  JsonValue,
  MetadataValue,
  OpenedProject,
  Project,
  ProjectIssue,
  ProjectTransaction,
  ReferenceLocation,
  ResolvedCanvasReference,
  Result,
} from "./types";

const EMPTY_SCENE = { elements: [], appState: {}, files: {} } as const;

const TEMPLATE_SECTIONS = {
  architecture: [
    "Overview",
    "Goals and constraints",
    "Components",
    "Main flows",
    "Decisions",
    "Risks and failure modes",
    "Open questions",
  ],
  "post-incident": [
    "Summary",
    "Impact",
    "Detection",
    "Timeline",
    "Technical explanation",
    "Root cause and contributing factors",
    "Mitigation and recovery",
    "Follow-up actions",
    "Lessons learned",
  ],
} as const;

const issue = (
  code: ProjectIssue["code"],
  message: string,
  detail: Partial<Omit<ProjectIssue, "code" | "message">> = {},
): ProjectIssue => ({ code, message, ...detail });

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateMetadata = (
  metadata: Record<string, MetadataValue>,
  path: string,
) => {
  const issues: ProjectIssue[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    const validScalar =
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value));
    const validUrl =
      isRecord(value) &&
      value.type === "url" &&
      typeof value.value === "string" &&
      (() => {
        try {
          new URL(value.value);
          return true;
        } catch {
          return false;
        }
      })();
    if (!validScalar && !validUrl) {
      issues.push(
        issue("INVALID_METADATA", `Invalid metadata value for ${key}`, {
          path: `${path}.${key}`,
        }),
      );
    }
  }
  return issues;
};

const walkBlocks = (
  blocks: readonly DocumentBlock[],
  visit: (block: DocumentBlock) => void,
) => {
  for (const block of blocks) {
    visit(block);
    walkBlocks(block.children, visit);
  }
};

const DATA_FLOW_SIGNALS = new Set([
  "default",
  "success",
  "cache-miss",
  "error",
]);

const validateDataFlows = (project: Project): ProjectIssue[] => {
  const flows = project.canvas.dataFlows ?? [];
  if (!Array.isArray(flows)) {
    return [
      issue("INVALID_PROJECT", "Project data flows must be an array", {
        path: "canvas.dataFlows",
      }),
    ];
  }

  const issues: ProjectIssue[] = [];
  const flowIds = new Set<string>();
  flows.forEach((flow, flowIndex) => {
    const flowPath = `canvas.dataFlows.${flowIndex}`;
    if (!flow.id?.trim() || !flow.name?.trim() || flowIds.has(flow.id)) {
      issues.push(
        issue(
          "INVALID_PROJECT",
          "Data flow identity must be unique and named",
          {
            path: flowPath,
          },
        ),
      );
    }
    flowIds.add(flow.id);
    if (!Array.isArray(flow.steps) || flow.steps.length < 2) {
      issues.push(
        issue("INVALID_PROJECT", "A data flow requires at least two steps", {
          path: `${flowPath}.steps`,
        }),
      );
      return;
    }

    const stepIds = new Set<string>();
    flow.steps.forEach(
      (step: DataFlowScenario["steps"][number], stepIndex: number) => {
        const stepPath = `${flowPath}.steps.${stepIndex}`;
        if (
          !step.id?.trim() ||
          !step.title?.trim() ||
          stepIds.has(step.id) ||
          !DATA_FLOW_SIGNALS.has(step.signal)
        ) {
          issues.push(
            issue("INVALID_PROJECT", "Data flow step is invalid", {
              path: stepPath,
            }),
          );
        }
        stepIds.add(step.id);
        if (!project.canvas.objects[step.objectId]) {
          issues.push(
            issue(
              "UNKNOWN_OBJECT",
              `Data flow step targets unknown object ${step.objectId}`,
              { path: stepPath },
            ),
          );
        }
      },
    );
  });
  return issues;
};

const validateProject = (project: Project): ProjectIssue[] => {
  const issues: ProjectIssue[] = [];
  if (project.schemaVersion !== 1) {
    issues.push(
      issue(
        "UNSUPPORTED_SCHEMA_VERSION",
        `Unsupported schema version ${project.schemaVersion}`,
      ),
    );
    return issues;
  }
  if (
    !project.id ||
    !project.title ||
    !Number.isInteger(project.revision) ||
    project.revision < 0
  ) {
    issues.push(
      issue(
        "INVALID_PROJECT",
        "Project identity, title, or revision is invalid",
      ),
    );
  }
  if (project.document.schemaVersion !== 1) {
    issues.push(
      issue("INVALID_DOCUMENT", "Unsupported document schema version"),
    );
  }

  const blockIds = new Set<string>();
  walkBlocks(project.document.blocks, (block) => {
    if (!block.id || blockIds.has(block.id)) {
      issues.push(
        issue(
          "DUPLICATE_ID",
          `Duplicate or empty document block ID ${block.id}`,
          { path: "document.blocks" },
        ),
      );
    }
    blockIds.add(block.id);
    block.content.forEach((content, contentIndex) => {
      if (content.type !== "canvas-reference") {
        return;
      }
      if (!project.canvas.objects[content.objectId]) {
        issues.push(
          issue(
            "DANGLING_REFERENCE",
            `Reference targets unknown object ${content.objectId}`,
            {
              path: `document.blocks.${block.id}.content.${contentIndex}`,
            },
          ),
        );
      }
    });
  });

  for (const [objectId, object] of Object.entries(project.canvas.objects)) {
    if (object.id !== objectId) {
      issues.push(
        issue(
          "INVARIANT_VIOLATION",
          `Canvas object key does not match ID ${objectId}`,
        ),
      );
    }
    if (object.state === "active" && object.elementIds.length === 0) {
      issues.push(
        issue(
          "INVARIANT_VIOLATION",
          `Active object ${objectId} has no elements`,
        ),
      );
    }
    if (object.state === "deleted" && object.elementIds.length > 0) {
      issues.push(
        issue(
          "INVARIANT_VIOLATION",
          `Deleted object ${objectId} still owns elements`,
        ),
      );
    }
    issues.push(
      ...validateMetadata(
        object.metadata as Record<string, MetadataValue>,
        `canvas.objects.${objectId}.metadata`,
      ),
    );
  }
  issues.push(...validateDataFlows(project));
  return issues;
};

const applyOperation = (
  project: Project,
  operation: ProjectTransaction["operations"][number],
): ProjectIssue[] => {
  switch (operation.type) {
    case "project.create":
      return [
        issue(
          "INVALID_TRANSACTION",
          "project.create is only valid for a new project",
        ),
      ];
    case "project.rename":
      if (!operation.title.trim()) {
        return [issue("INVALID_TRANSACTION", "Project title cannot be empty")];
      }
      (project as { title: string }).title = operation.title.trim();
      return [];
    case "canvas.replace":
      (project.canvas as { scene: typeof operation.scene }).scene = clone(
        operation.scene,
      );
      return [];
    case "object.upsert":
      (project.canvas.objects as Record<string, CanvasObject>)[
        operation.object.id
      ] = clone(operation.object);
      return [];
    case "object.rename": {
      const object = project.canvas.objects[operation.objectId];
      if (!object || object.state === "deleted") {
        return [
          issue(
            "UNKNOWN_OBJECT",
            `Unknown active object ${operation.objectId}`,
          ),
        ];
      }
      (project.canvas.objects as Record<string, CanvasObject>)[
        operation.objectId
      ] = {
        ...object,
        name: operation.name.trim(),
      };
      return [];
    }
    case "object.delete": {
      const object = project.canvas.objects[operation.objectId];
      if (!object || object.state === "deleted") {
        return [
          issue(
            "UNKNOWN_OBJECT",
            `Unknown active object ${operation.objectId}`,
          ),
        ];
      }
      (project.canvas.objects as Record<string, CanvasObject>)[
        operation.objectId
      ] = {
        ...object,
        state: "deleted",
        elementIds: [],
        lastKnownName: object.name,
      };
      return [];
    }
    case "object.restore": {
      const object = project.canvas.objects[operation.objectId];
      if (
        !object ||
        object.state !== "deleted" ||
        operation.elementIds.length === 0
      ) {
        return [
          issue(
            "UNKNOWN_OBJECT",
            `Unknown deleted object ${operation.objectId}`,
          ),
        ];
      }
      (project.canvas.objects as Record<string, CanvasObject>)[
        operation.objectId
      ] = {
        ...object,
        state: "active",
        elementIds: [...operation.elementIds],
      };
      return [];
    }
    case "object.metadata.set": {
      const object = project.canvas.objects[operation.objectId];
      if (!object) {
        return [
          issue("UNKNOWN_OBJECT", `Unknown object ${operation.objectId}`),
        ];
      }
      (project.canvas.objects as Record<string, CanvasObject>)[
        operation.objectId
      ] = {
        ...object,
        metadata: {
          ...object.metadata,
          [operation.key]: clone(operation.value),
        },
      };
      return [];
    }
    case "object.metadata.delete": {
      const object = project.canvas.objects[operation.objectId];
      if (!object) {
        return [
          issue("UNKNOWN_OBJECT", `Unknown object ${operation.objectId}`),
        ];
      }
      const metadata = { ...object.metadata };
      delete metadata[operation.key];
      (project.canvas.objects as Record<string, CanvasObject>)[
        operation.objectId
      ] = {
        ...object,
        metadata,
      };
      return [];
    }
    case "data-flow.upsert": {
      const flows = [...(project.canvas.dataFlows ?? [])];
      const existingIndex = flows.findIndex(
        (flow) => flow.id === operation.flow.id,
      );
      if (existingIndex === -1) {
        flows.push(clone(operation.flow));
      } else {
        flows[existingIndex] = clone(operation.flow);
      }
      (
        project.canvas as {
          dataFlows: readonly DataFlowScenario[];
        }
      ).dataFlows = flows;
      return [];
    }
    case "data-flow.delete": {
      const flows = project.canvas.dataFlows ?? [];
      if (!flows.some((flow) => flow.id === operation.flowId)) {
        return [
          issue("INVALID_TRANSACTION", `Unknown data flow ${operation.flowId}`),
        ];
      }
      (
        project.canvas as {
          dataFlows: readonly DataFlowScenario[];
        }
      ).dataFlows = flows.filter((flow) => flow.id !== operation.flowId);
      return [];
    }
    case "document.replace":
      (project as { document: CauscapeDocument }).document = clone(
        operation.document,
      );
      return [];
  }
};

export const transactProject = (
  current: Project | null,
  transaction: ProjectTransaction,
): Result<Project> => {
  if (!transaction.id || !Number.isFinite(Date.parse(transaction.occurredAt))) {
    return {
      ok: false,
      issues: [
        issue("INVALID_TRANSACTION", "Transaction ID or timestamp is invalid"),
      ],
    };
  }

  if (current === null) {
    const [create, ...remaining] = transaction.operations;
    if (
      transaction.expectedRevision !== null ||
      create?.type !== "project.create" ||
      remaining.some((operation) => operation.type === "project.create")
    ) {
      return {
        ok: false,
        issues: [
          issue(
            "INVALID_TRANSACTION",
            "New projects require one leading project.create operation",
          ),
        ],
      };
    }
    const project: Project = {
      schemaVersion: 1,
      id: create.id,
      title: create.title.trim(),
      createdAt: transaction.occurredAt,
      updatedAt: transaction.occurredAt,
      revision: 0,
      canvas: { scene: EMPTY_SCENE, objects: {}, dataFlows: [] },
      document: clone(create.document),
      provenance: [
        {
          ...clone(transaction.provenance),
          transactionId: transaction.id,
          revision: 0,
          occurredAt: transaction.occurredAt,
        },
      ],
    };
    const operationIssues = remaining.flatMap((operation, operationIndex) =>
      applyOperation(project, operation).map((entry) => ({
        ...entry,
        operationIndex: operationIndex + 1,
      })),
    );
    const issues = [...operationIssues, ...validateProject(project)];
    return issues.length ? { ok: false, issues } : { ok: true, value: project };
  }

  if (transaction.expectedRevision !== current.revision) {
    return {
      ok: false,
      issues: [
        issue(
          "REVISION_CONFLICT",
          "Transaction revision does not match project",
          {
            expected: transaction.expectedRevision,
            actual: current.revision,
          },
        ),
      ],
    };
  }
  if (
    current.provenance.some((entry) => entry.transactionId === transaction.id)
  ) {
    return {
      ok: false,
      issues: [
        issue("DUPLICATE_ID", `Transaction ${transaction.id} already exists`),
      ],
    };
  }

  const draft = clone(current);
  const operationIssues = transaction.operations.flatMap(
    (operation, operationIndex) =>
      applyOperation(draft, operation).map((entry) => ({
        ...entry,
        operationIndex,
      })),
  );
  if (operationIssues.length) {
    return { ok: false, issues: operationIssues };
  }
  (draft as { revision: number }).revision += 1;
  (draft as { updatedAt: string }).updatedAt = transaction.occurredAt;
  (
    draft.provenance as typeof draft.provenance extends readonly (infer T)[]
      ? T[]
      : never
  ).push({
    ...clone(transaction.provenance),
    transactionId: transaction.id,
    revision: draft.revision,
    occurredAt: transaction.occurredAt,
  });
  const issues = validateProject(draft);
  return issues.length ? { ok: false, issues } : { ok: true, value: draft };
};

export const createProjectFromTemplate = (
  options: CreateProjectFromTemplateOptions,
): Project => {
  const sections =
    options.template === "blank" ? [] : TEMPLATE_SECTIONS[options.template];
  const blocks: DocumentBlock[] = sections.flatMap((section, index) => {
    const sectionId = section
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const heading: DocumentBlock = {
      id: `${options.id}-${sectionId}-heading`,
      type: "heading",
      props: { level: index === 0 ? 1 : 2 },
      content: [{ type: "text", text: section }],
      children: [],
    };
    const body: DocumentBlock = {
      id: `${options.id}-${sectionId}-body`,
      type: "paragraph",
      props: {},
      content: [],
      children: [],
    };
    return [heading, body];
  });
  if (blocks.length === 0) {
    blocks.push({
      id: `${options.id}-body`,
      type: "paragraph",
      props: {},
      content: [],
      children: [],
    });
  }

  const result = transactProject(null, {
    id: `create-${options.id}`,
    expectedRevision: null,
    occurredAt: options.occurredAt,
    provenance: options.provenance,
    operations: [
      {
        type: "project.create",
        id: options.id,
        title: options.title,
        document: { schemaVersion: 1, blocks },
      },
    ],
  });
  if (!result.ok) {
    throw new Error(result.issues.map((entry) => entry.message).join("; "));
  }
  return result.value;
};

const canonicalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child as JsonValue)]),
    );
  }
  return value;
};

export const serializeProject = (project: Project): string =>
  JSON.stringify(canonicalize(project as unknown as JsonValue), null, 2);

export const openProject = (
  source: string | JsonValue,
): Result<OpenedProject> => {
  let parsed: unknown;
  try {
    parsed = typeof source === "string" ? JSON.parse(source) : clone(source);
  } catch {
    return {
      ok: false,
      issues: [issue("INVALID_JSON", "Project is not valid JSON")],
    };
  }
  if (!isRecord(parsed)) {
    return {
      ok: false,
      issues: [issue("INVALID_PROJECT", "Project must be a JSON object")],
    };
  }
  if (parsed.schemaVersion !== 1) {
    return {
      ok: false,
      issues: [
        issue(
          "UNSUPPORTED_SCHEMA_VERSION",
          `Unsupported schema version ${String(parsed.schemaVersion)}`,
        ),
      ],
    };
  }
  const project = parsed as unknown as Project;
  const issues = validateProject(project);
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: { project, migration: null } };
};

export const findCanvasReferences = (
  project: Project,
  objectId: string,
): readonly ReferenceLocation[] => {
  const locations: ReferenceLocation[] = [];
  walkBlocks(project.document.blocks, (block) => {
    block.content.forEach((content, contentIndex) => {
      if (
        content.type === "canvas-reference" &&
        content.objectId === objectId
      ) {
        locations.push({ blockId: block.id, contentIndex });
      }
    });
  });
  return locations;
};

export const resolveCanvasReference = (
  project: Project,
  reference: CanvasReference,
): ResolvedCanvasReference => {
  const object = project.canvas.objects[reference.objectId];
  if (!object) {
    return {
      status: "missing",
      objectId: reference.objectId,
      displayText: "Deleted object",
    };
  }
  if (object.state === "deleted") {
    return {
      status: "deleted",
      objectId: reference.objectId,
      displayText: "Deleted object",
    };
  }
  return {
    status: "active",
    objectId: reference.objectId,
    displayText: reference.labelOverride || object.name || "Unnamed object",
  };
};

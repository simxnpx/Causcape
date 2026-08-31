export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type MetadataValue =
  | string
  | number
  | boolean
  | { type: "url"; value: string };

export type CanvasReference = {
  readonly type: "canvas-reference";
  readonly objectId: string;
  readonly labelOverride?: string;
};

export type InlineContent =
  | {
      readonly type: "text";
      readonly text: string;
      readonly styles?: Record<string, boolean>;
    }
  | {
      readonly type: "link";
      readonly href: string;
      readonly content: readonly { text: string }[];
    }
  | CanvasReference;

export type DocumentBlock = {
  readonly id: string;
  readonly type:
    | "paragraph"
    | "heading"
    | "bullet-list-item"
    | "numbered-list-item"
    | "check-list-item"
    | "code-block"
    | "callout";
  readonly props: Readonly<Record<string, JsonPrimitive>>;
  readonly content: readonly InlineContent[];
  readonly children: readonly DocumentBlock[];
};

export type CauscapeDocument = {
  readonly schemaVersion: 1;
  readonly blocks: readonly DocumentBlock[];
};

export type ProjectTemplate = "blank" | "architecture" | "post-incident";

export type CreateProjectFromTemplateOptions = {
  readonly id: string;
  readonly title: string;
  readonly template: ProjectTemplate;
  readonly occurredAt: string;
  readonly provenance: Provenance;
};

export type SerializedScene = {
  readonly elements: readonly Readonly<Record<string, JsonValue>>[];
  readonly appState: Readonly<Record<string, JsonValue>>;
  readonly files: Readonly<Record<string, JsonValue>>;
};

export type CanvasObject = {
  readonly id: string;
  readonly elementIds: readonly string[];
  readonly name?: string;
  readonly description?: string;
  readonly metadata: Readonly<Record<string, MetadataValue>>;
  readonly state: "active" | "deleted";
  readonly lastKnownName?: string;
};

export type DataFlowStepSignal = "default" | "success" | "cache-miss" | "error";

export type DataFlowStep = {
  readonly id: string;
  readonly objectId: string;
  readonly title: string;
  readonly description?: string;
  readonly signal: DataFlowStepSignal;
};

export type DataFlowScenario = {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly DataFlowStep[];
};

export type Provenance = {
  readonly actor: {
    readonly type: "human" | "agent" | "system";
    readonly id?: string;
  };
  readonly channel: "browser" | "cli" | "webmcp";
  readonly summary?: string;
  readonly sourceReferences?: readonly string[];
};

export type ProvenanceEntry = Provenance & {
  readonly transactionId: string;
  readonly revision: number;
  readonly occurredAt: string;
};

export type Project = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly canvas: {
    readonly scene: SerializedScene;
    readonly objects: Readonly<Record<string, CanvasObject>>;
    /** Optional for backwards compatibility with projects created before
     * ordered data-flow playback was introduced. */
    readonly dataFlows?: readonly DataFlowScenario[];
  };
  readonly document: CauscapeDocument;
  readonly provenance: readonly ProvenanceEntry[];
};

export type ProjectOperation =
  | {
      readonly type: "project.create";
      readonly id: string;
      readonly title: string;
      readonly document: CauscapeDocument;
    }
  | { readonly type: "project.rename"; readonly title: string }
  | { readonly type: "canvas.replace"; readonly scene: SerializedScene }
  | { readonly type: "object.upsert"; readonly object: CanvasObject }
  | {
      readonly type: "object.rename";
      readonly objectId: string;
      readonly name: string;
    }
  | { readonly type: "object.delete"; readonly objectId: string }
  | {
      readonly type: "object.restore";
      readonly objectId: string;
      readonly elementIds: readonly string[];
    }
  | {
      readonly type: "object.metadata.set";
      readonly objectId: string;
      readonly key: string;
      readonly value: MetadataValue;
    }
  | {
      readonly type: "object.metadata.delete";
      readonly objectId: string;
      readonly key: string;
    }
  | { readonly type: "data-flow.upsert"; readonly flow: DataFlowScenario }
  | { readonly type: "data-flow.delete"; readonly flowId: string }
  | { readonly type: "document.replace"; readonly document: CauscapeDocument };

export type ProjectTransaction = {
  readonly id: string;
  readonly expectedRevision: number | null;
  readonly occurredAt: string;
  readonly provenance: Provenance;
  readonly operations: readonly ProjectOperation[];
};

export type ProjectIssue = {
  readonly code:
    | "INVALID_JSON"
    | "INVALID_PROJECT"
    | "UNSUPPORTED_SCHEMA_VERSION"
    | "REVISION_CONFLICT"
    | "INVALID_TRANSACTION"
    | "DUPLICATE_ID"
    | "UNKNOWN_OBJECT"
    | "DANGLING_REFERENCE"
    | "INVALID_DOCUMENT"
    | "INVALID_METADATA"
    | "INVARIANT_VIOLATION";
  readonly message: string;
  readonly path?: string;
  readonly operationIndex?: number;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
};

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ProjectIssue[] };

export type OpenedProject = {
  readonly project: Project;
  readonly migration: null | {
    readonly from: number;
    readonly to: number;
    readonly applied: readonly number[];
  };
};

export type ReferenceLocation = {
  readonly blockId: string;
  readonly contentIndex: number;
};

export type ResolvedCanvasReference = {
  readonly status: "active" | "deleted" | "missing";
  readonly objectId: string;
  readonly displayText: string;
};

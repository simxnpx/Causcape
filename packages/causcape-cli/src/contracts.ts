import type { ProjectOperation, Provenance } from "@causcape/core";

export type EngineeringNodeKind =
  | "service"
  | "database"
  | "queue"
  | "external-system"
  | "actor"
  | "trust-boundary"
  | "resource";

export type EngineeringModel = {
  readonly direction?: "RIGHT" | "DOWN";
  readonly nodes: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind?: EngineeringNodeKind;
    readonly width?: number;
    readonly height?: number;
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly name?: string;
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  }[];
};

export type AgentPatch = {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly expectedRevision: number;
  readonly occurredAt: string;
  readonly provenance: Provenance;
  readonly model?: EngineeringModel;
  readonly operations?: readonly ProjectOperation[];
};

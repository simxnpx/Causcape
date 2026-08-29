/**
 * Small, in-memory provenance seam for agent-owned graph mutations.
 *
 * The ledger deliberately stores only the active segment. A segment starts at
 * an explicit/implicit agent session boundary, or after a scene fingerprint
 * changes outside the ledger (a user edit). Rollback therefore cannot cross a
 * user change and only restores entities touched in the active segment.
 */

export type ProvenanceActor = "agent" | "user";

export type ProvenanceEntity<T = unknown> = Readonly<{
  id: string;
  value: T;
}>;

export type AgentSessionInfo = Readonly<{
  sessionId: string | null;
  revision: number;
  segmentId: string | null;
  mutationCount: number;
  touchedEntityIds: readonly string[];
}>;

export type AgentMutationRecord = Readonly<{
  actor: "agent";
  sessionId: string;
  segmentId: string;
  revision: number;
  touchedEntityIds: readonly string[];
}>;

export type AgentRollbackResult<T> = Readonly<{
  rolledBack: boolean;
  reason:
    | "rolled-back"
    | "no-agent-changes"
    | "user-change-detected"
    | "session-mismatch";
  sessionId: string | null;
  revision: number;
  segmentId: string | null;
  touchedEntityIds: readonly string[];
  restoredEntityIds: readonly string[];
  removedEntityIds: readonly string[];
  entities: readonly ProvenanceEntity<T>[];
}>;

export type GraphProvenance<T = unknown> = Readonly<{
  beginSession: (
    entities: readonly ProvenanceEntity<T>[],
    sessionId?: string,
  ) => AgentSessionInfo;
  startMutation: (entities: readonly ProvenanceEntity<T>[]) => {
    sessionId: string;
    segmentId: string;
    revision: number;
  };
  commitMutation: (
    context: { sessionId: string; segmentId: string; revision: number },
    entities: readonly ProvenanceEntity<T>[],
  ) => AgentMutationRecord | null;
  noteUserChange: (entities: readonly ProvenanceEntity<T>[]) => void;
  rollback: (
    entities: readonly ProvenanceEntity<T>[],
    sessionId?: string,
  ) => AgentRollbackResult<T>;
  getState: () => AgentSessionInfo;
}>;

const valueFingerprint = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    // Scene elements are JSON serializable. This fallback keeps the ledger
    // safe if a future adapter passes a non-serializable value.
    return String(value);
  }
};

const entityMap = <T>(
  entities: readonly ProvenanceEntity<T>[],
): Map<string, T> =>
  new Map(entities.map((entity) => [entity.id, entity.value]));

const entitiesFingerprint = <T>(
  entities: readonly ProvenanceEntity<T>[],
): string =>
  JSON.stringify(
    [...entities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entity) => [entity.id, valueFingerprint(entity.value)]),
  );

const changedIds = <T>(
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
): string[] => {
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids]
    .filter((id) => {
      const beforeValue = before.get(id);
      const afterValue = after.get(id);
      if (!before.has(id) || !after.has(id)) {
        return true;
      }
      return valueFingerprint(beforeValue) !== valueFingerprint(afterValue);
    })
    .sort((a, b) => a.localeCompare(b));
};

const toEntities = <T>(map: ReadonlyMap<string, T>): ProvenanceEntity<T>[] =>
  [...map].map(([id, value]) => ({ id, value }));

type ActiveSegment<T> = {
  segmentId: string;
  baseEntities: Map<string, T>;
  touchedEntityIds: Set<string>;
  mutationCount: number;
};

/** Create a deterministic, in-memory checkpoint ledger for one MCP bridge. */
export const createGraphProvenance = <T = unknown>(): GraphProvenance<T> => {
  let sessionId: string | null = null;
  let sessionSerial = 0;
  let segmentSerial = 0;
  let revision = 0;
  let active: ActiveSegment<T> | null = null;
  let lastFingerprint: string | null = null;

  const state = (): AgentSessionInfo => ({
    sessionId,
    revision,
    segmentId: active?.segmentId ?? null,
    mutationCount: active?.mutationCount ?? 0,
    touchedEntityIds: active
      ? [...active.touchedEntityIds].sort((a, b) => a.localeCompare(b))
      : [],
  });

  const beginSession = (
    entities: readonly ProvenanceEntity<T>[],
    requestedSessionId?: string,
  ): AgentSessionInfo => {
    const requested = requestedSessionId?.trim();
    sessionSerial += 1;
    sessionId = requested || `agent-session-${sessionSerial}`;
    active = null;
    lastFingerprint = entitiesFingerprint(entities);
    return state();
  };

  const startMutation = (
    entities: readonly ProvenanceEntity<T>[],
  ): { sessionId: string; segmentId: string; revision: number } => {
    const fingerprint = entitiesFingerprint(entities);
    if (!sessionId) {
      beginSession(entities);
    } else if (lastFingerprint !== fingerprint) {
      // A scene change not produced by this ledger is a hard user boundary.
      active = null;
      revision += 1;
      lastFingerprint = fingerprint;
    }

    if (!active) {
      segmentSerial += 1;
      active = {
        segmentId: `${sessionId}:segment-${segmentSerial}`,
        baseEntities: entityMap(entities),
        touchedEntityIds: new Set(),
        mutationCount: 0,
      };
    }

    return {
      sessionId: sessionId as string,
      segmentId: active.segmentId,
      revision,
    };
  };

  const commitMutation = (
    context: { sessionId: string; segmentId: string; revision: number },
    entities: readonly ProvenanceEntity<T>[],
  ): AgentMutationRecord | null => {
    if (
      !active ||
      context.sessionId !== sessionId ||
      context.segmentId !== active.segmentId
    ) {
      return null;
    }

    const after = entityMap(entities);
    const before = new Map(active.baseEntities);
    const touched = changedIds(before, after);
    lastFingerprint = entitiesFingerprint(entities);
    if (touched.length === 0) {
      return null;
    }

    touched.forEach((id) => active?.touchedEntityIds.add(id));
    active.mutationCount += 1;
    revision += 1;
    return {
      actor: "agent",
      sessionId: sessionId as string,
      segmentId: active.segmentId,
      revision,
      touchedEntityIds: touched,
    };
  };

  const noteUserChange = (entities: readonly ProvenanceEntity<T>[]): void => {
    const fingerprint = entitiesFingerprint(entities);
    if (fingerprint === lastFingerprint) {
      return;
    }
    active = null;
    revision += 1;
    lastFingerprint = fingerprint;
  };

  const rollback = (
    entities: readonly ProvenanceEntity<T>[],
    requestedSessionId?: string,
  ): AgentRollbackResult<T> => {
    const fingerprint = entitiesFingerprint(entities);
    if (requestedSessionId && requestedSessionId !== sessionId) {
      return {
        rolledBack: false,
        reason: "session-mismatch",
        sessionId,
        revision,
        segmentId: active?.segmentId ?? null,
        touchedEntityIds: [],
        restoredEntityIds: [],
        removedEntityIds: [],
        entities,
      };
    }
    if (!active || active.mutationCount === 0) {
      if (fingerprint !== lastFingerprint) {
        active = null;
        revision += 1;
        lastFingerprint = fingerprint;
      }
      return {
        rolledBack: false,
        reason:
          fingerprint !== lastFingerprint
            ? "user-change-detected"
            : "no-agent-changes",
        sessionId,
        revision,
        segmentId: null,
        touchedEntityIds: [],
        restoredEntityIds: [],
        removedEntityIds: [],
        entities,
      };
    }
    if (fingerprint !== lastFingerprint) {
      // Never overwrite a user edit made after the latest agent mutation.
      active = null;
      revision += 1;
      lastFingerprint = fingerprint;
      return {
        rolledBack: false,
        reason: "user-change-detected",
        sessionId,
        revision,
        segmentId: null,
        touchedEntityIds: [],
        restoredEntityIds: [],
        removedEntityIds: [],
        entities,
      };
    }

    const current = entityMap(entities);
    const restoredEntityIds: string[] = [];
    const removedEntityIds: string[] = [];
    for (const id of active.touchedEntityIds) {
      if (active.baseEntities.has(id)) {
        current.set(id, active.baseEntities.get(id) as T);
        restoredEntityIds.push(id);
      } else if (current.delete(id)) {
        removedEntityIds.push(id);
      }
    }
    const restored = toEntities(current);
    const rolledBackSegmentId = active.segmentId;
    const touchedEntityIds = [...active.touchedEntityIds].sort((a, b) =>
      a.localeCompare(b),
    );
    active = null;
    revision += 1;
    lastFingerprint = entitiesFingerprint(restored);
    return {
      rolledBack: true,
      reason: "rolled-back",
      sessionId,
      revision,
      segmentId: rolledBackSegmentId,
      touchedEntityIds,
      restoredEntityIds: restoredEntityIds.sort((a, b) => a.localeCompare(b)),
      removedEntityIds: removedEntityIds.sort((a, b) => a.localeCompare(b)),
      entities: restored,
    };
  };

  return {
    beginSession,
    startMutation,
    commitMutation,
    noteUserChange,
    rollback,
    getState: state,
  };
};

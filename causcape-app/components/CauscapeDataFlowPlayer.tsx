import { useMemo, useState } from "react";

import { randomId } from "@causcape/common";
import {
  CloseIcon,
  chevronLeftIcon,
  chevronRight,
  playerPlayIcon,
  playerStopFilledIcon,
} from "@causcape/causcape/components/icons";

import type {
  CanvasObject,
  DataFlowScenario,
  DataFlowStep,
  DataFlowStepSignal,
} from "@causcape/core";

import { getDataFlowObjectOptions } from "../data/dataFlowScenarios";

import "./CauscapeDataFlowPlayer.scss";

type CauscapeDataFlowPanelProps = {
  objects: Readonly<Record<string, CanvasObject>>;
  flows: readonly DataFlowScenario[];
  onSave: (flow: DataFlowScenario) => void;
  onDelete: (flowId: string) => void;
  onStart: (flowId: string) => void;
};

const SIGNAL_OPTIONS: readonly {
  value: DataFlowStepSignal;
  label: string;
}[] = [
  { value: "default", label: "In progress" },
  { value: "success", label: "Success" },
  { value: "cache-miss", label: "Cache miss" },
  { value: "error", label: "Error" },
];

const newFlow = (): DataFlowScenario => ({
  id: randomId(),
  name: "",
  steps: [],
});

export const CauscapeDataFlowPanel = ({
  objects,
  flows,
  onSave,
  onDelete,
  onStart,
}: CauscapeDataFlowPanelProps) => {
  const options = useMemo(() => getDataFlowObjectOptions(objects), [objects]);
  const [draft, setDraft] = useState<DataFlowScenario | null>(null);

  const updateStep = (stepId: string, update: Partial<DataFlowStep>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.id === stepId ? { ...step, ...update } : step,
            ),
          }
        : current,
    );
  };

  const moveStep = (stepIndex: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const nextIndex = stepIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.steps.length) {
        return current;
      }
      const steps = [...current.steps];
      [steps[stepIndex], steps[nextIndex]] = [
        steps[nextIndex],
        steps[stepIndex],
      ];
      return { ...current, steps };
    });
  };

  if (draft) {
    const canSave =
      Boolean(draft.name.trim()) &&
      draft.steps.length >= 2 &&
      draft.steps.every(
        (step) => Boolean(step.objectId) && Boolean(step.title.trim()),
      );
    return (
      <form
        className="causcape-data-flow-panel causcape-data-flow-panel--editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) {
            return;
          }
          onSave({
            ...draft,
            name: draft.name.trim(),
            steps: draft.steps.map((step) => ({
              ...step,
              title: step.title.trim(),
              ...(step.description?.trim()
                ? { description: step.description.trim() }
                : { description: undefined }),
            })),
          });
          setDraft(null);
        }}
      >
        <header className="causcape-data-flow-panel__header">
          <div>
            <span>Flow scenario</span>
            <strong>
              {flows.some((flow) => flow.id === draft.id)
                ? "Edit flow"
                : "New flow"}
            </strong>
          </div>
          <button type="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </header>

        <label className="causcape-data-flow-panel__name">
          Flow name
          <input
            aria-label="Flow name"
            placeholder="Cache-backed checkout read"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, name: event.target.value } : current,
              )
            }
          />
        </label>

        <div className="causcape-data-flow-panel__steps">
          {draft.steps.map((step, index) => (
            <section className="causcape-data-flow-step-editor" key={step.id}>
              <div className="causcape-data-flow-step-editor__rail">
                <span>{index + 1}</span>
                {index < draft.steps.length - 1 ? <i /> : null}
              </div>
              <div className="causcape-data-flow-step-editor__fields">
                <select
                  aria-label={`Step ${index + 1} object`}
                  value={step.objectId}
                  onChange={(event) =>
                    updateStep(step.id, { objectId: event.target.value })
                  }
                >
                  {options.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.name} · {option.kind}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Step ${index + 1} title`}
                  placeholder="What happens here?"
                  value={step.title}
                  onChange={(event) =>
                    updateStep(step.id, { title: event.target.value })
                  }
                />
                <textarea
                  aria-label={`Step ${index + 1} description`}
                  placeholder="Optional explanation"
                  rows={2}
                  value={step.description ?? ""}
                  onChange={(event) =>
                    updateStep(step.id, { description: event.target.value })
                  }
                />
                <select
                  aria-label={`Step ${index + 1} signal`}
                  value={step.signal}
                  onChange={(event) =>
                    updateStep(step.id, {
                      signal: event.target.value as DataFlowStepSignal,
                    })
                  }
                >
                  {SIGNAL_OPTIONS.map((signal) => (
                    <option value={signal.value} key={signal.value}>
                      {signal.label}
                    </option>
                  ))}
                </select>
                <div className="causcape-data-flow-step-editor__actions">
                  <button
                    type="button"
                    aria-label={`Move step ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move step ${index + 1} down`}
                    disabled={index === draft.steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              steps: current.steps.filter(
                                (entry) => entry.id !== step.id,
                              ),
                            }
                          : current,
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>

        {options.length ? (
          <button
            type="button"
            className="causcape-data-flow-panel__add-step"
            aria-label="Add step"
            onClick={() =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      steps: [
                        ...current.steps,
                        {
                          id: randomId(),
                          objectId: options[0].id,
                          title: `Step ${current.steps.length + 1}`,
                          signal: "default",
                        },
                      ],
                    }
                  : current,
              )
            }
          >
            <span>＋</span> Add step
          </button>
        ) : (
          <p className="causcape-data-flow-panel__empty">
            Add architecture components before creating a flow.
          </p>
        )}

        <footer className="causcape-data-flow-panel__editor-footer">
          <span>{draft.steps.length} steps · minimum 2</span>
          <button type="submit" disabled={!canSave} aria-label="Save data flow">
            Save flow
          </button>
        </footer>
      </form>
    );
  }

  return (
    <div className="causcape-data-flow-panel">
      <header className="causcape-data-flow-panel__header">
        <div>
          <span>Architecture walkthroughs</span>
          <strong>Data flow player</strong>
        </div>
        <button
          type="button"
          aria-label="Create data flow"
          disabled={!options.length}
          onClick={() => setDraft(newFlow())}
        >
          New flow
        </button>
      </header>
      <p className="causcape-data-flow-panel__intro">
        Build an ordered story from components already on this canvas.
      </p>

      {flows.length ? (
        <div className="causcape-data-flow-panel__library">
          {flows.map((flow) => (
            <article key={flow.id}>
              <div>
                <strong>{flow.name}</strong>
                <span>{flow.steps.length} steps</span>
              </div>
              <div>
                <button
                  type="button"
                  className="causcape-data-flow-panel__play"
                  aria-label={`Play ${flow.name}`}
                  onClick={() => onStart(flow.id)}
                >
                  {playerPlayIcon} Play
                </button>
                <button type="button" onClick={() => setDraft(flow)}>
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${flow.name}`}
                  onClick={() => onDelete(flow.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="causcape-data-flow-panel__empty-state">
          <span>{playerPlayIcon}</span>
          <strong>Turn architecture into a story</strong>
          <p>
            Request, cache miss, database read, response—one step at a time.
          </p>
        </div>
      )}
    </div>
  );
};

type CauscapeDataFlowPlaybackBarProps = {
  flow: DataFlowScenario;
  stepIndex: number;
  isPlaying: boolean;
  hasMissingConnection: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onClose: () => void;
};

const SIGNAL_LABELS: Record<DataFlowStepSignal, string> = {
  default: "Processing",
  success: "Success",
  "cache-miss": "Cache miss",
  error: "Error",
};

export const CauscapeDataFlowPlaybackBar = ({
  flow,
  stepIndex,
  isPlaying,
  hasMissingConnection,
  onPrevious,
  onNext,
  onPlayingChange,
  onClose,
}: CauscapeDataFlowPlaybackBarProps) => {
  const step = flow.steps[stepIndex];
  return (
    <section
      className="causcape-data-flow-playback"
      aria-label="Data flow playback"
      data-signal={step.signal}
    >
      <div className="causcape-data-flow-playback__progress" aria-hidden="true">
        {flow.steps.map((entry, index) => (
          <i
            data-state={
              index < stepIndex
                ? "done"
                : index === stepIndex
                ? "active"
                : "next"
            }
            key={entry.id}
          />
        ))}
      </div>
      <div className="causcape-data-flow-playback__identity">
        <span>{flow.name}</span>
        <strong>
          Step {stepIndex + 1} of {flow.steps.length}
        </strong>
      </div>
      <div className="causcape-data-flow-playback__copy" aria-live="polite">
        <div>
          <span data-step-signal={step.signal}>
            {SIGNAL_LABELS[step.signal]}
          </span>
          {hasMissingConnection && stepIndex > 0 ? (
            <em>Connector missing</em>
          ) : null}
        </div>
        <h2>{step.title}</h2>
        {step.description ? <p>{step.description}</p> : null}
      </div>
      <div className="causcape-data-flow-playback__controls">
        <button
          type="button"
          aria-label="Previous flow step"
          disabled={stepIndex === 0}
          onClick={onPrevious}
        >
          {chevronLeftIcon}
        </button>
        <button
          type="button"
          className="causcape-data-flow-playback__play"
          aria-label={isPlaying ? "Pause data flow" : "Play data flow"}
          onClick={() => onPlayingChange(!isPlaying)}
        >
          {isPlaying ? playerStopFilledIcon : playerPlayIcon}
        </button>
        <button
          type="button"
          aria-label="Next flow step"
          disabled={stepIndex === flow.steps.length - 1}
          onClick={onNext}
        >
          {chevronRight}
        </button>
        <button
          type="button"
          aria-label="Close data flow player"
          onClick={onClose}
        >
          {CloseIcon}
        </button>
      </div>
    </section>
  );
};

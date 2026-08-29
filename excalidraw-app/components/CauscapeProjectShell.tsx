import { useState, type ReactNode } from "react";

import "./CauscapeProjectShell.scss";

export type ProjectMode = "focus" | "document";

type CauscapeProjectShellProps = {
  canvas: ReactNode;
  document: ReactNode;
  onModeChange?: (mode: ProjectMode) => void;
};

export const CauscapeProjectShell = ({
  canvas,
  document,
  onModeChange,
}: CauscapeProjectShellProps) => {
  const [mode, setMode] = useState<ProjectMode>("focus");

  const changeMode = (nextMode: ProjectMode) => {
    setMode(nextMode);
    onModeChange?.(nextMode);
  };

  return (
    <div
      className="causcape-project-shell"
      data-mode={mode}
      data-testid="causcape-project-shell"
    >
      <section
        className="causcape-canvas-region"
        data-testid="causcape-canvas-region"
        aria-label="Engineering canvas"
      >
        <div
          className="causcape-canvas-surface"
          data-testid="causcape-canvas-surface"
        >
          {canvas}
        </div>
        {mode === "focus" ? (
          <button
            className="causcape-document-handle"
            type="button"
            onClick={() => changeMode("document")}
            aria-label="Open project document"
            title="Open project document"
          >
            <span className="causcape-document-handle__grip" aria-hidden="true">
              ›
            </span>
            <span className="causcape-document-handle__label">Document</span>
          </button>
        ) : (
          <button
            className="causcape-focus-button"
            type="button"
            onClick={() => changeMode("focus")}
            aria-label="Focus canvas"
            title="Close project document"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
      </section>

      <aside
        className="causcape-document-region"
        data-testid="causcape-document-region"
        data-pane-position="right"
        aria-label="Project document"
        aria-hidden={mode === "focus"}
      >
        {document}
      </aside>
    </div>
  );
};

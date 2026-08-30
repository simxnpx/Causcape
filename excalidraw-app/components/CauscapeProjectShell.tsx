import { useState, type ReactNode } from "react";

import { sidebarRightIcon } from "@excalidraw/excalidraw/components/icons";

import "./CauscapeProjectShell.scss";

export type ProjectMode = "focus" | "document";

type CauscapeProjectShellProps = {
  canvas: ReactNode;
  canvasControls?: ReactNode;
  document: ReactNode;
  onModeChange?: (mode: ProjectMode) => void;
};

export const CauscapeProjectShell = ({
  canvas,
  canvasControls,
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
        <div
          className="causcape-canvas-controls"
          data-testid="causcape-canvas-controls"
        >
          {canvasControls}
          <button
            className="causcape-document-toggle"
            type="button"
            onClick={() => changeMode(mode === "focus" ? "document" : "focus")}
            aria-label={
              mode === "focus" ? "Open project document" : "Focus canvas"
            }
            aria-pressed={mode === "document"}
            data-tooltip={
              mode === "focus"
                ? "Open project document"
                : "Close project document"
            }
            title={
              mode === "focus"
                ? "Open project document"
                : "Close project document"
            }
          >
            {sidebarRightIcon}
          </button>
        </div>
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

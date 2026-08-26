import type { ReactNode, WheelEvent } from "react";
import { useRef, useState } from "react";

import "./CauscapeProjectShell.scss";

export type ProjectMode = "focus" | "briefing";

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
  const shellRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLElement>(null);
  const briefingScrollTop = useRef(0);

  const changeMode = (nextMode: ProjectMode) => {
    if (nextMode === mode) {
      return;
    }
    const shell = shellRef.current;
    const ownerWindow = shell?.ownerDocument.defaultView;
    if (mode === "briefing") {
      briefingScrollTop.current = shell?.scrollTop ?? 0;
    }
    setMode(nextMode);
    onModeChange?.(nextMode);

    ownerWindow?.requestAnimationFrame(() => {
      if (nextMode === "briefing") {
        if (shell) {
          shell.scrollTop = briefingScrollTop.current;
        }
        documentRef.current?.scrollIntoView?.({ block: "start" });
      }
    });
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLElement>) => {
    if (
      mode === "focus" &&
      event.deltaY > 24 &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      changeMode("briefing");
    }
  };

  return (
    <div
      ref={shellRef}
      className="causcape-project-shell"
      data-mode={mode}
      data-testid="causcape-project-shell"
    >
      <section
        className="causcape-canvas-region"
        data-testid="causcape-canvas-region"
        aria-label="Engineering canvas"
        onWheel={handleCanvasWheel}
      >
        <div className="causcape-canvas-surface">{canvas}</div>
        {mode === "focus" ? (
          <button
            className="causcape-document-handle"
            type="button"
            onClick={() => changeMode("briefing")}
            aria-label="Open project document"
          >
            <span
              aria-hidden="true"
              className="causcape-document-handle__grip"
            />
            Project document
          </button>
        ) : (
          <button
            className="causcape-focus-button"
            type="button"
            onClick={() => changeMode("focus")}
            aria-label="Focus canvas"
          >
            Focus canvas
          </button>
        )}
      </section>

      <main ref={documentRef} className="causcape-document-region">
        {document}
      </main>
    </div>
  );
};

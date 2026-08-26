import { useRef, useState, type ReactNode, type WheelEvent } from "react";

import "./CauscapeProjectShell.scss";

export type ProjectMode = "focus" | "briefing";

type CauscapeProjectShellProps = {
  canvas: ReactNode;
  document: ReactNode;
  onModeChange?: (mode: ProjectMode) => void;
};

const REVEAL_WHEEL_DISTANCE = 600;
const BRIEFING_CANVAS_HEIGHT_VH = 45;

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

export const CauscapeProjectShell = ({
  canvas,
  document,
  onModeChange,
}: CauscapeProjectShellProps) => {
  const [revealProgress, setRevealProgress] = useState(0);
  const documentRef = useRef<HTMLElement>(null);
  const mode: ProjectMode = revealProgress === 0 ? "focus" : "briefing";
  const canvasHeight = 100 - revealProgress * (100 - BRIEFING_CANVAS_HEIGHT_VH);

  const setProgress = (value: number) => {
    const nextProgress = clampProgress(value);
    const nextMode: ProjectMode = nextProgress === 0 ? "focus" : "briefing";
    if (nextMode !== mode) {
      onModeChange?.(nextMode);
    }
    setRevealProgress(nextProgress);
  };

  const adjustProgress = (deltaY: number) => {
    setProgress(revealProgress + deltaY / REVEAL_WHEEL_DISTANCE);
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) {
      return;
    }
    if (event.deltaY > 0 || revealProgress > 0) {
      event.preventDefault();
      event.stopPropagation();
      adjustProgress(event.deltaY);
    }
  };

  const handleDocumentWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) {
      return;
    }
    const documentAtTop = (documentRef.current?.scrollTop ?? 0) <= 0;
    const shouldResizeForDownwardScroll =
      event.deltaY > 0 && revealProgress < 1;
    const shouldResizeForUpwardScroll = event.deltaY < 0 && documentAtTop;
    if (shouldResizeForDownwardScroll || shouldResizeForUpwardScroll) {
      event.preventDefault();
      event.stopPropagation();
      adjustProgress(event.deltaY);
    }
  };

  return (
    <div
      className="causcape-project-shell"
      data-mode={mode}
      data-reveal-progress={String(Number(revealProgress.toFixed(3)))}
      data-testid="causcape-project-shell"
    >
      <section
        className="causcape-canvas-region"
        data-testid="causcape-canvas-region"
        aria-label="Engineering canvas"
        style={{ height: `${Number(canvasHeight.toFixed(3))}dvh` }}
        onWheelCapture={handleCanvasWheel}
      >
        <div className="causcape-canvas-surface">{canvas}</div>
        {mode === "focus" ? (
          <button
            className="causcape-document-handle"
            type="button"
            onClick={() => setProgress(1)}
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
            onClick={() => setProgress(0)}
            aria-label="Focus canvas"
          >
            Focus canvas
          </button>
        )}
      </section>

      <main
        ref={documentRef}
        className="causcape-document-region"
        data-testid="causcape-document-region"
        aria-hidden={mode === "focus"}
        onWheelCapture={handleDocumentWheel}
      >
        {document}
      </main>
    </div>
  );
};

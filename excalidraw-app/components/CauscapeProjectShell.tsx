import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react";

import "./CauscapeProjectShell.scss";

export type ProjectMode = "focus" | "briefing";

type CauscapeProjectShellProps = {
  canvas: ReactNode;
  document: ReactNode;
  onModeChange?: (mode: ProjectMode) => void;
};

const REVEAL_WHEEL_DISTANCE = 600;
const REVEAL_ANIMATION_DURATION = 180;
const SURFACE_RESIZE_SETTLE_DELAY = 100;
const BRIEFING_CANVAS_HEIGHT_VH = 45;

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));
const canvasHeightForProgress = (progress: number) =>
  Number((100 - progress * (100 - BRIEFING_CANVAS_HEIGHT_VH)).toFixed(3));

export const CauscapeProjectShell = ({
  canvas,
  document,
  onModeChange,
}: CauscapeProjectShellProps) => {
  const [mode, setMode] = useState<ProjectMode>("focus");
  const modeRef = useRef<ProjectMode>("focus");
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRegionRef = useRef<HTMLElement>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLElement>(null);
  const revealProgressRef = useRef(0);
  const surfaceProgressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const previousFrameTimeRef = useRef<number | null>(null);
  const deferSurfaceResizeRef = useRef(false);
  const surfaceResizeTimeoutRef = useRef<number | null>(null);

  const changeMode = (nextMode: ProjectMode) => {
    if (modeRef.current !== nextMode) {
      modeRef.current = nextMode;
      setMode(nextMode);
      onModeChange?.(nextMode);
    }
  };

  const renderProgress = (progress: number) => {
    const roundedProgress = Number(progress.toFixed(3));
    revealProgressRef.current = roundedProgress;
    if (shellRef.current) {
      shellRef.current.dataset.revealProgress = String(roundedProgress);
    }
    if (canvasRegionRef.current) {
      canvasRegionRef.current.style.height = `${canvasHeightForProgress(
        roundedProgress,
      )}dvh`;
    }
  };

  const resizeCanvasSurface = (progress: number) => {
    const roundedProgress = Number(progress.toFixed(3));
    surfaceProgressRef.current = roundedProgress;
    if (canvasSurfaceRef.current) {
      canvasSurfaceRef.current.style.height = `${canvasHeightForProgress(
        roundedProgress,
      )}dvh`;
    }
  };

  const cancelAnimation = () => {
    const ownerWindow = shellRef.current?.ownerDocument.defaultView;
    if (animationFrameRef.current !== null) {
      ownerWindow?.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    previousFrameTimeRef.current = null;
  };

  const cancelSurfaceResizeDelay = () => {
    const ownerWindow = shellRef.current?.ownerDocument.defaultView;
    if (surfaceResizeTimeoutRef.current !== null) {
      ownerWindow?.clearTimeout(surfaceResizeTimeoutRef.current);
      surfaceResizeTimeoutRef.current = null;
    }
  };

  const deferCanvasSurfaceResize = () => {
    const ownerWindow = shellRef.current?.ownerDocument.defaultView;
    cancelSurfaceResizeDelay();
    deferSurfaceResizeRef.current = true;
    if (ownerWindow) {
      surfaceResizeTimeoutRef.current = ownerWindow.setTimeout(() => {
        surfaceResizeTimeoutRef.current = null;
        deferSurfaceResizeRef.current = false;
        if (animationFrameRef.current === null) {
          resizeCanvasSurface(targetProgressRef.current);
        }
      }, SURFACE_RESIZE_SETTLE_DELAY);
    }
  };

  function scheduleAnimation() {
    if (animationFrameRef.current !== null) {
      return;
    }
    const ownerWindow = shellRef.current?.ownerDocument.defaultView;
    if (ownerWindow) {
      animationFrameRef.current = ownerWindow.requestAnimationFrame(animate);
    }
  }

  function animate(frameTime: number) {
    animationFrameRef.current = null;
    const previousFrameTime = previousFrameTimeRef.current ?? frameTime - 16;
    const elapsed = Math.min(32, Math.max(1, frameTime - previousFrameTime));
    previousFrameTimeRef.current = frameTime;

    const currentProgress = revealProgressRef.current;
    const targetProgress = targetProgressRef.current;
    const distance = targetProgress - currentProgress;
    const maximumStep = elapsed / REVEAL_ANIMATION_DURATION;
    const nextProgress =
      Math.abs(distance) <= maximumStep
        ? targetProgress
        : currentProgress + Math.sign(distance) * maximumStep;

    renderProgress(nextProgress);
    if (nextProgress !== targetProgress) {
      scheduleAnimation();
      return;
    }

    previousFrameTimeRef.current = null;
    if (!deferSurfaceResizeRef.current) {
      resizeCanvasSurface(targetProgress);
    }
    if (targetProgress === 0) {
      changeMode("focus");
    }
  }

  const prepareSurfaceForProgress = (
    nextProgress: number,
    deferSurfaceResize: boolean,
  ) => {
    if (deferSurfaceResize) {
      deferCanvasSurfaceResize();
    } else {
      cancelSurfaceResizeDelay();
      deferSurfaceResizeRef.current = false;
    }
    // Expand Excalidraw before revealing more of it. During shrink, keep its
    // viewport stable and clip it until the transition completes.
    if (nextProgress < surfaceProgressRef.current) {
      resizeCanvasSurface(deferSurfaceResize ? 0 : nextProgress);
    }
    if (nextProgress > 0) {
      changeMode("briefing");
    }
  };

  const requestProgress = (value: number) => {
    const nextProgress = clampProgress(value);
    targetProgressRef.current = nextProgress;
    prepareSurfaceForProgress(nextProgress, false);
    scheduleAnimation();
  };

  // Wheel is 1:1 with the split. Interpolating here is what made markdown
  // scrolling feel like it was chasing the gesture.
  const applyProgressImmediate = (value: number) => {
    const nextProgress = clampProgress(value);
    targetProgressRef.current = nextProgress;
    cancelAnimation();
    prepareSurfaceForProgress(nextProgress, true);
    renderProgress(nextProgress);
    if (nextProgress === 0) {
      changeMode("focus");
    }
  };

  const scrollDocumentBy = (deltaY: number) => {
    if (documentRef.current && deltaY > 0) {
      documentRef.current.scrollTop += deltaY;
    }
  };

  const consumeRevealWheel = (deltaY: number) => {
    const nextUnclamped =
      targetProgressRef.current + deltaY / REVEAL_WHEEL_DISTANCE;
    applyProgressImmediate(nextUnclamped);
    if (deltaY > 0 && nextUnclamped > 1) {
      return Math.round((nextUnclamped - 1) * REVEAL_WHEEL_DISTANCE);
    }
    return 0;
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) {
      return;
    }
    if (
      event.deltaY > 0 ||
      targetProgressRef.current > 0 ||
      revealProgressRef.current > 0
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY > 0 && targetProgressRef.current >= 1) {
        scrollDocumentBy(event.deltaY);
        return;
      }
      scrollDocumentBy(consumeRevealWheel(event.deltaY));
    }
  };

  const handleDocumentWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) {
      return;
    }
    const documentAtTop = (documentRef.current?.scrollTop ?? 0) <= 0;
    const shouldResizeForDownwardScroll =
      event.deltaY > 0 && targetProgressRef.current < 1;
    const shouldResizeForUpwardScroll = event.deltaY < 0 && documentAtTop;
    if (shouldResizeForDownwardScroll || shouldResizeForUpwardScroll) {
      event.preventDefault();
      event.stopPropagation();
      scrollDocumentBy(consumeRevealWheel(event.deltaY));
    }
  };

  useEffect(
    () => () => {
      cancelAnimation();
      cancelSurfaceResizeDelay();
    },
    [],
  );

  return (
    <div
      ref={shellRef}
      className="causcape-project-shell"
      data-mode={mode}
      data-reveal-progress={String(revealProgressRef.current)}
      data-testid="causcape-project-shell"
    >
      <section
        ref={canvasRegionRef}
        className="causcape-canvas-region"
        data-testid="causcape-canvas-region"
        aria-label="Engineering canvas"
        style={{
          height: `${canvasHeightForProgress(revealProgressRef.current)}dvh`,
        }}
        onWheelCapture={handleCanvasWheel}
      >
        <div
          ref={canvasSurfaceRef}
          className="causcape-canvas-surface"
          data-testid="causcape-canvas-surface"
          style={{
            height: `${canvasHeightForProgress(surfaceProgressRef.current)}dvh`,
          }}
        >
          {canvas}
        </div>
        {mode === "focus" ? (
          <button
            className="causcape-document-handle"
            type="button"
            onClick={() => requestProgress(1)}
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
            onClick={() => requestProgress(0)}
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

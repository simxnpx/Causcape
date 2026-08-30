import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { sidebarRightIcon } from "@excalidraw/excalidraw/components/icons";

import "./CauscapeProjectShell.scss";

export type ProjectMode = "focus" | "document";

const DOCUMENT_PANE_STORAGE_KEY = "causcape.documentPaneWidth";
const MIN_DOCUMENT_PANE_WIDTH = 320;
const DEFAULT_MIN_DOCUMENT_PANE_WIDTH = 384;
const MAX_DOCUMENT_PANE_WIDTH = 704;
const MIN_CANVAS_WIDTH = 480;
const KEYBOARD_RESIZE_STEP = 24;

const getMaximumPaneWidth = (shellWidth: number) =>
  Math.max(
    MIN_DOCUMENT_PANE_WIDTH,
    Math.min(MAX_DOCUMENT_PANE_WIDTH, shellWidth - MIN_CANVAS_WIDTH),
  );

const clampPaneWidth = (width: number, shellWidth: number) =>
  Math.min(
    getMaximumPaneWidth(shellWidth),
    Math.max(MIN_DOCUMENT_PANE_WIDTH, Math.round(width)),
  );

const getDefaultPaneWidth = (viewportWidth: number, shellWidth: number) =>
  clampPaneWidth(
    Math.max(DEFAULT_MIN_DOCUMENT_PANE_WIDTH, viewportWidth * 0.38),
    shellWidth,
  );

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
  const [paneWidth, setPaneWidth] = useState(MIN_DOCUMENT_PANE_WIDTH);
  const [maximumPaneWidth, setMaximumPaneWidth] = useState(
    MAX_DOCUMENT_PANE_WIDTH,
  );
  const [isResizing, setIsResizing] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const documentRegionRef = useRef<HTMLElement>(null);
  const paneWidthRef = useRef(paneWidth);
  const hasExplicitPaneWidthRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const getShellWidth = useCallback(() => {
    const shell = shellRef.current;
    const ownerWindow = shell?.ownerDocument.defaultView;
    return shell?.getBoundingClientRect().width || ownerWindow?.innerWidth || 0;
  }, []);

  const persistPaneWidth = useCallback((width: number) => {
    const ownerWindow = shellRef.current?.ownerDocument.defaultView;
    try {
      ownerWindow?.localStorage.setItem(
        DOCUMENT_PANE_STORAGE_KEY,
        String(width),
      );
    } catch {
      // Resizing remains available when browser storage is unavailable.
    }
  }, []);

  const applyPaneWidth = useCallback(
    (width: number, persist = true, commitState = true) => {
      const nextWidth = clampPaneWidth(width, getShellWidth());
      paneWidthRef.current = nextWidth;
      hasExplicitPaneWidthRef.current = true;
      shellRef.current?.style.setProperty(
        "--causcape-document-pane-width",
        `${nextWidth}px`,
      );
      if (commitState) {
        setPaneWidth(nextWidth);
      }
      if (persist) {
        persistPaneWidth(nextWidth);
      }
      return nextWidth;
    },
    [getShellWidth, persistPaneWidth],
  );

  useEffect(() => {
    const shell = shellRef.current;
    const ownerWindow = shell?.ownerDocument.defaultView;
    if (!shell || !ownerWindow) {
      return;
    }

    const updateBounds = () => {
      const maxWidth = getMaximumPaneWidth(getShellWidth());
      setMaximumPaneWidth(maxWidth);
      if (hasExplicitPaneWidthRef.current) {
        applyPaneWidth(paneWidthRef.current);
      }
    };

    try {
      const storedWidth = Number(
        ownerWindow.localStorage.getItem(DOCUMENT_PANE_STORAGE_KEY),
      );
      if (Number.isFinite(storedWidth) && storedWidth > 0) {
        applyPaneWidth(storedWidth, false);
      } else {
        const defaultWidth = getDefaultPaneWidth(
          ownerWindow.innerWidth,
          getShellWidth(),
        );
        paneWidthRef.current = defaultWidth;
        setPaneWidth(defaultWidth);
      }
    } catch {
      // The CSS default remains in effect when browser storage is unavailable.
    }
    updateBounds();
    ownerWindow.addEventListener("resize", updateBounds);
    return () => {
      ownerWindow.removeEventListener("resize", updateBounds);
      resizeCleanupRef.current?.();
    };
  }, [applyPaneWidth, getShellWidth]);

  const changeMode = (nextMode: ProjectMode) => {
    setMode(nextMode);
    onModeChange?.(nextMode);
  };

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    resizeCleanupRef.current?.();

    const ownerDocument = event.currentTarget.ownerDocument;
    const startX = event.clientX;
    const measuredWidth =
      documentRegionRef.current?.getBoundingClientRect().width ?? 0;
    const startWidth = measuredWidth || paneWidthRef.current;
    let nextWidth = startWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = applyPaneWidth(
        startWidth + startX - moveEvent.clientX,
        false,
        false,
      );
    };
    const cleanup = () => {
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", finishResize);
      ownerDocument.removeEventListener("pointercancel", finishResize);
      resizeCleanupRef.current = null;
      setIsResizing(false);
    };
    const finishResize = () => {
      cleanup();
      applyPaneWidth(nextWidth);
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", finishResize);
    ownerDocument.addEventListener("pointercancel", finishResize);
    resizeCleanupRef.current = cleanup;
    setIsResizing(true);
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? KEYBOARD_RESIZE_STEP * 3
      : KEYBOARD_RESIZE_STEP;
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") {
      nextWidth = paneWidthRef.current + step;
    } else if (event.key === "ArrowRight") {
      nextWidth = paneWidthRef.current - step;
    } else if (event.key === "Home") {
      nextWidth = MIN_DOCUMENT_PANE_WIDTH;
    } else if (event.key === "End") {
      nextWidth = maximumPaneWidth;
    }
    if (nextWidth !== null) {
      event.preventDefault();
      applyPaneWidth(nextWidth);
    }
  };

  const resetPaneWidth = () => {
    const shell = shellRef.current;
    const ownerWindow = shell?.ownerDocument.defaultView;
    shell?.style.removeProperty("--causcape-document-pane-width");
    hasExplicitPaneWidthRef.current = false;
    const defaultWidth = getDefaultPaneWidth(
      ownerWindow?.innerWidth ?? 0,
      getShellWidth(),
    );
    paneWidthRef.current = defaultWidth;
    setPaneWidth(defaultWidth);
    try {
      ownerWindow?.localStorage.removeItem(DOCUMENT_PANE_STORAGE_KEY);
    } catch {
      // The visual reset still succeeds when browser storage is unavailable.
    }
  };

  return (
    <div
      ref={shellRef}
      className="causcape-project-shell"
      data-mode={mode}
      data-resizing={isResizing || undefined}
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
        ref={documentRegionRef}
        className="causcape-document-region"
        data-testid="causcape-document-region"
        data-pane-position="right"
        aria-label="Project document"
        aria-hidden={mode === "focus"}
      >
        {mode === "document" ? (
          <div
            className="causcape-document-resizer"
            role="separator"
            aria-label="Resize project document"
            aria-orientation="vertical"
            aria-valuemin={MIN_DOCUMENT_PANE_WIDTH}
            aria-valuemax={maximumPaneWidth}
            aria-valuenow={paneWidth}
            tabIndex={0}
            title="Drag to resize · Double-click to reset"
            onPointerDown={handleResizePointerDown}
            onKeyDown={handleResizeKeyDown}
            onDoubleClick={resetPaneWidth}
          />
        ) : null}
        <div className="causcape-document-scroll">{document}</div>
      </aside>
    </div>
  );
};

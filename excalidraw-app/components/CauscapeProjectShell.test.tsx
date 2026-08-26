import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CauscapeProjectShell } from "./CauscapeProjectShell";

const installAnimationFrameHarness = () => {
  vi.useFakeTimers();
  let frameTime = 0;
  let nextFrameId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    nextFrameId += 1;
    callbacks.set(nextFrameId, callback);
    return nextFrameId;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
    callbacks.delete(frameId);
  });

  return {
    flush: () => {
      while (callbacks.size > 0) {
        const [frameId, callback] = callbacks.entries().next().value!;
        callbacks.delete(frameId);
        frameTime += 20;
        callback(frameTime);
      }
    },
    settle: () => {
      vi.advanceTimersByTime(200);
    },
  };
};

describe("CauscapeProjectShell", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens in Focus mode and reveals a sticky document briefing", () => {
    const animation = installAnimationFrameHarness();
    const onModeChange = vi.fn();
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
        onModeChange={onModeChange}
      />,
    );

    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "focus",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open project document" }),
    );

    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "briefing",
    );
    expect(screen.getByText("Project overview")).toBeVisible();
    expect(onModeChange).toHaveBeenLastCalledWith("briefing");

    act(() => animation.flush());

    fireEvent.click(screen.getByRole("button", { name: "Focus canvas" }));
    act(() => animation.flush());
    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "focus",
    );
  });

  it("shrinks the canvas progressively until the document owns the viewport remainder", () => {
    const animation = installAnimationFrameHarness();
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
      />,
    );

    const canvasRegion = screen.getByTestId("causcape-canvas-region");
    const canvasSurface = screen.getByTestId("causcape-canvas-surface");
    const documentRegion = screen.getByTestId("causcape-document-region");

    fireEvent.wheel(canvasRegion, {
      deltaY: 120,
    });

    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "briefing",
    );
    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-reveal-progress",
      "0",
    );
    expect(canvasSurface).toHaveStyle({ height: "100dvh" });

    act(() => animation.flush());

    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-reveal-progress",
      "0.2",
    );
    expect(canvasRegion).toHaveStyle({ height: "89dvh" });
    expect(canvasSurface).toHaveStyle({ height: "100dvh" });

    act(() => animation.settle());
    expect(canvasSurface).toHaveStyle({ height: "89dvh" });
    expect(documentRegion).toBeVisible();

    fireEvent.wheel(canvasRegion, { deltaY: 480 });
    act(() => animation.flush());
    expect(canvasRegion).toHaveStyle({ height: "45dvh" });
  });

  it("scrolls inside the document and expands the canvas only from its top", () => {
    const animation = installAnimationFrameHarness();
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
      />,
    );

    const canvasRegion = screen.getByTestId("causcape-canvas-region");
    const documentRegion = screen.getByTestId("causcape-document-region");
    fireEvent.wheel(canvasRegion, { deltaY: 600 });
    act(() => animation.flush());
    expect(canvasRegion).toHaveStyle({ height: "45dvh" });

    Object.defineProperty(documentRegion, "scrollTop", {
      configurable: true,
      value: 100,
      writable: true,
    });
    fireEvent.wheel(documentRegion, { deltaY: -120 });
    expect(canvasRegion).toHaveStyle({ height: "45dvh" });

    documentRegion.scrollTop = 0;
    fireEvent.wheel(documentRegion, { deltaY: -120 });
    act(() => animation.flush());
    expect(canvasRegion).toHaveStyle({ height: "56dvh" });

    fireEvent.wheel(documentRegion, { deltaY: -480 });
    act(() => animation.flush());
    expect(canvasRegion).toHaveStyle({ height: "100dvh" });
    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "focus",
    );
  });
});

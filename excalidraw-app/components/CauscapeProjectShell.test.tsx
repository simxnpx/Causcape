import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeProjectShell } from "./CauscapeProjectShell";

describe("CauscapeProjectShell", () => {
  it("opens in Focus mode and reveals a sticky document briefing", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Focus canvas" }));
    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "focus",
    );
  });

  it("shrinks the canvas progressively until the document owns the viewport remainder", () => {
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
      />,
    );

    const canvasRegion = screen.getByTestId("causcape-canvas-region");
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
      "0.2",
    );
    expect(canvasRegion).toHaveStyle({ height: "89dvh" });
    expect(documentRegion).toBeVisible();

    fireEvent.wheel(canvasRegion, { deltaY: 480 });
    expect(canvasRegion).toHaveStyle({ height: "45dvh" });
  });

  it("scrolls inside the document and expands the canvas only from its top", () => {
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
      />,
    );

    const canvasRegion = screen.getByTestId("causcape-canvas-region");
    const documentRegion = screen.getByTestId("causcape-document-region");
    fireEvent.wheel(canvasRegion, { deltaY: 600 });
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
    expect(canvasRegion).toHaveStyle({ height: "56dvh" });

    fireEvent.wheel(documentRegion, { deltaY: -480 });
    expect(canvasRegion).toHaveStyle({ height: "100dvh" });
    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "focus",
    );
  });
});

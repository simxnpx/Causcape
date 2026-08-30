import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeProjectShell } from "./CauscapeProjectShell";

describe("CauscapeProjectShell", () => {
  it("opens the project document as a right-side pane beside the canvas", () => {
    const onModeChange = vi.fn();
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        canvasControls={<button type="button">Engineering controls</button>}
        document={<div>Project overview</div>}
        onModeChange={onModeChange}
      />,
    );

    const shell = screen.getByTestId("causcape-project-shell");
    const canvas = screen.getByTestId("causcape-canvas-region");
    const document = screen.getByTestId("causcape-document-region");
    const canvasControls = screen.getByTestId("causcape-canvas-controls");

    expect(shell).toHaveAttribute("data-mode", "focus");
    expect(document).toHaveAttribute("aria-hidden", "true");
    expect(
      within(canvasControls).getByRole("button", {
        name: "Engineering controls",
      }),
    ).toBeVisible();
    expect(
      within(canvasControls).getByRole("button", {
        name: "Open project document",
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Open project document" }),
    );

    expect(shell).toHaveAttribute("data-mode", "document");
    expect(canvas).toBeVisible();
    expect(document).toHaveAttribute("data-pane-position", "right");
    expect(document).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByText("Project overview")).toBeVisible();
    expect(
      within(canvasControls).getByRole("button", { name: "Focus canvas" }),
    ).toBeVisible();
    expect(onModeChange).toHaveBeenLastCalledWith("document");
  });

  it("returns to the full-width canvas from the document pane", () => {
    const onModeChange = vi.fn();
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
        onModeChange={onModeChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open project document" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Focus canvas" }));

    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "focus",
    );
    expect(screen.getByTestId("causcape-document-region")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(onModeChange).toHaveBeenLastCalledWith("focus");
  });
});

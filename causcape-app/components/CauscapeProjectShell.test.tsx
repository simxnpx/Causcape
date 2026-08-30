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

  it("resizes the document pane with pointer and keyboard controls", () => {
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open project document" }),
    );
    const shell = screen.getByTestId("causcape-project-shell");
    const resizer = screen.getByRole("separator", {
      name: "Resize project document",
    });

    expect(resizer).toHaveAttribute("aria-orientation", "vertical");
    expect(resizer).toHaveAttribute("aria-valuemin", "320");
    const initialWidth = Number(resizer.getAttribute("aria-valuenow"));

    fireEvent(
      resizer,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 800,
      }),
    );
    expect(shell).toHaveAttribute("data-resizing", "true");
    fireEvent(
      resizer.ownerDocument,
      new MouseEvent("pointermove", { bubbles: true, clientX: 700 }),
    );
    fireEvent(
      resizer.ownerDocument,
      new MouseEvent("pointerup", { bubbles: true }),
    );
    expect(shell).not.toHaveAttribute("data-resizing");

    expect(shell.style.getPropertyValue("--causcape-document-pane-width")).toBe(
      `${initialWidth + 100}px`,
    );
    expect(resizer).toHaveAttribute(
      "aria-valuenow",
      String(initialWidth + 100),
    );

    fireEvent.keyDown(resizer, { key: "ArrowLeft" });
    expect(shell.style.getPropertyValue("--causcape-document-pane-width")).toBe(
      `${initialWidth + 124}px`,
    );
    expect(
      resizer.ownerDocument.defaultView?.localStorage.getItem(
        "causcape.documentPaneWidth",
      ),
    ).toBe(String(initialWidth + 124));

    fireEvent.doubleClick(resizer);
    expect(shell.style.getPropertyValue("--causcape-document-pane-width")).toBe(
      "",
    );
    expect(
      resizer.ownerDocument.defaultView?.localStorage.getItem(
        "causcape.documentPaneWidth",
      ),
    ).toBeNull();
  });
});

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

  it("treats a downward wheel gesture as intent to read", () => {
    render(
      <CauscapeProjectShell
        canvas={<div>Engineering canvas</div>}
        document={<div>Project overview</div>}
      />,
    );

    fireEvent.wheel(screen.getByTestId("causcape-canvas-region"), {
      deltaY: 40,
    });

    expect(screen.getByTestId("causcape-project-shell")).toHaveAttribute(
      "data-mode",
      "briefing",
    );
  });
});

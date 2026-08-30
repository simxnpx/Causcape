import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeProjectActions } from "./CauscapeProjectActions";

describe("CauscapeProjectActions", () => {
  it("keeps project actions behind one compact accessible menu", () => {
    const onOpenProjects = vi.fn();
    const onExport = vi.fn();
    render(
      <CauscapeProjectActions
        onOpenProjects={onOpenProjects}
        onExport={onExport}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Project actions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeVisible();

    fireEvent.click(screen.getByRole("menuitem", { name: "Export project" }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "All projects" }));
    expect(onOpenProjects).toHaveBeenCalledTimes(1);
  });

  it("closes the menu with Escape and restores focus to its trigger", () => {
    render(
      <CauscapeProjectActions onOpenProjects={vi.fn()} onExport={vi.fn()} />,
    );

    const trigger = screen.getByRole("button", { name: "Project actions" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

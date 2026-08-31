import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeDocumentHeader } from "./CauscapeDocumentHeader";

describe("CauscapeDocumentHeader", () => {
  it("shows an explicit document mode without repeating the project title", () => {
    render(<CauscapeDocumentHeader editable onEditableChange={vi.fn()} />);

    expect(screen.getByText("Project document")).toBeVisible();
    expect(
      screen.queryByText("Untitled engineering project"),
    ).not.toBeInTheDocument();

    const readMode = screen.getByRole("button", { name: "Read document" });
    const editMode = screen.getByRole("button", { name: "Edit document" });
    expect(readMode).toHaveAttribute("aria-pressed", "false");
    expect(editMode).toHaveAttribute("aria-pressed", "true");
  });

  it("selects read and edit modes directly", () => {
    const onEditableChange = vi.fn();
    const { rerender } = render(
      <CauscapeDocumentHeader editable onEditableChange={onEditableChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Read document" }));
    expect(onEditableChange).toHaveBeenLastCalledWith(false);

    rerender(
      <CauscapeDocumentHeader
        editable={false}
        onEditableChange={onEditableChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit document" }));
    expect(onEditableChange).toHaveBeenLastCalledWith(true);
  });
});

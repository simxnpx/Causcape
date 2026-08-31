import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeProjectDashboard } from "./CauscapeProjectDashboard";

describe("CauscapeProjectDashboard", () => {
  it("opens recent projects and creates either engineering template", () => {
    const onOpen = vi.fn();
    const onCreate = vi.fn();
    render(
      <CauscapeProjectDashboard
        projects={[
          {
            id: "payments",
            title: "Payments architecture",
            revision: 3,
            updatedAt: "2026-08-26T10:00:00.000Z",
          },
        ]}
        onOpen={onOpen}
        onCreate={onCreate}
        onImport={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Payments architecture"));
    fireEvent.click(screen.getByRole("button", { name: "Architecture" }));
    fireEvent.click(screen.getByRole("button", { name: "Post-incident" }));

    expect(onOpen).toHaveBeenCalledWith("payments");
    expect(onCreate).toHaveBeenNthCalledWith(1, "architecture");
    expect(onCreate).toHaveBeenNthCalledWith(2, "post-incident");
  });
});

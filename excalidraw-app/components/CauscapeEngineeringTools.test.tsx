import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeEngineeringTools } from "./CauscapeEngineeringTools";

describe("CauscapeEngineeringTools", () => {
  it("adds prepared engineering shapes from the palette", () => {
    const onAddShape = vi.fn();
    render(
      <CauscapeEngineeringTools
        selectedObject={null}
        onAddShape={onAddShape}
        onRename={vi.fn()}
        onMetadataSet={vi.fn()}
        onMetadataDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Engineering shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Service" }));

    expect(onAddShape).toHaveBeenCalledWith("service");
  });

  it("keeps object identity and metadata behind an explicit details panel", () => {
    const onRename = vi.fn();
    const onMetadataSet = vi.fn();
    render(
      <CauscapeEngineeringTools
        selectedObject={{
          id: "payment-service",
          elementIds: ["payment-service-shape"],
          name: "Payment Service",
          metadata: { kind: "service", owner: "Checkout" },
          state: "active",
        }}
        onAddShape={vi.fn()}
        onRename={onRename}
        onMetadataSet={onMetadataSet}
        onMetadataDelete={vi.fn()}
      />,
    );

    expect(screen.queryByText("payment-service")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Object details" }));

    expect(screen.getByText("payment-service")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Object name" }), {
      target: { value: "Payments API" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(onRename).toHaveBeenCalledWith("payment-service", "Payments API");

    fireEvent.change(screen.getByRole("textbox", { name: "Metadata key" }), {
      target: { value: "tier" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Metadata value" }), {
      target: { value: "critical" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    expect(onMetadataSet).toHaveBeenCalledWith(
      "payment-service",
      "tier",
      "critical",
    );
  });
});

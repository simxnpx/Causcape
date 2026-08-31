import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CauscapeEngineeringTools } from "./CauscapeEngineeringTools";

describe("CauscapeEngineeringTools", () => {
  it("uses compact accessible icon tools and clearly disables details", () => {
    const { rerender } = render(
      <CauscapeEngineeringTools
        selectedObject={null}
        onAddShape={vi.fn()}
        onRename={vi.fn()}
        onDescriptionChange={vi.fn()}
        onMetadataSet={vi.fn()}
        onMetadataDelete={vi.fn()}
      />,
    );

    const shapesButton = screen.getByRole("button", {
      name: "Engineering shapes",
    });
    const detailsButton = screen.getByRole("button", {
      name: "Object details",
    });
    expect(shapesButton.textContent).toBe("");
    expect(shapesButton.querySelector("svg")).toBeInTheDocument();
    expect(detailsButton).toBeDisabled();
    expect(detailsButton).toHaveAttribute(
      "data-tooltip",
      "Select an object to view details",
    );

    rerender(
      <CauscapeEngineeringTools
        selectedObject={{
          id: "api",
          elementIds: ["api-shape"],
          name: "API",
          metadata: { kind: "service" },
          state: "active",
        }}
        onAddShape={vi.fn()}
        onRename={vi.fn()}
        onDescriptionChange={vi.fn()}
        onMetadataSet={vi.fn()}
        onMetadataDelete={vi.fn()}
      />,
    );

    expect(detailsButton).toBeEnabled();
    expect(detailsButton).toHaveClass(
      "causcape-engineering-tools__tool--has-selection",
    );
  });

  it("adds prepared engineering shapes from the palette", () => {
    const onAddShape = vi.fn();
    render(
      <CauscapeEngineeringTools
        selectedObject={null}
        onAddShape={onAddShape}
        onRename={vi.fn()}
        onDescriptionChange={vi.fn()}
        onMetadataSet={vi.fn()}
        onMetadataDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Engineering shapes" }));
    expect(screen.getByRole("heading", { name: "Components" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Flows" })).toBeVisible();
    expect(screen.getByText("Animated one-way traffic")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Service" }));

    expect(onAddShape).toHaveBeenCalledWith("service");
  });

  it("keeps object identity and metadata behind an explicit details panel", () => {
    const onRename = vi.fn();
    const onDescriptionChange = vi.fn();
    const onMetadataSet = vi.fn();
    render(
      <CauscapeEngineeringTools
        selectedObject={{
          id: "payment-service",
          elementIds: ["payment-service-shape"],
          name: "Payment Service",
          description: "Coordinates payment authorization.",
          metadata: { kind: "service", owner: "Checkout" },
          state: "active",
        }}
        onAddShape={vi.fn()}
        onRename={onRename}
        onDescriptionChange={onDescriptionChange}
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

    fireEvent.change(
      screen.getByRole("textbox", { name: "Object description" }),
      {
        target: {
          value: "Owns authorization, retries, and provider failover.",
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(onDescriptionChange).toHaveBeenCalledWith(
      "payment-service",
      "Owns authorization, retries, and provider failover.",
    );

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

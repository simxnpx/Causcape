import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasObject, DataFlowScenario } from "@causcape/core";

import {
  CauscapeDataFlowPanel,
  CauscapeDataFlowPlaybackBar,
} from "./CauscapeDataFlowPlayer";

const objects: Readonly<Record<string, CanvasObject>> = {
  frontend: {
    id: "frontend",
    elementIds: ["frontend"],
    name: "Frontend",
    metadata: { kind: "service" },
    state: "active",
  },
  backend: {
    id: "backend",
    elementIds: ["backend"],
    name: "Backend",
    metadata: { kind: "service" },
    state: "active",
  },
};

const flow: DataFlowScenario = {
  id: "checkout-read",
  name: "Checkout read path",
  steps: [
    {
      id: "request",
      objectId: "frontend",
      title: "Send request",
      signal: "default",
    },
    {
      id: "handle",
      objectId: "backend",
      title: "Handle request",
      signal: "success",
    },
  ],
};

describe("CauscapeDataFlowPanel", () => {
  it("builds an ordered flow from existing architecture objects", () => {
    const onSave = vi.fn();
    render(
      <CauscapeDataFlowPanel
        objects={objects}
        flows={[]}
        onSave={onSave}
        onDelete={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create data flow" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Flow name" }), {
      target: { value: "Cache-backed checkout read" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Step 1 object" }), {
      target: { value: "frontend" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Step 1 title" }), {
      target: { value: "Send checkout request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Step 2 object" }), {
      target: { value: "backend" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Step 2 title" }), {
      target: { value: "Check session cache" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Step 2 signal" }), {
      target: { value: "cache-miss" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save data flow" }));

    expect(onSave).toHaveBeenCalledWith({
      id: expect.any(String),
      name: "Cache-backed checkout read",
      steps: [
        expect.objectContaining({
          objectId: "frontend",
          title: "Send checkout request",
        }),
        expect.objectContaining({
          objectId: "backend",
          title: "Check session cache",
          signal: "cache-miss",
        }),
      ],
    });
  });

  it("starts a saved flow", () => {
    const onStart = vi.fn();
    render(
      <CauscapeDataFlowPanel
        objects={objects}
        flows={[flow]}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onStart={onStart}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Play Checkout read path" }),
    );
    expect(onStart).toHaveBeenCalledWith("checkout-read");
  });
});

describe("CauscapeDataFlowPlaybackBar", () => {
  it("shows the current step and exposes deterministic playback controls", () => {
    const onNext = vi.fn();
    render(
      <CauscapeDataFlowPlaybackBar
        flow={flow}
        stepIndex={0}
        isPlaying={false}
        hasMissingConnection={false}
        onPrevious={vi.fn()}
        onNext={onNext}
        onPlayingChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Step 1 of 2")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Send request" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next flow step" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

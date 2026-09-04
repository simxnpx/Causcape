import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { compileString } from "sass";
import { describe, expect, it, vi } from "vitest";

import type { CanvasObject, DataFlowScenario } from "@causcape/core";

import {
  CauscapeDataFlowPanel,
  CauscapeDataFlowPlaybackBar,
} from "./CauscapeDataFlowPlayer";

// Compile the real stylesheet: normal SCSS imports are stubbed by Vitest.
const playbackStyles = readFileSync(
  "causcape-app/components/CauscapeDataFlowPlayer.scss",
  "utf8",
);

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

  it("keeps an incomplete flow draft from reaching project validation", () => {
    render(
      <CauscapeDataFlowPanel
        objects={objects}
        flows={[]}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create data flow" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Flow name" }), {
      target: { value: "Incomplete path" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Step 2 title" }), {
      target: { value: "" },
    });

    expect(
      screen.getByRole("button", { name: "Save data flow" }),
    ).toBeDisabled();
  });
});

describe("CauscapeDataFlowPlaybackBar", () => {
  it.each(["", "theme--dark", "dark"])(
    "preserves active and completed step colors in the %s theme",
    (theme) => {
      const { container } = render(
        <div className={theme}>
          <CauscapeDataFlowPlaybackBar
            flow={{
              ...flow,
              steps: [...flow.steps, { ...flow.steps[0], id: "response" }],
            }}
            stepIndex={1}
            isPlaying={false}
            hasMissingConnection={false}
            onPrevious={vi.fn()}
            onNext={vi.fn()}
            onPlayingChange={vi.fn()}
            onClose={vi.fn()}
          />
        </div>,
      );
      const doc = container.ownerDocument;
      const style = doc.createElement("style");
      // JSDOM does not resolve CSS variables. Resolve the success-step token
      // here so this test exercises the real theme/state selector cascade.
      style.textContent = compileString(playbackStyles).css.replaceAll(
        "var(--playback-signal)",
        "#2f9e44",
      );
      doc.head.append(style);
      try {
        const color = (selector: string) =>
          doc.defaultView!.getComputedStyle(container.querySelector(selector)!)
            .backgroundColor;
        expect(color('[data-state="active"]')).not.toBe(
          color('[data-state="next"]'),
        );
        expect(color('[data-state="done"]')).not.toBe(
          color('[data-state="next"]'),
        );
        expect(color(".causcape-data-flow-playback__play")).not.toBe(
          color('button[aria-label="Next flow step"]'),
        );
      } finally {
        style.remove();
      }
    },
  );

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

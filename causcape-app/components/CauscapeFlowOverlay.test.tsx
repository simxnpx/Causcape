import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  convertToCauscapeElements,
  newCauscapeEdgeElement,
} from "@causcape/element";

import type { CauscapeElementSkeleton } from "@causcape/element";
import type { OrderedCauscapeElement } from "@causcape/element/types";

import {
  buildEngineeringFlowPaths,
  CauscapeFlowOverlay,
  type CauscapeFlowOverlayHandle,
} from "./CauscapeFlowOverlay";

const arrow = (
  overrides: Partial<CauscapeElementSkeleton> = {},
): OrderedCauscapeElement =>
  convertToCauscapeElements(
    [
      {
        id: "flow-arrow",
        type: "arrow",
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        points: [
          [0, 0],
          [100, 0],
          [200, 100],
        ],
        endArrowhead: "arrow",
        strokeColor: "#1971c2",
        ...overrides,
      },
    ] as CauscapeElementSkeleton[],
    { regenerateIds: false },
  )[0] as OrderedCauscapeElement;

describe("CauscapeFlowOverlay", () => {
  it("keeps label layout in scene space while zooming and reversing packets", () => {
    const base = newCauscapeEdgeElement({
      id: "read",
      fromNodeId: "api",
      toNodeId: "db",
      label: "a long database lookup",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [180, 0],
      ],
      roughness: 0,
    });
    const element = {
      ...base,
      causcape: { ...base.causcape, relationship: "reads" },
    } as OrderedCauscapeElement;
    const viewport = { scrollX: 0, scrollY: 0, width: 800, height: 600 };
    const [full] = buildEngineeringFlowPaths([element], {
      ...viewport,
      zoom: { value: 1 },
    });
    const [half] = buildEngineeringFlowPaths([element], {
      ...viewport,
      zoom: { value: 0.5 },
    });
    expect(full.labelLayout).toBeDefined();
    expect(half.labelLayout).toEqual({ ...full.labelLayout, scale: 0.5 });
    expect(half.labelAnchor!.x).toBeCloseTo(full.labelAnchor!.x / 2);
    expect(half.labelAnchor!.y).toBeCloseTo(full.labelAnchor!.y / 2);
    expect(full.labelAnchor!.y).toBe(16);
    const { container } = render(<CauscapeFlowOverlay paths={[half]} />);
    expect(container.querySelector('[data-flow-label="read"]')).toHaveAttribute(
      "transform",
      expect.stringContaining("scale(0.5)"),
    );
    expect(
      container.querySelectorAll('[data-flow-label="read"] text').length,
    ).toBeGreaterThan(1);
  });

  it("maps arrow geometry into viewport paths and preserves direction", () => {
    const paths = buildEngineeringFlowPaths([arrow()], {
      zoom: { value: 2 },
      scrollX: 5,
      scrollY: -10,
      width: 800,
      height: 600,
    });

    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({
      id: "flow-arrow",
      color: "#1971c2",
      d: "M 31 21 L 230 20 L 429 219",
      packetCount: 3,
      relationship: "flow",
      variant: "generic",
      status: "active",
    });

    const reverseOnly = arrow({
      startArrowhead: "arrow",
      endArrowhead: null,
    });
    expect(
      buildEngineeringFlowPaths([reverseOnly], {
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
      })[0].d,
    ).toBe("M 209.5 119.5 L 110 20 L 10.5 20.5");
  });

  it("renders staggered, pointer-transparent packets for visible arrows", () => {
    render(
      <CauscapeFlowOverlay
        paths={[
          {
            id: "checkout-flow",
            color: "#6741d9",
            d: "M 20 40 L 220 40",
            packetCount: 3,
          },
        ]}
      />,
    );

    const overlay = screen.getByTestId("causcape-flow-overlay");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(
      overlay.querySelectorAll("[data-flow-packet='checkout-flow']"),
    ).toHaveLength(3);
    expect(overlay.querySelector("animateMotion")).toHaveAttribute(
      "path",
      "M 20 40 L 220 40",
    );
  });

  it("isolates the active walkthrough edge and follows its traversal direction", () => {
    render(
      <CauscapeFlowOverlay
        paths={[
          {
            id: "request-edge",
            color: "#2563eb",
            d: "M 20 40 L 220 40",
            playbackForwardD: "M 20 40 L 220 40",
            playbackReverseD: "M 220 40 L 20 40",
            packetCount: 2,
          },
          {
            id: "database-edge",
            color: "#7c3aed",
            d: "M 220 80 L 20 80",
            playbackForwardD: "M 20 80 L 220 80",
            playbackReverseD: "M 220 80 L 20 80",
            packetCount: 2,
          },
        ]}
        playback={{
          activeEdgeId: "database-edge",
          activeDirection: "reverse",
          completedEdgeIds: ["request-edge"],
          isPlaying: true,
        }}
      />,
    );

    const overlay = screen.getByTestId("causcape-flow-overlay");
    expect(overlay).toHaveAttribute("data-playback-active", "true");
    expect(
      overlay.querySelector("[data-flow-id='request-edge']"),
    ).toHaveAttribute("data-playback-state", "completed");
    expect(
      overlay.querySelector("[data-flow-id='database-edge']"),
    ).toHaveAttribute("data-playback-state", "active");
    expect(
      overlay.querySelector("[data-flow-playback-packet='database-edge']"),
    ).toHaveAttribute("path", "M 220 80 L 20 80");
    expect(
      overlay.querySelector("[data-flow-playback-track='database-edge']"),
    ).toHaveAttribute("d", "M 220 80 L 20 80");
    expect(
      overlay.querySelector("[data-flow-playback-track='database-edge']"),
    ).toHaveAttribute("marker-end");
    expect(overlay.querySelectorAll("[data-flow-packet]")).toHaveLength(0);
  });

  it("restarts motion when consecutive steps reverse the same connector", () => {
    const paths = [
      {
        id: "cache-read",
        color: "#7c3aed",
        d: "M 220 80 L 20 80",
        playbackForwardD: "M 20 80 L 220 80",
        playbackReverseD: "M 220 80 L 20 80",
        packetCount: 2,
      },
    ];
    const { rerender } = render(
      <CauscapeFlowOverlay
        paths={paths}
        playback={{
          activeEdgeId: "cache-read",
          activeDirection: "forward",
          completedEdgeIds: [],
          isPlaying: true,
        }}
      />,
    );
    const forwardMotion = screen
      .getByTestId("causcape-flow-overlay")
      .querySelector("[data-flow-playback-packet='cache-read']");

    rerender(
      <CauscapeFlowOverlay
        paths={paths}
        playback={{
          activeEdgeId: "cache-read",
          activeDirection: "reverse",
          completedEdgeIds: [],
          isPlaying: true,
        }}
      />,
    );

    const reverseMotion = screen
      .getByTestId("causcape-flow-overlay")
      .querySelector("[data-flow-playback-packet='cache-read']");
    expect(reverseMotion).not.toBe(forwardMotion);
    expect(reverseMotion).toHaveAttribute("path", "M 220 80 L 20 80");
  });

  it("stops failed-flow packets at a visible interruption marker", () => {
    const interruptedArrow = arrow({
      customData: {
        causcape: {
          kind: "flow",
          metadata: { kind: "flow", status: "interrupted" },
        },
      },
    });
    const [path] = buildEngineeringFlowPaths([interruptedArrow], {
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
      width: 800,
      height: 600,
    });

    expect(path.interruption).toEqual({ x: 124.57, y: 34.57 });
    expect(path.packetD).toBe("M 10.5 20.5 L 110 20 L 124.57 34.57");

    render(<CauscapeFlowOverlay paths={[path]} />);
    const overlay = screen.getByTestId("causcape-flow-overlay");
    expect(
      overlay.querySelector("[data-flow-interruption='flow-arrow']"),
    ).toBeInTheDocument();
    expect(overlay.querySelector("animateMotion")).toHaveAttribute(
      "path",
      path.packetD,
    );
  });

  it("animates packet streams in both directions for two-headed arrows", () => {
    const bidirectionalArrow = arrow({
      startArrowhead: "arrow",
      endArrowhead: "arrow",
      customData: {
        causcape: {
          kind: "flow",
          metadata: { kind: "flow", direction: "bidirectional" },
        },
      },
    });
    const [path] = buildEngineeringFlowPaths([bidirectionalArrow], {
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
      width: 800,
      height: 600,
    });

    expect(path.reverseD).toBe("M 209.5 119.5 L 110 20 L 10.5 20.5");

    render(<CauscapeFlowOverlay paths={[path]} />);
    const overlay = screen.getByTestId("causcape-flow-overlay");
    expect(
      overlay.querySelectorAll("[data-flow-direction='forward']"),
    ).toHaveLength(1);
    expect(
      overlay.querySelectorAll("[data-flow-direction='reverse']"),
    ).toHaveLength(1);
    expect(
      overlay.querySelector("[data-flow-direction='reverse'] animateMotion"),
    ).toHaveAttribute("path", path.reverseD);
  });

  it.each([
    ["calls", "synchronous", "#2563eb", "capsule", false],
    ["depends-on", "dependency", "#64748b", "diamond", false],
    ["reads", "data", "#7c3aed", "dot", true],
    ["writes", "data", "#7c3aed", "dot", false],
    ["publishes", "asynchronous", "#d97706", "dot", false],
    ["subscribes", "asynchronous", "#d97706", "dot", true],
  ] as const)(
    "gives typed %s relationships a semantic flow presentation",
    (relationship, variant, color, packetVariant, reversesDirection) => {
      const baseEdge = newCauscapeEdgeElement({
        id: `${relationship}-edge`,
        fromNodeId: "source",
        toNodeId: "target",
        label: "orders.v1",
        x: 10,
        y: 20,
        points: [
          [0, 0],
          [200, 0],
        ],
      });
      const edge = {
        ...baseEdge,
        causcape: { ...baseEdge.causcape, relationship },
      } as OrderedCauscapeElement;

      const [path] = buildEngineeringFlowPaths([edge], {
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
      });

      expect(path).toMatchObject({
        id: `${relationship}-edge`,
        relationship,
        variant,
        color,
        packetVariant,
        status: "active",
        label: `${relationship.replace("-", " ")} · orders.v1`,
      });
      expect(path.d).toBe(
        reversesDirection ? "M 210 20 L 10 20" : "M 10 20 L 210 20",
      );
      expect(path.playbackForwardD).toBe("M 10 20 L 210 20");
      expect(path.playbackReverseD).toBe("M 210 20 L 10 20");
    },
  );

  it("renders a designed track, arrow marker, and semantic label for typed edges", () => {
    render(
      <CauscapeFlowOverlay
        paths={[
          {
            id: "typed-call",
            color: "#2563eb",
            d: "M 20 40 L 220 40",
            packetCount: 2,
            relationship: "calls",
            variant: "synchronous",
            packetVariant: "capsule",
            status: "active",
            label: "calls · POST /checkout",
            labelAnchor: { x: 120, y: 22 },
          },
        ]}
      />,
    );

    const overlay = screen.getByTestId("causcape-flow-overlay");
    expect(
      overlay.querySelector("[data-flow-track='typed-call']"),
    ).toHaveAttribute("marker-end");
    expect(
      overlay.querySelector("[data-flow-label='typed-call']"),
    ).toHaveTextContent("calls · POST /checkout");
  });

  it("supports degraded and interrupted bidirectional typed flows", () => {
    const baseEdge = newCauscapeEdgeElement({
      id: "degraded-edge",
      fromNodeId: "source",
      toNodeId: "target",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [240, 0],
      ],
    });
    const degraded = {
      ...baseEdge,
      causcape: {
        ...baseEdge.causcape,
        relationship: "calls",
        status: "degraded",
        direction: "bidirectional",
      },
    } as OrderedCauscapeElement;
    const interrupted = {
      ...degraded,
      id: "interrupted-edge",
      causcape: { ...degraded.causcape, status: "interrupted" },
    } as OrderedCauscapeElement;

    const [degradedPath, interruptedPath] = buildEngineeringFlowPaths(
      [degraded, interrupted],
      {
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
      },
    );

    expect(degradedPath).toMatchObject({
      status: "degraded",
      color: "#d97706",
      reverseD: "M 240 0 L 0 0",
    });
    expect(interruptedPath).toMatchObject({
      status: "interrupted",
      color: "#dc2626",
      interruption: { x: 120, y: 0 },
    });
  });

  it("retains live paths supplied through its frame-coalesced update handle", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const overlayRef = createRef<CauscapeFlowOverlayHandle>();
    render(<CauscapeFlowOverlay ref={overlayRef} />);

    act(() => {
      overlayRef.current?.update([arrow()], {
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
      });
      callbacks.shift()?.(0);
    });

    expect(
      screen
        .getByTestId("causcape-flow-overlay")
        .querySelectorAll("[data-flow-packet='flow-arrow']"),
    ).toHaveLength(2);
  });

  it("flushes a pending update when the browser pauses animation frames", () => {
    vi.useFakeTimers();
    const cancelAnimationFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 42);
    const overlayRef = createRef<CauscapeFlowOverlayHandle>();
    render(<CauscapeFlowOverlay ref={overlayRef} />);

    act(() => {
      overlayRef.current?.update([arrow()], {
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
      });
      vi.advanceTimersByTime(120);
    });

    expect(
      screen
        .getByTestId("causcape-flow-overlay")
        .querySelectorAll("[data-flow-packet='flow-arrow']"),
    ).toHaveLength(2);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    vi.useRealTimers();
  });

  it("ignores deleted arrows, regular shapes, and offscreen flows", () => {
    const deletedArrow = {
      ...arrow({ id: "deleted-flow" }),
      isDeleted: true,
    } as OrderedCauscapeElement;
    const rectangle = convertToCauscapeElements([
      { type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
    ])[0] as OrderedCauscapeElement;
    const offscreenArrow = arrow({
      id: "offscreen-flow",
      x: 2000,
      y: 2000,
    });

    expect(
      buildEngineeringFlowPaths([deletedArrow, rectangle, offscreenArrow], {
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
      }),
    ).toEqual([]);
  });
});

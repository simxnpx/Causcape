import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { convertToCauscapeElements } from "@causcape/element";

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
  it("maps arrow geometry into viewport paths and preserves direction", () => {
    const paths = buildEngineeringFlowPaths([arrow()], {
      zoom: { value: 2 },
      scrollX: 5,
      scrollY: -10,
      width: 800,
      height: 600,
    });

    expect(paths).toEqual([
      {
        id: "flow-arrow",
        color: "#1971c2",
        d: "M 31 21 L 230 20 L 429 219",
        packetCount: 3,
      },
    ]);

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

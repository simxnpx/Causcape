import { describe, expect, it, vi } from "vitest";

import type { OrderedCauscapeElement } from "@causcape/element/types";

import { followDataFlowPlaybackStep } from "./dataFlowPlaybackViewport";

describe("followDataFlowPlaybackStep", () => {
  it("animates the viewport to the current flow component", () => {
    const setViewport = vi.fn();
    const node = {
      id: "current-node",
      isDeleted: false,
    } as OrderedCauscapeElement;

    expect(
      followDataFlowPlaybackStep(
        {
          setViewport,
          getSceneElementsIncludingDeleted: () => [node],
        },
        ["current-node", "label"],
      ),
    ).toBe(true);
    expect(setViewport).toHaveBeenCalledWith({
      target: node,
      fit: "scale-down",
      animation: true,
    });
  });

  it("does nothing when the current object has no canvas element", () => {
    const setViewport = vi.fn();

    expect(
      followDataFlowPlaybackStep(
        { setViewport, getSceneElementsIncludingDeleted: () => [] },
        [],
      ),
    ).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
  });
});

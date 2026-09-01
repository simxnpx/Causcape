import type { CauscapeImperativeAPI } from "@causcape/causcape/types";

type DataFlowViewportAPI = Pick<
  CauscapeImperativeAPI,
  "getSceneElementsIncludingDeleted" | "setViewport"
>;

/** Keeps a walkthrough anchored to its current architecture component. */
export const followDataFlowPlaybackStep = (
  api: DataFlowViewportAPI,
  activeNodeElementIds: readonly string[],
): boolean => {
  const elementsById = new Map(
    api
      .getSceneElementsIncludingDeleted()
      .map((element) => [element.id, element] as const),
  );
  const target = activeNodeElementIds
    .map((elementId) => elementsById.get(elementId))
    .find((element) => element && !element.isDeleted);
  if (!target) {
    return false;
  }

  api.setViewport({
    target,
    fit: "scale-down",
    animation: true,
  });
  return true;
};

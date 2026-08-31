import type { CauscapeTextContainer } from "./types";

export const originalContainerCache: {
  [id: CauscapeTextContainer["id"]]:
    | {
        height: CauscapeTextContainer["height"];
      }
    | undefined;
} = {};

export const updateOriginalContainerCache = (
  id: CauscapeTextContainer["id"],
  height: CauscapeTextContainer["height"],
) => {
  const data =
    originalContainerCache[id] || (originalContainerCache[id] = { height });
  data.height = height;
  return data;
};

export const resetOriginalContainerCache = (
  id: CauscapeTextContainer["id"],
) => {
  if (originalContainerCache[id]) {
    delete originalContainerCache[id];
  }
};

export const getOriginalContainerHeightFromCache = (
  id: CauscapeTextContainer["id"],
) => {
  return originalContainerCache[id]?.height ?? null;
};

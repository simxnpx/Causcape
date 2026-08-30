import { DEFAULT_FONT_FAMILY } from "@causcape/common";

import type { Radians } from "@causcape/math";

import type { CauscapeElement } from "@causcape/element/types";

const elementBase: Omit<CauscapeElement, "type"> = {
  id: "vWrqOAfkind2qcm7LDAGZ",
  x: 414,
  y: 237,
  width: 214,
  height: 214,
  angle: 0 as Radians,
  strokeColor: "#000000",
  backgroundColor: "#15aabf",
  fillStyle: "hachure",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  index: null,
  seed: 1041657908,
  version: 120,
  versionNonce: 1188004276,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
};

export const rectangleFixture: CauscapeElement = {
  ...elementBase,
  type: "rectangle",
};
export const embeddableFixture: CauscapeElement = {
  ...elementBase,
  type: "embeddable",
};
export const ellipseFixture: CauscapeElement = {
  ...elementBase,
  type: "ellipse",
};
export const diamondFixture: CauscapeElement = {
  ...elementBase,
  type: "diamond",
};
export const rectangleWithLinkFixture: CauscapeElement = {
  ...elementBase,
  type: "rectangle",
  link: "causcape.com",
};

export const textFixture: CauscapeElement = {
  ...elementBase,
  type: "text",
  fontSize: 20,
  fontFamily: DEFAULT_FONT_FAMILY,
  strokeColor: "#1e1e1e",
  text: "original text",
  originalText: "original text",
  textAlign: "left",
  verticalAlign: "top",
  containerId: null,
  lineHeight: 1.25 as any,
  autoResize: false,
};

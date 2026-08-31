import { VERSIONS } from "@causcape/common";

import type {
  CauscapeElement,
  NonDeletedCauscapeElement,
} from "@causcape/element/types";

import {
  diamondFixture,
  ellipseFixture,
  rectangleFixture,
} from "./elementFixture";

export const diagramFixture = {
  type: "causcape",
  version: VERSIONS.causcape,
  source: "https://causcape.com",
  elements: [diamondFixture, ellipseFixture, rectangleFixture],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridModeEnabled: false,
  },
  files: {},
};

export const diagramFactory = ({
  overrides = {},
  elementOverrides = {} as Partial<CauscapeElement>,
} = {}) => ({
  ...diagramFixture,
  elements: [
    {
      ...diamondFixture,
      ...elementOverrides,
      isDeleted: elementOverrides.isDeleted ?? false,
    } as NonDeletedCauscapeElement,
    {
      ...ellipseFixture,
      ...elementOverrides,
      isDeleted: elementOverrides.isDeleted ?? false,
    } as NonDeletedCauscapeElement,
    {
      ...rectangleFixture,
      ...elementOverrides,
      isDeleted: elementOverrides.isDeleted ?? false,
    } as NonDeletedCauscapeElement,
  ],
  ...overrides,
});

export default diagramFixture;

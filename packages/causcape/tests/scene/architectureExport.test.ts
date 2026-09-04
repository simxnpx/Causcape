import {
  newCauscapeNodeElement,
  newCauscapeEdgeElement,
  getCauscapeEdgeLabelBounds,
} from "@causcape/element";

import { exportToSvg } from "../../scene/export";

describe("architecture SVG positioning", () => {
  it("includes labels outside a route in the export bounds", async () => {
    const edge = newCauscapeEdgeElement({
      fromNodeId: "a",
      toNodeId: "b",
      label: "SENT to REJECTED",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [0, 300],
      ],
      roughness: 0,
    });
    const label = getCauscapeEdgeLabelBounds(
      [
        [0, 0],
        [0, 300],
      ],
      edge.causcape,
    )!;
    const svg = await exportToSvg(
      [edge],
      { exportBackground: true, viewBackgroundColor: "#fff", exportPadding: 0 },
      null,
      { skipInliningFonts: true },
    );
    const [, , width, height] = svg
      .getAttribute("viewBox")!
      .split(" ")
      .map(Number);
    expect(width).toBeGreaterThanOrEqual(label.width);
    expect(height).toBeGreaterThanOrEqual(300);
  });
  it.each([false, true])(
    "positions card background and content together (dark=%s)",
    async (dark) => {
      const card = newCauscapeNodeElement({
        x: 400,
        y: 250,
        kind: "service",
        label: "Billing service",
        description: "Registers invoices",
      });
      const svg = await exportToSvg(
        [card],
        {
          exportBackground: true,
          viewBackgroundColor: "#ffffff",
          exportWithDarkMode: dark,
        },
        null,
        { skipInliningFonts: true },
      );
      const title = [...svg.querySelectorAll("text")].find(
        (text) => text.textContent === "Billing service",
      );
      expect(title).toBeDefined();
      const group = title!.parentElement!;
      const background = group.querySelector("g[stroke-linecap]");
      expect(background).not.toBeNull();
      // The parent already translates the card. Its background must stay local,
      // otherwise it is displaced from the title and can cover other cards.
      expect(group.getAttribute("transform")).toContain("translate(");
      expect(background!.getAttribute("transform")).toBeNull();
    },
  );
});

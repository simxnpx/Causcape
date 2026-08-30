import { THEME } from "@causcape/common";
import { pointFrom, type LocalPoint } from "@causcape/math";

import { vi } from "vitest";

import type { StaticCanvasRenderConfig } from "@causcape/causcape/scene/types";

import {
  drawCauscapeEdgeOnCanvas,
  drawCauscapeNodeOnCanvas,
  getCauscapeEdgeLabelBounds,
  getCauscapeReferenceAtPoint,
  getCauscapeNodeSize,
  getCauscapeNodeRenderData,
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
  normalizeCauscapeEdgeData,
  normalizeCauscapeNodeData,
} from "../src";

describe("Causcape elements", () => {
  it("normalizes malformed node metadata to a render-safe variable", () => {
    const data = normalizeCauscapeNodeData({
      kind: "future-kind",
      label: 42,
      cache: null,
    });

    expect(data).toMatchObject({
      schemaVersion: 1,
      kind: "variable",
      label: "",
    });
    expect(getCauscapeNodeRenderData(data, THEME.LIGHT)).toMatchObject({
      isGithub: false,
      title: "",
    });
  });

  it("keeps GitHub presentation data coherent across renderers", () => {
    const node = newCauscapeNodeElement({
      x: 0,
      y: 0,
      label: "fallback",
      kind: "github-repo",
      cache: {
        stars: 12,
        language: "TypeScript",
        description: "A graph editor",
        updatedAt: "2026-01-01",
        snapshotAt: "2026-01-01",
      },
    });

    expect(getCauscapeNodeRenderData(node.causcape, THEME.LIGHT)).toMatchObject(
      {
        isGithub: true,
        title: "A graph editor",
        meta: "★ 12 · TypeScript",
      },
    );
  });

  it("normalizes optional architecture metadata and omits empty sections", () => {
    const data = normalizeCauscapeNodeData({
      kind: "service",
      label: "  Booking API  ",
      environment: " prod-eu-west-1 ",
      health: "healthy",
      description: " Processes reservation requests ",
      technologies: [" Python ", "", "Python", "Celery", 42],
      references: [
        {
          type: "repository",
          url: "https://github.com/acme/payments",
          label: "Payments repository",
        },
        {
          kind: "github-repo",
          url: "https://github.com/acme/payments",
        },
        { type: "dashboard", url: "" },
        { type: "unsupported", url: "https://example.com" },
      ],
      emptyDescription: "preserved as an unknown field",
    });

    expect(data).toMatchObject({
      schemaVersion: 1,
      kind: "service",
      label: "Booking API",
      environment: "prod-eu-west-1",
      health: "healthy",
      description: "Processes reservation requests",
      technologies: ["Python", "Celery"],
      references: [
        {
          type: "repository",
          url: "https://github.com/acme/payments",
          label: "Payments repository",
        },
      ],
      emptyDescription: "preserved as an unknown field",
    });
    expect(
      normalizeCauscapeNodeData({
        kind: "service",
        label: "empty",
        environment: " ",
        description: "",
        technologies: ["", 10],
        references: [{ type: "dashboard", url: " " }],
      }),
    ).not.toHaveProperty("environment");
    expect(
      normalizeCauscapeNodeData({
        kind: "service",
        label: "empty",
        description: "",
        technologies: ["", 10],
        references: [{ type: "dashboard", url: " " }],
      }),
    ).not.toHaveProperty("description");
    expect(
      normalizeCauscapeNodeData({
        kind: "service",
        label: "empty",
        technologies: ["", 10],
        references: [{ type: "dashboard", url: " " }],
      }),
    ).not.toHaveProperty("technologies");
    expect(
      normalizeCauscapeNodeData({
        kind: "service",
        label: "empty",
        references: [{ type: "dashboard", url: " " }],
      }),
    ).not.toHaveProperty("references");
  });

  it("builds architecture render data and grows only for populated sections", () => {
    const sparse = newCauscapeNodeElement({
      x: 0,
      y: 0,
      label: "Booking API",
      kind: "service",
    });
    const rich = newCauscapeNodeElement({
      x: 0,
      y: 0,
      label: "Booking API",
      kind: "service",
      environment: "prod-eu-west-1",
      health: "healthy",
      description:
        "Processes reservation requests from the reservation gateway",
      references: [
        {
          type: "repository",
          url: "https://github.com/acme/payments",
          label: "Payments repository",
        },
        {
          type: "dashboard",
          url: "https://grafana.example.com/d/booking",
          label: "Latency dashboard",
        },
      ],
      technologies: ["Python", "Celery", "AWS"],
    });

    expect(getCauscapeNodeRenderData(rich.causcape, THEME.LIGHT)).toMatchObject(
      {
        isArchitecture: true,
        isGithub: false,
        kindLabel: "Service",
        health: {
          value: "healthy",
          label: "Healthy",
          glyph: "✓",
        },
        description:
          "Processes reservation requests from the reservation gateway",
        environment: "prod-eu-west-1",
        technologies: ["Python", "Celery", "AWS"],
      },
    );
    expect(getCauscapeNodeSize(sparse.causcape)).toEqual({
      width: 560,
      height: 180,
    });
    expect(rich.width).toBeGreaterThanOrEqual(sparse.width);
    expect(rich.height).toBeGreaterThan(sparse.height);
  });

  it("draws architecture metadata through the canvas node renderer", () => {
    const node = newCauscapeNodeElement({
      x: 0,
      y: 0,
      label: "Booking API",
      kind: "service",
      health: "healthy",
      references: [
        {
          type: "repository",
          url: "https://github.com/acme/payments",
          label: "Payments repository",
        },
      ],
      technologies: ["Python"],
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const fillText = vi.spyOn(context, "fillText");

    drawCauscapeNodeOnCanvas(node, context, {
      theme: THEME.LIGHT,
    } as StaticCanvasRenderConfig);

    expect(fillText).toHaveBeenCalledWith(
      "Booking API",
      expect.any(Number),
      expect.any(Number),
    );
    expect(fillText).toHaveBeenCalledWith(
      "✓ Healthy",
      expect.any(Number),
      expect.any(Number),
    );
    expect(fillText).toHaveBeenCalledWith(
      "Payments repository",
      expect.any(Number),
      expect.any(Number),
    );
    expect(fillText).toHaveBeenCalledWith(
      "Python",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("hit-tests painted architecture references without splitting the card", () => {
    const node = newCauscapeNodeElement({
      x: 40,
      y: 60,
      label: "Booking API",
      kind: "service",
      references: [
        {
          type: "repository",
          url: "https://github.com/acme/payments",
          label: "Payments repository",
        },
      ],
    });

    expect(
      getCauscapeReferenceAtPoint(
        node,
        { x: node.x + 160, y: node.y + 190 },
        THEME.LIGHT,
      ),
    ).toMatchObject({
      type: "repository",
      url: "https://github.com/acme/payments",
    });
    expect(
      getCauscapeReferenceAtPoint(
        node,
        { x: node.x + 160, y: node.y + 80 },
        THEME.LIGHT,
      ),
    ).toBeNull();
  });

  it("derives edge bounds from valid points and repairs metadata", () => {
    const edge = newCauscapeEdgeElement({
      x: 10,
      y: 20,
      fromNodeId: "a",
      toNodeId: "b",
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(120, 40),
        ["bad" as never, 2] as unknown as LocalPoint,
      ],
    });

    expect(edge.points).toHaveLength(2);
    expect(edge.width).toBe(120);
    expect(edge.height).toBe(40);
    expect(normalizeCauscapeEdgeData(null)).toMatchObject({
      schemaVersion: 1,
      fromNodeId: "",
      toNodeId: "",
    });
  });

  it("renders the complete typed relationship and edge label", () => {
    const edge = newCauscapeEdgeElement({
      x: 0,
      y: 0,
      fromNodeId: "source",
      toNodeId: "target",
      label: "submits a reservation request",
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(180, 0)],
    });
    const labeledEdge = {
      ...edge,
      causcape: {
        ...edge.causcape,
        relationship: "calls",
      },
    };
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const fillText = vi.spyOn(context, "fillText");

    drawCauscapeEdgeOnCanvas(labeledEdge, context, {
      theme: THEME.LIGHT,
    } as StaticCanvasRenderConfig);

    expect(fillText).toHaveBeenCalledWith(
      "calls · submits a",
      expect.any(Number),
      expect.any(Number),
    );
    expect(fillText).toHaveBeenCalledWith(
      "reservation request",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("reports the full label bounds for short horizontal and vertical edges", () => {
    const value = {
      relationship: "calls",
      label: "charges reservation",
    };
    const vertical = getCauscapeEdgeLabelBounds(
      [
        [0, 0],
        [0, 240],
      ],
      value,
    );
    const horizontal = getCauscapeEdgeLabelBounds(
      [
        [0, 0],
        [24, 0],
      ],
      { relationship: "reads", label: "checks availability" },
    );

    expect(vertical).toMatchObject({
      x: expect.any(Number),
      width: expect.any(Number),
    });
    expect(vertical?.x).toBeLessThan(0);
    expect(horizontal?.x).toBeLessThan(0);
    expect((horizontal?.x ?? 0) + (horizontal?.width ?? 0)).toBeGreaterThan(24);
  });
});

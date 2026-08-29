import type {
  ExcalidrawCauscapeEdgeElement,
  ExcalidrawCauscapeNodeElement,
} from "@excalidraw/element/types";

import {
  analyzeGraphQuality,
  improveCauscapeGraph,
  routeCauscapeEdge,
  validateGraph,
  type CauscapeEdge,
  type CauscapeEdgeGeometry,
  type CauscapeGraph,
  type CauscapeNode,
} from "../src";

const node = (
  id: string,
  x: number,
  y: number,
  options: {
    locked?: boolean;
    label?: string;
    width?: number;
    height?: number;
  } = {},
): CauscapeNode =>
  ({
    id,
    label: options.label ?? id,
    kind: "variable",
    x,
    y,
    width: options.width ?? 20,
    height: options.height ?? 20,
    element: {
      locked: options.locked ?? false,
    } as ExcalidrawCauscapeNodeElement,
  } as CauscapeNode);

const edge = (
  id: string,
  fromNodeId: string,
  toNodeId: string,
  options: { label?: string; relationship?: string } = {},
): CauscapeEdge =>
  ({
    id,
    fromNodeId,
    toNodeId,
    label: options.label,
    relationship: options.relationship as CauscapeEdge["relationship"],
    element: {
      causcape: {
        schemaVersion: 1,
        fromNodeId,
        toNodeId,
        label: options.label,
        relationship: options.relationship,
      },
    } as ExcalidrawCauscapeEdgeElement,
  } as CauscapeEdge);

const graph = (
  nodes: readonly CauscapeNode[],
  edges: readonly CauscapeEdge[],
): CauscapeGraph => {
  const adjacency = new Map<string, readonly string[]>();
  for (const current of nodes) {
    adjacency.set(
      current.id,
      edges
        .filter((currentEdge) => currentEdge.fromNodeId === current.id)
        .map((currentEdge) => currentEdge.toNodeId),
    );
  }
  return {
    nodes,
    edges,
    diagnostics: [],
    nodesById: new Map(nodes.map((current) => [current.id, current])),
    edgesById: new Map(edges.map((current) => [current.id, current])),
    adjacency,
  };
};

describe("graph quality pipeline", () => {
  it("allows distinct typed relationships between the same nodes", () => {
    const service = node("service", 0, 0);
    const database = node("database", 200, 0);

    expect(
      validateGraph(
        [service, database],
        [
          edge("read", "service", "database", { relationship: "reads" }),
          edge("write", "service", "database", { relationship: "writes" }),
        ],
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_EDGE" }),
      ]),
    );

    expect(
      validateGraph(
        [service, database],
        [
          edge("read-1", "service", "database", { relationship: "reads" }),
          edge("read-2", "service", "database", { relationship: "reads" }),
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_EDGE" }),
      ]),
    );
  });

  it("aligns connected lanes and keeps a clear direct route unobstructed", () => {
    const source = node("source", 0, 0, {
      width: 120,
      height: 80,
    });
    const target = node("target", 260, 160, {
      width: 120,
      height: 80,
    });

    const route = routeCauscapeEdge(source, target);
    const points = route.points.map(([x, y]) => [x + route.x, y + route.y]);

    expect(points).toHaveLength(3);
    expect(
      points.slice(1).every((point, index) => {
        const previous = points[index];
        return point[0] === previous[0] || point[1] === previous[1];
      }),
    ).toBe(true);

    const result = improveCauscapeGraph(
      graph([source, target], [edge("source-target", "source", "target")]),
      {
        originX: 0,
        originY: 0,
        gapX: 80,
        gapY: 40,
      },
    );
    const sourcePosition = result.positions.get("source");
    const targetPosition = result.positions.get("target");
    expect(sourcePosition).toBeDefined();
    expect(targetPosition).toBeDefined();
    expect((sourcePosition as { y: number }).y + source.height / 2).toBe(
      (targetPosition as { y: number }).y + target.height / 2,
    );
    expect(result.edges.get("source-target")?.points).toHaveLength(2);
  });

  it("detects edge labels that are occluded by cards", () => {
    const source = node("source", 0, 0, {
      width: 120,
      height: 80,
    });
    const target = node("target", 140, 0, {
      width: 120,
      height: 160,
    });
    const report = analyzeGraphQuality(
      graph(
        [source, target],
        [
          edge("source-target", "source", "target", {
            relationship: "calls",
            label: "submits a reservation request",
          }),
        ],
      ),
      {
        routes: new Map([["source-target", routeCauscapeEdge(source, target)]]),
      },
    );

    expect(report.metrics.edgeLabelOverlapCount).toBeGreaterThan(0);
    expect(report.metrics.score).toBeLessThan(100);
  });

  it("uses runtime flow direction for subscriptions and keeps the primary spine first", () => {
    const user = node("user", 900, 480, { width: 120, height: 80 });
    const gateway = node("gateway", 700, 120, { width: 120, height: 80 });
    const booking = node("booking", 500, 420, { width: 120, height: 80 });
    const events = node("events", 300, 40, { width: 120, height: 80 });
    const worker = node("worker", 100, 420, { width: 120, height: 80 });
    const email = node("email", 0, 40, { width: 120, height: 80 });
    const inventory = node("inventory", 300, 240, { width: 120, height: 80 });
    const payment = node("payment", 300, 360, { width: 120, height: 80 });

    const input = graph(
      [user, gateway, booking, events, worker, email, inventory, payment],
      [
        edge("user-gateway", "user", "gateway", { relationship: "calls" }),
        edge("gateway-booking", "gateway", "booking", {
          relationship: "calls",
        }),
        edge("booking-events", "booking", "events", {
          relationship: "publishes",
        }),
        edge("booking-inventory", "booking", "inventory", {
          relationship: "reads",
        }),
        edge("booking-payment", "booking", "payment", {
          relationship: "calls",
        }),
        edge("worker-events", "worker", "events", {
          relationship: "subscribes",
        }),
        edge("worker-email", "worker", "email", {
          relationship: "depends-on",
        }),
      ],
    );
    const result = improveCauscapeGraph(input, {
      originX: 0,
      originY: 0,
      gapX: 80,
      gapY: 40,
    });
    const x = (id: string) => result.positions.get(id)?.x as number;
    expect(
      ["user", "gateway", "booking", "events", "worker", "email"].map(x),
    ).toEqual([0, 240, 480, 720, 960, 1200]);
    expect(result.positions.get("events")?.y).toBeLessThan(
      result.positions.get("inventory")?.y as number,
    );
    expect(result.positions.get("events")?.y).toBeLessThan(
      result.positions.get("payment")?.y as number,
    );
    expect(result.after.metrics).toMatchObject({
      overlapCount: 0,
      edgeThroughNodeCount: 0,
      crossingCount: 0,
    });
    const subscription = result.edges.get(
      "worker-events",
    ) as CauscapeEdgeGeometry;
    const subscriptionPoints = subscription.points.map(([pointX, pointY]) => [
      pointX + subscription.x,
      pointY + subscription.y,
    ]);
    expect(subscriptionPoints[0][0]).toBeLessThan(
      subscriptionPoints[subscriptionPoints.length - 1][0],
    );
  });

  it("packs small single-anchor side flows vertically below the primary spine", () => {
    const anchor = node("anchor", 0, 0, { width: 120, height: 80 });
    const primary = node("primary", 240, 0, { width: 120, height: 80 });
    const final = node("final", 480, 0, { width: 120, height: 80 });
    const terminal = node("terminal", 720, 0, { width: 120, height: 80 });
    const pricing = node("pricing", 240, 180, { width: 120, height: 80 });
    const pricingStore = node("pricing-store", 480, 180, {
      width: 120,
      height: 80,
    });

    const result = improveCauscapeGraph(
      graph(
        [anchor, primary, final, terminal, pricing, pricingStore],
        [
          edge("anchor-primary", "anchor", "primary", {
            relationship: "calls",
          }),
          edge("primary-final", "primary", "final", { relationship: "calls" }),
          edge("final-terminal", "final", "terminal", {
            relationship: "calls",
          }),
          edge("anchor-pricing", "anchor", "pricing", {
            relationship: "calls",
          }),
          edge("pricing-store", "pricing", "pricing-store", {
            relationship: "writes",
          }),
        ],
      ),
      {
        originX: 0,
        originY: 0,
        gapX: 80,
        gapY: 40,
        enableVerticalSubflows: true,
      },
    );

    const anchorPosition = result.positions.get("anchor") as {
      x: number;
      y: number;
    };
    const pricingPosition = result.positions.get("pricing") as {
      x: number;
      y: number;
    };
    const pricingStorePosition = result.positions.get("pricing-store") as {
      x: number;
      y: number;
    };

    expect(pricingPosition.x + pricing.width / 2).toBe(
      anchorPosition.x + anchor.width / 2,
    );
    expect(pricingStorePosition.x + pricingStore.width / 2).toBe(
      anchorPosition.x + anchor.width / 2,
    );
    expect(pricingPosition.y).toBeGreaterThan(anchorPosition.y + anchor.height);
    expect(pricingStorePosition.y).toBeGreaterThan(
      pricingPosition.y + pricing.height,
    );
    expect(result.after.metrics.overlapCount).toBe(0);
  });

  it("limits vertical packing when many side flows are eligible", () => {
    const spine = [
      node("spine-0", 0, 0),
      node("spine-1", 240, 0),
      node("spine-2", 480, 0),
      node("spine-3", 720, 0),
      node("spine-4", 960, 0),
      node("spine-5", 1200, 0),
    ];
    const sideNodes = Array.from({ length: 5 }, (_, index) => [
      node(`side-${index}`, 240, 180 + index * 120),
      node(`side-${index}-store`, 480, 180 + index * 120),
    ]).flat();
    const edges = [
      ...spine.slice(0, -1).map((current, index) =>
        edge(`spine-${index}`, current.id, spine[index + 1].id, {
          relationship: "calls",
        }),
      ),
      ...sideNodes.flatMap((current) => {
        if (current.id.endsWith("-store")) {
          return [];
        }
        const sideIndex = Number(current.id.split("-")[1]);
        return [
          edge(`side-${sideIndex}`, `spine-${sideIndex}`, current.id, {
            relationship: "calls",
          }),
          edge(
            `side-${sideIndex}-store`,
            current.id,
            `side-${sideIndex}-store`,
            { relationship: "writes" },
          ),
        ];
      }),
    ];

    const result = improveCauscapeGraph(
      graph([...spine, ...sideNodes], edges),
      {
        originX: 0,
        originY: 0,
        gapX: 80,
        gapY: 40,
        enableVerticalSubflows: true,
      },
    );
    const verticalBranches = Array.from({ length: 5 }, (_, index) => {
      const anchor = result.positions.get(`spine-${index}`);
      const branch = result.positions.get(`side-${index}`);
      return (
        anchor &&
        branch &&
        branch.x === anchor.x &&
        branch.y > anchor.y + spine[index].height
      );
    }).filter(Boolean);

    expect(verticalBranches.length).toBeLessThanOrEqual(2);
    expect(verticalBranches.length).toBeLessThan(5);
    expect(result.after.metrics.overlapCount).toBe(0);
  });

  it("keeps side flows layered when their spine anchor is a hub", () => {
    const spine = Array.from({ length: 6 }, (_, index) =>
      node(`hub-spine-${index}`, index * 240, 0),
    );
    const sideNodes = Array.from({ length: 3 }, (_, index) => [
      node(`hub-side-${index}`, 240, 180 + index * 120),
      node(`hub-side-${index}-store`, 480, 180 + index * 120),
    ]).flat();
    const edges = [
      ...spine.slice(0, -1).map((current, index) =>
        edge(`hub-spine-${index}`, current.id, spine[index + 1].id, {
          relationship: "calls",
        }),
      ),
      ...sideNodes.flatMap((current) => {
        if (current.id.endsWith("-store")) {
          return [];
        }
        const sideIndex = Number(current.id.split("-")[2]);
        return [
          edge(`hub-side-${sideIndex}`, "hub-spine-2", current.id, {
            relationship: "calls",
          }),
          edge(
            `hub-side-${sideIndex}-store`,
            current.id,
            `hub-side-${sideIndex}-store`,
            { relationship: "writes" },
          ),
        ];
      }),
    ];

    const result = improveCauscapeGraph(
      graph([...spine, ...sideNodes], edges),
      {
        originX: 0,
        originY: 0,
        gapX: 80,
        gapY: 40,
        enableVerticalSubflows: true,
      },
    );
    const hubPosition = result.positions.get("hub-spine-2") as {
      x: number;
      y: number;
    };
    const verticalBranches = Array.from({ length: 3 }, (_, index) => {
      const branch = result.positions.get(`hub-side-${index}`);
      return (
        branch &&
        branch.x === hubPosition.x &&
        branch.y > hubPosition.y + spine[2].height
      );
    }).filter(Boolean);

    expect(verticalBranches).toHaveLength(0);
  });

  it("moves observability branches into a dedicated bottom lane", () => {
    const user = node("user", 0, 0);
    const service = node("service", 240, 0);
    const response = node("response", 480, 0);
    const telemetry = node("telemetry", 480, 180, {
      label: "Telemetry Collector",
    });
    const metrics = node("metrics", 720, 180, { label: "Metrics Store" });
    const trace = node("trace", 960, 180, { label: "Trace Backend" });

    const result = improveCauscapeGraph(
      graph(
        [user, service, response, telemetry, metrics, trace],
        [
          edge("user-service", "user", "service", { relationship: "calls" }),
          edge("service-response", "service", "response", {
            relationship: "calls",
          }),
          edge("service-telemetry", "service", "telemetry", {
            relationship: "depends-on",
          }),
          edge("response-telemetry", "response", "telemetry", {
            relationship: "depends-on",
          }),
          edge("telemetry-metrics", "telemetry", "metrics", {
            relationship: "writes",
          }),
          edge("telemetry-trace", "telemetry", "trace", {
            relationship: "depends-on",
          }),
        ],
      ),
      { originX: 0, originY: 0, gapX: 80, gapY: 40 },
    );

    const responsePosition = result.positions.get("response") as {
      x: number;
      y: number;
    };
    const telemetryPosition = result.positions.get("telemetry") as {
      x: number;
      y: number;
    };
    const metricsPosition = result.positions.get("metrics") as {
      x: number;
      y: number;
    };
    const tracePosition = result.positions.get("trace") as {
      x: number;
      y: number;
    };

    expect(telemetryPosition.y).toBeGreaterThan(
      responsePosition.y + response.height,
    );
    expect(metricsPosition.y).toBe(telemetryPosition.y);
    expect(tracePosition.y).toBe(telemetryPosition.y);
    expect(result.after.metrics.overlapCount).toBe(0);
  });

  it("detects overlaps, edge-through-node failures, and crossings", () => {
    const throughGraph = graph(
      [node("a", 0, 0), node("obstacle", 100, 0), node("b", 200, 0)],
      [edge("a-b", "a", "b")],
    );
    const throughReport = analyzeGraphQuality(throughGraph);
    expect(throughReport.metrics.edgeThroughNodeCount).toBe(1);
    expect(throughReport.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EDGE_THROUGH_NODE",
          elementIds: ["a-b", "obstacle"],
        }),
      ]),
    );

    const crossingGraph = graph(
      [
        node("a", 0, 0),
        node("b", 0, 100),
        node("c", 200, 100),
        node("d", 200, 0),
      ],
      [edge("a-c", "a", "c"), edge("b-d", "b", "d")],
    );
    expect(
      analyzeGraphQuality(crossingGraph, {
        routes: new Map<string, CauscapeEdgeGeometry>([
          [
            "a-c",
            {
              x: 0,
              y: 0,
              width: 200,
              height: 100,
              points: [
                [0, 0],
                [200, 100],
              ],
            },
          ],
          [
            "b-d",
            {
              x: 0,
              y: 0,
              width: 200,
              height: 100,
              points: [
                [0, 100],
                [200, 0],
              ],
            },
          ],
        ]),
      }).metrics.crossingCount,
    ).toBe(1);

    const overlapGraph = graph([node("left", 0, 0), node("right", 10, 10)], []);
    expect(analyzeGraphQuality(overlapGraph).metrics.overlapCount).toBe(1);
  });

  it("detects routes that are detached from their endpoint cards", () => {
    const source = node("source", 0, 0, { width: 120, height: 80 });
    const target = node("target", 260, 0, { width: 120, height: 80 });
    const report = analyzeGraphQuality(
      graph([source, target], [edge("source-target", "source", "target")]),
      {
        routes: new Map([
          [
            "source-target",
            {
              x: 0,
              y: 0,
              width: 260,
              height: 80,
              points: [
                [60, 40],
                [260, 80],
              ],
            },
          ],
        ]),
      },
    );

    expect(report.metrics.edgeDetachedCount).toBe(1);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EDGE_DETACHED",
          elementIds: ["source-target"],
        }),
      ]),
    );
  });

  it("detects positive-length shared route segments", () => {
    const firstSource = node("first-source", 0, 0);
    const firstTarget = node("first-target", 200, 0);
    const secondSource = node("second-source", 80, 0);
    const secondTarget = node("second-target", 300, 0);
    const report = analyzeGraphQuality(
      graph(
        [firstSource, firstTarget, secondSource, secondTarget],
        [
          edge("first-route", "first-source", "first-target"),
          edge("second-route", "second-source", "second-target"),
        ],
      ),
      {
        routes: new Map([
          [
            "first-route",
            {
              x: 20,
              y: 10,
              width: 180,
              height: 1,
              points: [
                [0, 0],
                [180, 0],
              ],
            },
          ],
          [
            "second-route",
            {
              x: 100,
              y: 10,
              width: 200,
              height: 1,
              points: [
                [0, 0],
                [200, 0],
              ],
            },
          ],
        ]),
      },
    );

    expect(report.metrics.routeOverlapCount).toBeGreaterThan(0);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EDGE_ROUTE_OVERLAP" }),
      ]),
    );
  });

  it("chooses a separate channel for parallel typed relationships", () => {
    const source = node("source", 0, 0, { width: 120, height: 80 });
    const target = node("target", 260, 0, { width: 120, height: 80 });
    const result = improveCauscapeGraph(
      graph(
        [source, target],
        [
          edge("read", "source", "target", { relationship: "reads" }),
          edge("write", "source", "target", { relationship: "writes" }),
        ],
      ),
      { originX: 0, originY: 0, gapX: 80, gapY: 40 },
    );

    expect(result.after.metrics.routeOverlapCount).toBe(0);
  });

  it("routes around pinned obstacles and keeps pinned positions unchanged", () => {
    const input = graph(
      [
        node("source", 0, 0, { locked: true }),
        node("obstacle", 100, 0, { locked: true }),
        node("target", 200, 0, { locked: true }),
        node("free", 0, 0),
      ],
      [edge("source-target", "source", "target")],
    );
    const result = improveCauscapeGraph(input);

    expect(result.positions.get("source")).toEqual({ x: 0, y: 0 });
    expect(result.positions.get("obstacle")).toEqual({ x: 100, y: 0 });
    expect(result.after.metrics.edgeThroughNodeCount).toBe(0);
    expect(result.after.metrics.overlapCount).toBe(0);
    expect(result.edges.get("source-target")?.points.length).toBeGreaterThan(2);
    expect(result.changedNodeIds).toContain("free");
  });

  it("reports cyclic and disconnected concerns with deterministic results", () => {
    const input = graph(
      [node("a", 0, 0), node("b", 200, 0), node("isolated", 400, 0)],
      [edge("a-b", "a", "b"), edge("b-a", "b", "a")],
    );
    const first = improveCauscapeGraph(input, { originX: 20, originY: 30 });
    const second = improveCauscapeGraph(input, { originX: 20, originY: 30 });

    expect(first.after.metrics).toMatchObject({
      componentCount: 2,
      cycleCount: 1,
      disconnectedNodeCount: 1,
    });
    expect(first.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GRAPH_DISCONNECTED_COMPONENT" }),
        expect.objectContaining({ code: "GRAPH_HAS_CYCLES" }),
      ]),
    );
    expect([...first.positions]).toEqual([...second.positions]);
    expect([...first.edges]).toEqual([...second.edges]);
  });

  it("includes label and viewport health in the agent-readable report", () => {
    const report = analyzeGraphQuality(
      graph(
        [
          node("long", 1000, 1000, {
            label: "A very long label that cannot fit",
          }),
        ],
        [],
      ),
      {
        viewport: { scrollX: 0, scrollY: 0, width: 100, height: 100, zoom: 1 },
      },
    );

    expect(report.metrics.labelOverflowCount).toBe(1);
    expect(report.metrics.offViewportNodeCount).toBe(1);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "NODE_LABEL_OVERFLOW" }),
        expect.objectContaining({ code: "NODE_OUTSIDE_VIEWPORT" }),
      ]),
    );
  });
});

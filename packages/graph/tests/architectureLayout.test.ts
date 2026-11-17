import {
  newCauscapeEdgeElement,
  newCauscapeNodeElement,
} from "@causcape/element";

import type { CauscapeElement } from "@causcape/element/types";

import {
  buildGraph,
  improveCauscapeGraph,
  rerouteCauscapeEdges,
  type CauscapeEdgeGeometry,
} from "../src";

type Kind = "service" | "datastore" | "queue" | "external-system" | "user";

// A typical agent-generated e-commerce architecture with real card sizes.
const NODES: ReadonlyArray<readonly [string, Kind, string]> = [
  ["user", "user", "Customer"],
  ["web", "service", "Web App"],
  ["mobile", "service", "Mobile App"],
  ["gateway", "service", "API Gateway"],
  ["auth", "service", "Auth Service"],
  ["orders", "service", "Order Service"],
  ["payments", "service", "Payment Service"],
  ["inventory", "service", "Inventory Service"],
  ["catalog", "service", "Catalog Service"],
  ["notify", "service", "Notification Service"],
  ["search", "service", "Search Service"],
  ["bus", "queue", "Event Bus"],
  ["ordersdb", "datastore", "Orders DB"],
  ["usersdb", "datastore", "Users DB"],
  ["catalogdb", "datastore", "Catalog DB"],
  ["cache", "datastore", "Redis Cache"],
  ["index", "datastore", "Search Index"],
  ["stripe", "external-system", "Stripe"],
  ["email", "external-system", "SendGrid"],
  ["metrics", "service", "Metrics Collector"],
];

const EDGES: ReadonlyArray<readonly [string, string, string, string]> = [
  ["user", "web", "calls", "HTTPS"],
  ["user", "mobile", "calls", "HTTPS"],
  ["web", "gateway", "calls", "REST"],
  ["mobile", "gateway", "calls", "REST"],
  ["gateway", "auth", "calls", "verify token"],
  ["gateway", "orders", "calls", "place order"],
  ["gateway", "catalog", "calls", "browse"],
  ["gateway", "search", "calls", "query"],
  ["auth", "usersdb", "reads", "users"],
  ["orders", "ordersdb", "writes", "orders"],
  ["orders", "payments", "calls", "charge"],
  ["orders", "inventory", "calls", "reserve stock"],
  ["payments", "stripe", "calls", "payment intent"],
  ["orders", "bus", "publishes", "OrderPlaced"],
  ["notify", "bus", "subscribes", "OrderPlaced"],
  ["search", "bus", "subscribes", "CatalogChanged"],
  ["catalog", "bus", "publishes", "CatalogChanged"],
  ["catalog", "catalogdb", "reads", "products"],
  ["catalog", "cache", "reads", "hot products"],
  ["search", "index", "reads", "documents"],
  ["notify", "email", "calls", "send email"],
  ["inventory", "catalogdb", "writes", "stock"],
  ["orders", "metrics", "publishes", "telemetry"],
  ["payments", "metrics", "publishes", "telemetry"],
];

const buildArchitecture = () => {
  const elements: CauscapeElement[] = NODES.map(([id, kind, label], index) =>
    newCauscapeNodeElement({
      id,
      label,
      kind,
      description: `${label} component`,
      technologies: ["TypeScript"],
      x: (index % 5) * 40,
      y: Math.floor(index / 5) * 40,
    } as never),
  );
  for (const [from, to, relationship, label] of EDGES) {
    const edge = newCauscapeEdgeElement({
      id: `${from}->${to}`,
      fromNodeId: from,
      toNodeId: to,
      label,
    } as never);
    elements.push({
      ...edge,
      causcape: { ...edge.causcape, relationship },
    } as CauscapeElement);
  }
  return elements;
};

const applyLayout = (
  elements: readonly CauscapeElement[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
  routes: ReadonlyMap<string, CauscapeEdgeGeometry>,
): CauscapeElement[] =>
  elements.map(
    (element) =>
      ({
        ...element,
        ...(positions.get(element.id) ?? {}),
        ...(routes.get(element.id) ?? {}),
      } as CauscapeElement),
  );

describe("architecture layout", () => {
  it("lays out a 20-service architecture quickly and readably", () => {
    const graph = buildGraph(buildArchitecture(), { includeDiagnostics: true });

    const start = performance.now();
    const result = improveCauscapeGraph(graph);
    const elapsed = performance.now() - start;

    // This took over two minutes before candidate pruning; a large margin
    // keeps the guard stable on slow CI machines.
    expect(elapsed).toBeLessThan(15_000);
    expect(result.after.metrics).toMatchObject({
      overlapCount: 0,
      edgeThroughNodeCount: 0,
      edgeDetachedCount: 0,
      edgeClearanceCount: 0,
      routeOverlapCount: 0,
      edgeLabelOverlapCount: 0,
    });
    expect(result.after.metrics.crossingCount).toBeLessThanOrEqual(8);
  });

  it("keeps catalog services in the main flow instead of the observability lane", () => {
    const graph = buildGraph(buildArchitecture(), { includeDiagnostics: true });
    const result = improveCauscapeGraph(graph);
    const bottom = (id: string) => {
      const node = graph.nodesById.get(id)!;
      return result.positions.get(id)!.y + node.height;
    };
    const metricsTop = result.positions.get("metrics")!.y;

    // "Catalog" contains "log", which used to match the observability rule.
    expect(bottom("catalog")).toBeLessThan(metricsTop);
    expect(bottom("catalogdb")).toBeLessThan(metricsTop);
  });

  it("re-routes only the edges a dragged card affects", () => {
    const elements = buildArchitecture();
    const graph = buildGraph(elements, { includeDiagnostics: false });
    const layout = improveCauscapeGraph(graph);
    const laidOut = applyLayout(elements, layout.positions, layout.edges);

    const dragged = laidOut.map((element) =>
      element.id === "search" ? { ...element, y: element.y + 40 } : element,
    ) as CauscapeElement[];
    const draggedGraph = buildGraph(dragged, { includeDiagnostics: false });

    const start = performance.now();
    const routes = rerouteCauscapeEdges(draggedGraph, {
      changedNodeIds: new Set(["search"]),
    });
    const elapsed = performance.now() - start;

    const attached = EDGES.filter(
      ([from, to]) => from === "search" || to === "search",
    ).map(([from, to]) => `${from}->${to}`);
    expect([...routes.keys()]).toEqual(expect.arrayContaining(attached));
    // Unrelated flows keep their stored geometry.
    expect(routes.has("user->web")).toBe(false);
    expect(routes.has("orders->payments")).toBe(false);
    expect(elapsed).toBeLessThan(5_000);

    const search = draggedGraph.nodesById.get("search")!;
    const touchesSearch = ([x, y]: number[]) =>
      x >= search.x - 2 &&
      x <= search.x + search.width + 2 &&
      y >= search.y - 2 &&
      y <= search.y + search.height + 2;
    for (const id of attached) {
      const route = routes.get(id)!;
      const points = route.points.map(([x, y]) => [x + route.x, y + route.y]);
      // Subscriptions run against the stored direction, so check both ends:
      // the route must attach to the card at its new position.
      expect(
        touchesSearch(points[0]) || touchesSearch(points[points.length - 1]),
      ).toBe(true);
    }
  });

  it("re-routes an untouched edge when a dragged card lands on its route", () => {
    const elements = buildArchitecture();
    const graph = buildGraph(elements, { includeDiagnostics: false });
    const layout = improveCauscapeGraph(graph);
    const laidOut = applyLayout(elements, layout.positions, layout.edges);

    const route = layout.edges.get("user->web")!;
    const [start, end] = route.points
      .slice(0, 2)
      .map(([x, y]) => [x + route.x, y + route.y]);
    const metrics = graph.nodesById.get("metrics")!;
    // Drop the metrics card centered on the first segment of user->web.
    const dropped = laidOut.map((element) =>
      element.id === "metrics"
        ? {
            ...element,
            x: (start[0] + end[0]) / 2 - metrics.width / 2,
            y: (start[1] + end[1]) / 2 - metrics.height / 2,
          }
        : element,
    ) as CauscapeElement[];
    const routes = rerouteCauscapeEdges(
      buildGraph(dropped, { includeDiagnostics: false }),
      { changedNodeIds: new Set(["metrics"]) },
    );

    expect(routes.has("user->web")).toBe(true);
  });

  it("straightens an edge once the card it detoured around moves away", () => {
    const card = (id: string, x: number, y: number) =>
      newCauscapeNodeElement({
        id,
        label: id,
        kind: "service",
        x,
        y,
      } as never) as CauscapeElement;
    const elements: CauscapeElement[] = [
      card("source", 0, 0),
      card("blocker", 900, 0),
      card("target", 1800, 0),
      {
        ...newCauscapeEdgeElement({
          id: "source->target",
          fromNodeId: "source",
          toNodeId: "target",
        } as never),
      } as CauscapeElement,
    ];
    const graph = buildGraph(elements, { includeDiagnostics: false });
    const layout = improveCauscapeGraph(graph, {
      pinnedNodeIds: new Set(["source", "blocker", "target"]),
      maxIterations: 1,
    });
    // The blocker sits on the straight line, so the route bends around it.
    expect(layout.edges.get("source->target")!.points.length).toBeGreaterThan(
      2,
    );

    const blocker = graph.nodesById.get("blocker")!;
    const moved = applyLayout(elements, layout.positions, layout.edges).map(
      (element) =>
        element.id === "blocker" ? { ...element, y: 3000 } : element,
    ) as CauscapeElement[];
    const movedGraph = buildGraph(moved, { includeDiagnostics: false });

    // Without the old position nothing ties the edge to the moved card.
    expect(
      rerouteCauscapeEdges(movedGraph, {
        changedNodeIds: new Set(["blocker"]),
      }).has("source->target"),
    ).toBe(false);

    const routes = rerouteCauscapeEdges(movedGraph, {
      changedNodeIds: new Set(["blocker"]),
      vacatedBoxes: [
        {
          x: blocker.x,
          y: blocker.y,
          width: blocker.width,
          height: blocker.height,
        },
      ],
    });
    expect(routes.get("source->target")?.points).toHaveLength(2);
  });

  it("keeps the layout when a card is locked where it already is", () => {
    const elements = buildArchitecture();
    const layout = improveCauscapeGraph(
      buildGraph(elements, { includeDiagnostics: true }),
    );
    const placed = buildGraph(
      applyLayout(elements, layout.positions, new Map()),
      { includeDiagnostics: true },
    );
    for (const locked of ["catalog", "orders", "bus", "stripe"]) {
      const relaid = improveCauscapeGraph(placed, {
        pinnedNodeIds: new Set([locked]),
      });
      for (const [id, position] of layout.positions) {
        expect(relaid.positions.get(id), `${locked}: ${id}`).toEqual(position);
      }
    }
  });

  it("packs the other cards around cards locked elsewhere", () => {
    // Lock two cards at spots unrelated to where the layout wants them.
    const spots: Record<string, { x: number; y: number }> = {
      orders: { x: 900, y: 2200 },
      catalog: { x: 4100, y: -700 },
    };
    const elements = buildArchitecture().map((element) =>
      spots[element.id] ? { ...element, ...spots[element.id] } : element,
    ) as CauscapeElement[];
    const graph = buildGraph(elements, { includeDiagnostics: true });
    const locked = new Set(Object.keys(spots));
    const result = improveCauscapeGraph(graph, { pinnedNodeIds: locked });

    for (const id of locked) {
      const node = graph.nodesById.get(id)!;
      expect(result.positions.get(id)).toEqual({ x: node.x, y: node.y });
    }
    expect(result.after.metrics.overlapCount).toBe(0);
    expect(result.after.metrics.edgeThroughNodeCount).toBe(0);
  });

  it("attaches every route perpendicular to a card side", () => {
    const graph = buildGraph(buildArchitecture(), { includeDiagnostics: true });
    const result = improveCauscapeGraph(graph);
    const box = (id: string) => ({
      ...graph.nodesById.get(id)!,
      ...result.positions.get(id)!,
    });
    const leavesThroughSide = (
      [x, y]: number[],
      [nextX, nextY]: number[],
      card: ReturnType<typeof box>,
    ) =>
      y === nextY
        ? Math.abs(x - card.x) < 2 || Math.abs(x - card.x - card.width) < 2
        : x === nextX &&
          (Math.abs(y - card.y) < 2 || Math.abs(y - card.y - card.height) < 2);

    for (const [id, route] of result.edges) {
      const [from, to] = id.split("->");
      const relationship = EDGES.find(
        ([source, target]) => `${source}->${target}` === id,
      )![2];
      // Subscriptions are drawn from the topic to the subscriber.
      const [first, last] =
        relationship === "subscribes" ? [to, from] : [from, to];
      const points = route.points.map(([x, y]) => [x + route.x, y + route.y]);
      expect(leavesThroughSide(points[0], points[1], box(first)), id).toBe(
        true,
      );
      expect(
        leavesThroughSide(
          points[points.length - 1],
          points[points.length - 2],
          box(last),
        ),
        id,
      ).toBe(true);
    }
  });

  it.each([
    ["free", {}],
    // Locked cards force routes into tighter channels.
    [
      "locked",
      {
        orders: { x: 13.37, y: 407.77 },
        catalog: { x: 2113.37, y: 407.77 },
      },
    ],
  ] as const)("keeps routes apart unless they cross (%s)", (_, spots) => {
    const locked: Record<string, { x: number; y: number }> = spots;
    const elements = buildArchitecture().map((element) =>
      locked[element.id] ? { ...element, ...locked[element.id] } : element,
    ) as CauscapeElement[];
    const graph = buildGraph(elements, { includeDiagnostics: true });
    const result = improveCauscapeGraph(graph, {
      pinnedNodeIds: new Set(Object.keys(locked)),
    });
    const routes = [...result.edges].map(
      ([id, route]) =>
        [id, route.points.map(([x, y]) => [x + route.x, y + route.y])] as const,
    );
    const contacts: string[] = [];
    for (let first = 0; first < routes.length; first += 1) {
      for (let second = first + 1; second < routes.length; second += 1) {
        const [aId, a] = routes[first];
        const [bId, b] = routes[second];
        for (let i = 1; i < a.length; i += 1) {
          for (let j = 1; j < b.length; j += 1) {
            const [p, q, r, t] = [a[i - 1], a[i], b[j - 1], b[j]];
            const gap = (axis: 0 | 1) =>
              Math.max(
                0,
                Math.max(
                  Math.min(p[axis], q[axis]),
                  Math.min(r[axis], t[axis]),
                ) -
                  Math.min(
                    Math.max(p[axis], q[axis]),
                    Math.max(r[axis], t[axis]),
                  ),
              );
            const horizontal = (u: number[], v: number[]) => u[1] === v[1];
            // A perpendicular pair whose interiors meet is a real crossing.
            const crosses =
              horizontal(p, q) !== horizontal(r, t) &&
              (horizontal(p, q)
                ? r[0] > Math.min(p[0], q[0]) &&
                  r[0] < Math.max(p[0], q[0]) &&
                  p[1] > Math.min(r[1], t[1]) &&
                  p[1] < Math.max(r[1], t[1])
                : p[0] > Math.min(r[0], t[0]) &&
                  p[0] < Math.max(r[0], t[0]) &&
                  r[1] > Math.min(p[1], q[1]) &&
                  r[1] < Math.max(p[1], q[1]));
            if (Math.hypot(gap(0), gap(1)) < 12 && !crosses) {
              contacts.push(`${aId} ~ ${bId}`);
            }
          }
        }
      }
    }
    // Lines that meet at a corner or run side by side read as connections
    // that do not exist.
    expect(contacts).toEqual([]);
  });

  it("returns no routes when nothing changed", () => {
    const elements = buildArchitecture();
    const graph = buildGraph(elements, { includeDiagnostics: false });
    const layout = improveCauscapeGraph(graph);
    const laidOut = applyLayout(elements, layout.positions, layout.edges);

    expect(
      rerouteCauscapeEdges(buildGraph(laidOut, { includeDiagnostics: false }))
        .size,
    ).toBe(0);
  });

  it("centers a parent's children around it instead of stacking below", () => {
    const elements = buildArchitecture();
    const graph = buildGraph(elements, { includeDiagnostics: true });
    const result = improveCauscapeGraph(graph);
    const center = (id: string) =>
      result.positions.get(id)!.y + graph.nodesById.get(id)!.height / 2;

    // The customer's two clients sit on either side of it.
    const clients = [center("web"), center("mobile")].sort((a, b) => a - b);
    expect(clients[0]).toBeLessThan(center("user"));
    expect(clients[1]).toBeGreaterThan(center("user"));
  });
});

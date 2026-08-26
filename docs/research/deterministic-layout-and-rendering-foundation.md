# Deterministic layout and rendering foundation

Status: accepted direction for [Wayfinder issue #10](https://github.com/Causcape/Causcape/issues/10), 2026-08-26.

## Decision

Use [`elkjs`](https://github.com/kieler/elkjs) with ELK Layered as the first deterministic layout provider, behind a Causcape-owned, DOM-independent layout interface. Pin the package and a named configuration profile rather than exposing ELK options in the project or agent command schema.

Render the resulting Excalidraw scene with Causcape's existing Excalidraw exporters:

- In the web application, call `exportToSvg` for SVG and `exportToBlob` for PNG.
- In the CLI, load a small, local render bundle in a pinned headless Chromium using Playwright and call those same browser exporters. Do not introduce a second Graphviz, SVG, or canvas renderer.

The browser and CLI therefore share semantic-to-geometry conversion and Excalidraw rendering code. Only their host adapters differ.

This decision separates three responsibilities:

1. The agent submits semantic objects, connections, groups, importance, and bounded layout hints.
2. `causcape-core` normalizes that request and obtains geometry through its layout interface.
3. An Excalidraw adapter creates editable canvas objects and renders them through Excalidraw's exporters.

ELK is a geometry engine, not a renderer, which fits that boundary explicitly ([elkjs README](https://github.com/kieler/elkjs/blob/0.12.0/README.md)).

## Why ELK Layered

Engineering diagrams usually communicate directed flows. ELK Layered arranges nodes in successive layers and supports straight, orthogonal, and spline routing. Its orthogonal mode respects port constraints, and it supports compound graphs and edges crossing hierarchy boundaries ([ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)).

ELK JSON maps closely to Causcape's inputs:

- Nodes have stable IDs, explicit dimensions, children, ports, and layout options.
- Nested children represent groups.
- Extended edges identify sources and targets and return start points, bend points, and end points.
- Labels require caller-supplied dimensions; ELK intentionally does not estimate text size ([ELK JSON format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html)).

The same `elkjs` package runs in Node and browsers, either synchronously or through workers. Its browser worker can keep a non-trivial layout off the UI thread; its Node worker support is implemented over `worker_threads`, with a synchronous fallback when no compatible worker wrapper is installed ([elkjs usage](https://github.com/kieler/elkjs/blob/0.12.0/README.md#usage)). Causcape should use a lazy-loaded browser worker and may start synchronously in the CLI, where layout does not block an interactive UI.

Version 0.12.0 is the current released baseline for this decision and is based on ELK 0.12.0 ([elkjs 0.12.0 release](https://github.com/kieler/elkjs/releases/tag/0.12.0)). Pin the exact version. Upgrades must intentionally refresh layout fixtures because a layout engine change can produce valid but different geometry.

## Determinism contract

"Deterministic" must apply to normalized project geometry, not to every field returned by a third-party engine and not to pixels produced by arbitrary host machines.

For a fixed Causcape layout profile, engine version, and normalized request, the core must return the same object bounds and routed points. Enforce that contract as follows:

1. Reject duplicate or missing IDs before layout.
2. Derive every node's width and height before calling ELK. Use Causcape's fixed sizing and wrapping rules; never let platform font measurement influence layout geometry.
3. Canonicalize children, ports, and edges by explicit order hint and then stable ID. Do not rely on object-map iteration or agent submission order.
4. Set a fixed, non-zero `org.eclipse.elk.randomSeed`. ELK documents that zero permits a pseudo-random seed such as system time; ELK Layered currently defaults to one, but Causcape should still set it explicitly ([randomization seed](https://eclipse.dev/elk/reference/options/org-eclipse-elk-randomSeed.html), [ELK Layered defaults](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)).
5. Use explicit fully qualified option names and a versioned profile, initially `engineering-layered-v1`.
6. Ask ELK for root-relative shape and edge coordinates with `org.eclipse.elk.json.shapeCoords=ROOT` and `org.eclipse.elk.json.edgeCoords=ROOT`. ELK otherwise uses parent- or container-relative coordinates, which makes hierarchy-crossing edge conversion easy to mishandle ([ELK coordinate system](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html)).
7. Copy only documented geometry fields from the result: object bounds, port positions, label positions, edge sections, and graph bounds. Never persist or hash the returned graph wholesale. In an empirical Node probe against `elkjs@0.12.0`, geometry was stable across five identical runs, while undocumented `$H` fields changed between calls.
8. Normalize negative zero, reject non-finite numbers, round output coordinates to a documented precision, and validate that every routed edge section is contiguous.
9. Derive Excalidraw element IDs and RoughJS seeds deterministically from project-local canvas object IDs. Preserve supplied IDs when converting element skeletons instead of allowing random regeneration.
10. Version the render profile as well as the layout profile. A browser, bundled font, RoughJS, or Excalidraw upgrade may change SVG markup or PNG pixels without changing project geometry.

The canonical regression assertion is normalized geometry JSON. SVG structure and PNG snapshots are secondary integration checks run in one pinned Linux/Chromium/font environment; cross-operating-system PNG byte equality is not promised.

## Initial layout profile

`engineering-layered-v1` should use:

- `org.eclipse.elk.algorithm=layered`
- a project/request direction with `RIGHT` as the default
- `org.eclipse.elk.edgeRouting=ORTHOGONAL`
- `org.eclipse.elk.hierarchyHandling=INCLUDE_CHILDREN`
- a fixed, non-zero random seed
- root-relative shape and edge coordinates
- fixed Causcape-owned spacing and padding constants

Compile agent-facing hints into this closed vocabulary:

| Agent input                | Layout translation                                                             |
| -------------------------- | ------------------------------------------------------------------------------ |
| Group membership           | Nested ELK child node                                                          |
| Importance                 | Deterministic node size class; edge importance may also raise routing priority |
| Preferred flow             | Graph direction                                                                |
| Before/after or same stage | Model order and layer constraints                                              |
| Connection side            | Explicit ports and fixed-side or fixed-order port constraints                  |
| Keep position              | A Causcape placement policy; do not silently relayout human-authored objects   |

ELK supports port constraint levels from free through fixed position ([port constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html)) and can preserve model order when requested ([force node model order](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-forceNodeModelOrder.html)). Causcape should expose meaningful hints such as `direction`, `order`, and `portSide`, not arbitrary ELK option strings. This keeps project patches stable if the provider changes.

For changes to an existing project, layout only newly generated objects or an explicitly selected subgraph by default. Existing human-authored positions are constraints, not suggestions. A full-project reflow requires an explicit command because deterministically replacing a user's layout is still destructive to their presentation.

## Excalidraw conversion and rendering

Convert each normalized layout result into ordinary Excalidraw elements:

- object bounds become the `x`, `y`, `width`, and `height` of existing shapes or prepared engineering shapes;
- ELK edge section points become local points on an Excalidraw arrow, preserving every orthogonal bend;
- stable source and target IDs establish Excalidraw bindings;
- group bounds become the selected Causcape boundary/frame representation;
- names and metadata remain Causcape data and are not inferred from rendered text.

The fork already exports `convertToExcalidrawElements`, `restoreElements`, `exportToSvg`, and `exportToBlob` from `packages/excalidraw/index.tsx`. Its SVG exporter builds the SVG through DOM APIs and renders with RoughJS; its Blob exporter renders through the canvas path. The package also contains a Node canvas example, but that path requires a separate canvas/font implementation and does not cover the SVG DOM path. Reusing a browser render bundle for both CLI formats gives better parity than maintaining Node-specific DOM, canvas, image, and font shims ([Excalidraw export source](https://github.com/Causcape/Causcape/blob/main/packages/excalidraw/scene/export.ts), [Causcape Excalidraw exports](https://github.com/Causcape/Causcape/blob/main/packages/excalidraw/index.tsx)).

For CLI rendering:

1. Build one local render page from the same Excalidraw adapter used by the application.
2. Launch only Chromium headlessly and load no remote resources.
3. Install and pin the Playwright-coupled browser binary. Playwright states that each package version requires specific browser binaries, and it supports a hermetic local browser installation ([Playwright browser versions](https://playwright.dev/docs/browsers#introduction), [hermetic install](https://playwright.dev/docs/browsers#hermetic-install)).
4. Bundle the exact fonts used by canvas objects, await `document.fonts.ready`, then export.
5. Serialize `SVGSVGElement.outerHTML` for SVG. For PNG, return the bytes from `exportToBlob({ mimeType: "image/png" })`.
6. Keep one warm browser per CLI process when rendering multiple iterations, but isolate each render in a fresh page or browser context.

The cost is material: Playwright's browser installation is hundreds of megabytes, while `elkjs@0.12.0` includes an approximately 1.6 MB minified worker. Keep both out of the initial application chunk by lazy-loading the ELK worker and making Chromium an explicit CLI render dependency ([Playwright browser storage](https://playwright.dev/docs/browsers#managing-browser-binaries), [`elkjs@0.12.0` package contents](https://unpkg.com/browse/elkjs@0.12.0/lib/)). The CLI should report a clear missing-renderer installation error; layout, inspect, patch, and validate commands must continue to work without Chromium.

## Alternatives considered

### Dagre

Dagre is MIT-licensed, small, rendering-agnostic, and available in browser and Node contexts. It accepts node dimensions and returns node centers and edge control points ([Dagre documentation](https://github.com/dagrejs/dagre/wiki), [Dagre license](https://github.com/dagrejs/dagre/blob/master/LICENSE)). It is a reasonable fallback candidate if ELK's size or license becomes unacceptable.

Do not choose it for the first foundation. Its public configuration surface is primarily direction, rank separation, node separation, ranker, and edge weights. ELK directly documents orthogonal routing, ports and port constraints, compound graphs with cross-hierarchy edges, and a much richer constraint model. Those capabilities match architecture and incident diagrams more closely and avoid building a second routing layer immediately.

### Graphviz, including WebAssembly builds

Graphviz can lay out clustered graphs and produce JSON, SVG, and PNG. The maintained HPCC WebAssembly build runs Graphviz in Node and browsers ([Graphviz JSON](https://graphviz.org/docs/outputs/json/), [Graphviz SVG](https://graphviz.org/docs/outputs/svg/), [HPCC Graphviz WASM](https://github.com/hpcc-systems/hpcc-js-wasm)).

Do not use Graphviz as Causcape's renderer. Its SVG and PNG would be a separate visual system, while converting Graphviz drawing operations back into editable Excalidraw elements adds an unnecessary translation surface. As a layout-only provider it remains viable, but ELK JSON maps more directly to nested semantic objects, ports, and routed edge sections. Current Graphviz is EPL-2.0, so it also does not remove the license review required by ELK ([Graphviz license](https://graphviz.org/license/)).

### Pure-Node DOM/canvas shims or SVG rasterization

Do not begin with `jsdom`/`linkedom` plus `canvas`, or with an independent SVG-to-PNG library. Excalidraw's export path uses DOM, canvas, fonts, images, and browser font APIs. Reproducing only enough browser behavior to pass simple diagrams creates a second rendering platform whose differences will appear in text measurement, images, frames, and future Excalidraw changes. A pinned headless browser is heavier but makes the CLI exercise the supported browser path.

## Licensing

`elkjs@0.12.0` is available under EPL-2.0 or GPL-3.0-or-later; Causcape should consume it under EPL-2.0 and preserve its license and notices ([elkjs license](https://github.com/kieler/elkjs/blob/0.12.0/LICENSE.md)). EPL obligations and the application's distribution model need legal review before a public release. Keep `elkjs` isolated behind the layout interface so it can be replaced without changing project files or agent commands.

Playwright is Apache-2.0 licensed ([Playwright license](https://github.com/microsoft/playwright/blob/main/LICENSE)). Excalidraw and this fork retain their MIT license. Record all three in third-party notices when the dependencies are introduced.

## Acceptance tests for implementation

The implementation is ready only when all of these pass:

1. The same normalized graph laid out repeatedly in separate Node processes and browser workers yields identical normalized geometry.
2. Input objects and edges supplied in different orders yield identical geometry after Causcape canonicalization, unless an explicit order hint differs.
3. A nested group with a cross-group edge maps to correct root-relative Excalidraw coordinates.
4. An orthogonal route with multiple bend points remains editable and bound after Excalidraw restore/serialization.
5. IDs, element seeds, and normalized geometry remain stable across export, import, and CLI patch application.
6. Browser and CLI SVG exports have the same normalized structure in the pinned render profile.
7. PNG visual snapshots cover labels, arrows, groups, images, and the bundled fonts in pinned Chromium.
8. Missing Chromium fails only `project render` with an actionable installation message; non-rendering CLI commands remain operational.
9. Layout failure or invalid output rejects the complete project patch. No partial geometry is committed.
10. Fixture migrations make layout-profile upgrades explicit rather than silently reflowing stored projects.

## Consequences

- Causcape gets strong engineering-diagram layout features without coupling its public command model to one engine.
- Geometry stays editable as ordinary Excalidraw objects; PNG and SVG remain derived previews.
- The browser pays a lazily loaded worker cost only when automatic layout is requested.
- CLI rendering has a large but explicit Chromium runtime cost.
- Layout and rendering reproducibility depend on pinned profiles and fixtures. Upgrades are product changes, not routine dependency bumps.
- Legal review of EPL-2.0 distribution is a release gate, not an implementation blocker.

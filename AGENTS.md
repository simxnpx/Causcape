# Guidelines

- For new DOM/browser API usage, use `app.ownerDocument` and `app.ownerWindow` instead of globals; without `app`, derive them from the mounted node's `ownerDocument` and its `defaultView`.

## Architecture layout quality

- After creating or editing architecture flows, run `validateGraph` through WebMCP, or `analyzeGraphQuality` with the actual stored routes when working through code. Validate again before exporting or handing off a project. Schema validation alone does not check visual quality.
- Enforce the shared `GRAPH_SPACING` minima: 80 scene units of straight runway at each endpoint, 64 units between passing segments and cards, and 12 units between labels and cards. Only the segment attached to a card may enter its clearance margin. Zero overlaps is not enough.
- Use `autoLayout` to repair spacing diagnostics, then inspect the result. If the same diagnostics persist, separate the affected cards rather than repeat an unchanged layout. Preserve locked or human-pinned positions; ask before relaxing them. Report unresolved constraints instead of claiming a clean layout.
- Inspect the rendered diagram as well as the report. Confirm that arrows, labels, and return lanes remain readable at the intended viewing zoom.

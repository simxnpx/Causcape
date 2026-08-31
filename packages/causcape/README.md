# Causcape

**Causcape** is exported as a React component that you can embed directly in your app.

## Installation

Install the package together with its React peer dependencies.

```bash
npm install react react-dom @causcape/causcape
# or
yarn add react react-dom @causcape/causcape
```

> **Note**: If you want to try unreleased changes, use `@causcape/causcape@next`.

## Quick start

The minimum working setup has two easy-to-miss requirements:

1. Import the package CSS:

```ts
import "@causcape/causcape/index.css";
```

2. Render Causcape inside a container with a non-zero height.

```tsx
import { Causcape } from "@causcape/causcape";
import "@causcape/causcape/index.css";

export default function App() {
  return (
    <div style={{ height: "100vh" }}>
      <Causcape />
    </div>
  );
}
```

Causcape fills `100%` of the width and height of its parent. If the parent has no height, the canvas will not be visible.

## Next.js / SSR frameworks

Causcape should be rendered on the client. In SSR frameworks such as Next.js, use a client component and load it dynamically with SSR disabled.

```tsx
// app/components/CauscapeClient.tsx
"use client";

import { Causcape } from "@causcape/causcape";
import "@causcape/causcape/index.css";

export default function CauscapeClient() {
  return (
    <div style={{ height: "100vh" }}>
      <Causcape />
    </div>
  );
}
```

```tsx
// app/page.tsx
import dynamic from "next/dynamic";

const CauscapeClient = dynamic(() => import("./components/CauscapeClient"), {
  ssr: false,
});

export default function Page() {
  return <CauscapeClient />;
}
```

See the local examples for complete setups:

- [examples/with-nextjs](https://github.com/causcape/causcape/tree/master/examples/with-nextjs)
- [examples/with-script-in-browser](https://github.com/causcape/causcape/tree/master/examples/with-script-in-browser)

## LLM / agent tips

If an LLM or coding agent is setting up Causcape, these shortcuts usually save more time than re-prompting:

- Start with a plain `<Causcape />` in a `100vh` container. Add refs, `initialData`, persistence, or custom UI only after the base embed works.
- If the canvas is blank, check the CSS import and parent height first. Those are the two most common integration failures.
- In Next.js or other SSR frameworks, assume client-only rendering first. Use `"use client"` and `dynamic(..., { ssr: false })` before debugging hydration or `window is not defined` errors.
- If imports or entrypoints are unclear, inspect `node_modules/@causcape/causcape/package.json`. The installed package exports are the source of truth.
- Do not set `window.CAUSCAPE_ASSET_PATH` unless you are intentionally self-hosting fonts/assets.
- When docs and generated code drift, copy the nearest working example from this repo, especially `examples/with-nextjs` or `examples/with-script-in-browser`.

## Migrating to `@causcape/causcape@0.18.x`

Version `0.18.x` removes the old `types/`-prefixed deep import paths. If you were importing types from `@causcape/causcape/types/...`, switch to the new type-only subpaths below.

| Old path | New path |
| --- | --- |
| `@causcape/causcape/types/data/transform.js` | `@causcape/causcape/element/transform` |
| `@causcape/causcape/types/data/types.js` | `@causcape/causcape/data/types` |
| `@causcape/causcape/types/element/types.js` | `@causcape/causcape/element/types` |
| `@causcape/causcape/types/utility-types.js` | `@causcape/causcape/common/utility-types` |
| `@causcape/causcape/types/types.js` | `@causcape/causcape/types` |

Drop the `.js` extension. The new package `exports` map resolves these paths without it.

These deep subpaths are for `import type` only. Runtime imports should come from the package root, plus `@causcape/causcape/index.css` for styles.

For example:

```ts
import { exportToSvg } from "@causcape/causcape";
```

## Self-hosting fonts

By default, Causcape downloads the fonts it needs from the [CDN](https://esm.run/@causcape/causcape/dist/prod).

For self-hosting, copy the contents of `node_modules/@causcape/causcape/dist/prod/fonts` into the path where your app serves static assets, for example `public/`. Then set `window.CAUSCAPE_ASSET_PATH` to that same path:

```html
<script>
  window.CAUSCAPE_ASSET_PATH = "/";
</script>
```

## Demo

Try the [CodeSandbox example](https://codesandbox.io/p/sandbox/github/causcape/causcape/tree/master/examples/with-script-in-browser).

## Integration

Read the [integration docs](https://docs.causcape.com/docs/@causcape/causcape/integration).

## API

Read the [API docs](https://docs.causcape.com/docs/@causcape/causcape/api).

## Contributing

Read the [contributing docs](https://docs.causcape.com/docs/@causcape/causcape/contributing).

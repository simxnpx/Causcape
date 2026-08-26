<h4 align="center">
  <a href="#">Causcape Editor</a> |
  <a href="#">Documentation</a> |
  <a href="#">Causcape+</a>
</h4>

<div align="center">
  <h2>
    An open source canvas for engineering architectures and incidents. </br>
    One linked project for diagrams, explanation, and agent changes. </br>
  <br />
  </h2>
</div>

<br />
<p align="center">
  <a href="LICENSE">
    <img alt="Causcape is released under the MIT license." src="https://img.shields.io/badge/license-MIT-blue.svg"  /></a>
  <a href="#">
    <img alt="PRs welcome!" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat"  /></a>
</p>

<div align="center">
  <figure>
    <a href="#" target="_blank" rel="noopener">
      <img src="https://excalidraw.nyc3.cdn.digitaloceanspaces.com/github%2Fproduct_showcase.png" alt="Causcape engineering canvas" />
    </a>
    <figcaption>
      <p align="center">
        Explain an engineering system through a linked canvas and document.
      </p>
    </figcaption>
  </figure>
</div>

## Causcape vertical slice

The desktop application currently supports:

- One local-first project containing an infinite Excalidraw canvas and a structured document.
- Focus mode for the full drawing experience and desktop Briefing mode with a sticky, resizable canvas above the scrolling document.
- Stable inline references from document text to named canvas objects, with selection highlighting, click-to-focus, and explicit deleted placeholders.
- Blank, Architecture, and Post-incident templates, IndexedDB autosave, a recent-project dashboard, and canonical `.causcape` import/export.
- Prepared Service, Database, Queue / Topic, External System, User / Actor, Trust Boundary, and Generic Resource shapes built from ordinary Excalidraw elements.
- A machine-readable CLI for project creation, inspection, validation, atomic revision-checked patches, deterministic ELK layout, and SVG/PNG rendering.

The original Excalidraw drawing tools, libraries, image support, themes, localization, undo/redo, zooming, and canvas-only `.excalidraw` workflows remain available. Real-time collaboration is intentionally not exposed in this first local project slice.

## Run locally

Use Node 22 and Corepack-provided Yarn 1:

```bash
corepack yarn install
corepack yarn start
```

The app opens the most recently edited project or creates a blank local project. See [the vertical-slice contract](dev-docs/docs/causcape/first-vertical-slice.md) and [the CLI guide](packages/causcape-cli/README.md) for the implemented boundaries.

## Upstream editor package

**Note:** following instructions are for installing the Excalidraw [npm package](https://www.npmjs.com/package/@excalidraw/excalidraw) when integrating the Excalidraw editor into your own app. To run the Causcape repository locally for development, see the `excalidraw-app` source in this repository.

Use `npm` or `yarn` to install the package.

```bash
npm install react react-dom @excalidraw/excalidraw
# or
yarn add react react-dom @excalidraw/excalidraw
```

Check out the [documentation](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation) for more details!

## Contributing

Missing something or found a bug? [Report here](https://github.com/Causcape/Causcape/issues).

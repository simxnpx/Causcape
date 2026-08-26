---
title: First desktop vertical slice
---

# First desktop vertical slice

The first Causcape slice proves that one engineering project can be created and changed through both the browser and an external agent without splitting the canvas, document, or object identity into separate artifacts.

## Delivered contract

A project contains exactly one infinite canvas, one structured document, a project-local canvas-object index, and provenance. It opens in Focus mode with the complete Excalidraw experience. Opening the document enters Briefing mode: the canvas remains sticky and resizable above the scrolling document on desktop.

The document stores versioned Causcape JSON. BlockNote is a replaceable browser adapter. An inline canvas reference stores a stable object ID, not a text match. Selecting an object highlights its references; activating a reference selects and focuses every element belonging to that logical object. Deleted targets stay visible as explicit placeholders.

Projects autosave to IndexedDB and reopen from a recent-project dashboard. `.causcape` is the canonical, versioned project file; importing creates an independent local copy. `.excalidraw` remains a canvas-only interchange format.

Prepared engineering shapes use only existing Excalidraw primitives. Group IDs provide one selectable logical identity and regenerate on copy, while embedded name and metadata survive copy and export. The initial vocabulary is Service, Database, Queue / Topic, External System, User / Actor, Network / Trust Boundary, and Generic Resource.

The CLI creates, inspects, validates, previews or atomically applies patches, and renders SVG or PNG. Every patch names an expected revision and records agent provenance. ELK Layered produces deterministic coordinates; the Excalidraw exporter in explicitly provisioned Chromium produces render output.

## Feature commits

| Commit     | Boundary                                                   |
| ---------- | ---------------------------------------------------------- |
| `0aa9864f` | Causcape domain language                                   |
| `538dd9e6` | Versioned project reducer and transaction invariants       |
| `9165d90f` | Focus and desktop Briefing modes                           |
| `7715f9e7` | Structured document and canvas references                  |
| `69903ab8` | Local persistence, dashboard, templates, and project files |
| `c901f7a4` | External-agent CLI, deterministic layout, and rendering    |
| `ab5d724a` | Prepared shapes, logical selection, naming, and metadata   |

Each boundary is independently reviewable and uses the DOM-independent core instead of changing the Excalidraw drawing engine.

## Acceptance checks

- A new Blank, Architecture, or Post-incident project opens and autosaves.
- Focus mode occupies the viewport; Briefing mode keeps the canvas above the document on desktop and permits vertical resizing.
- Any named canvas object can be inserted with `@`, focused from the document, and highlighted in the document from the canvas.
- Renaming updates reference display; deleting leaves a deleted placeholder.
- Prepared shapes behave as one object and copies receive a different stable ID.
- Name and metadata changes persist in the canonical project.
- The CLI rejects malformed or stale patches without modifying the input.
- Equivalent engineering models create identical layouts.
- SVG and PNG renders use the same Excalidraw scene representation as the app.

Run the automated acceptance set from the repository root:

```bash
corepack yarn test:app --run \
  packages/causcape-core/src/core.test.ts \
  packages/causcape-cli/src/commands.test.ts \
  packages/causcape-cli/src/render.test.ts \
  excalidraw-app/data/CauscapeProjectRepository.test.ts \
  excalidraw-app/data/causcapeCanvasObjects.test.ts \
  excalidraw-app/components/CauscapeProjectShell.test.tsx \
  excalidraw-app/components/CauscapeDocumentEditor.test.tsx \
  excalidraw-app/components/CauscapeProjectDashboard.test.tsx \
  excalidraw-app/components/CauscapeEngineeringTools.test.tsx
corepack yarn test:typecheck
corepack yarn build:app
corepack yarn build:causcape-cli
```

## Intentional boundaries

This slice does not add accounts, server persistence, workspaces, multiple canvases per project, live incident response, real-time collaboration, an in-product agent chat, built-in cloud integrations, WebMCP, or full mobile optimization. Those systems should extend the project transaction and CLI contracts rather than bypassing them.

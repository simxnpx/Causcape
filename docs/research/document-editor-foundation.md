# Structured document model and editor foundation

Status: decided

Date: 2026-08-26

Decision owner: Wayfinder issue [#4](https://github.com/Causcape/Causcape/issues/4)

## Decision

Use a **Causcape-owned, versioned JSON document model** in the DOM-independent core, and use **BlockNote** as a replaceable browser editor adapter.

For the first vertical slice:

- Add the open-source `@blocknote/core`, `@blocknote/react`, and `@blocknote/ariakit` packages at one exact, matching version.
- Keep BlockNote, ProseMirror, React, DOM, and editor-history types out of the shared project schema and CLI packages.
- Translate between Causcape document JSON and BlockNote blocks at the application boundary.
- Represent a Canvas Reference as custom inline content carrying `canvasObjectId` plus an optional `labelOverride`.
- Route Undo/Redo by focus: Excalidraw history while the canvas owns focus, BlockNote history while the Document owns focus.
- Render Read mode with the same document adapter in non-editable mode.
- Do not use BlockNote XL packages in this slice.

This is a foundation choice, not permission to adopt BlockNote's collaboration, AI, file, table, comment, or nested-page product surfaces.

## Why this fits the project

Causcape currently runs React 19 and Vite 5 ([application package](https://github.com/Causcape/Causcape/blob/main/excalidraw-app/package.json), [root package](https://github.com/Causcape/Causcape/blob/main/package.json)). BlockNote's current React package explicitly accepts React 18 or 19 and publishes standard import and require exports; its repository also runs the documented examples with Vite ([React package manifest](https://github.com/TypeCellOS/BlockNote/blob/main/packages/react/package.json), [minimal Vite example](https://github.com/TypeCellOS/BlockNote/tree/main/examples/01-basic/01-minimal)).

BlockNote already models a document as stable-ID blocks containing typed properties, inline content, and child blocks. Its default schema includes the required paragraph, heading, bulleted list, numbered list, checklist, and code-block behaviors ([document structure](https://www.blocknotejs.org/docs/foundations/document-structure), [built-in blocks](https://www.blocknotejs.org/docs/features/blocks)). Callout can remain the sole custom block in the MVP.

Canvas References map directly to BlockNote's custom inline-content extension point. A custom inline item can be non-editable, store string/number/boolean properties, render with React, and participate in a custom suggestion menu; the official example uses this mechanism for mentions ([custom inline content](https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content), [mention example source](https://github.com/TypeCellOS/BlockNote/tree/main/examples/06-custom-schema/02-suggestion-menus-mentions)). `canvasObjectId` is therefore stored as structured data, never inferred from matching prose. The renderer resolves the current canvas-object name, applies the selected-object highlight, handles click-to-focus, and shows `Deleted object` when resolution fails. `labelOverride`, when present, changes only the rendered wording.

The editor exposes focus inspection, Undo/Redo, transactions, and editable state directly ([editor API](https://www.blocknotejs.org/docs/reference/editor/overview)). The official read-only example renders the same block document with `editable={false}` ([read-only example](https://www.blocknotejs.org/examples/basic/read-only-editor)). These APIs fit focus-scoped human undo and a lightweight Read mode without inventing a second document renderer. Cross-canvas-and-document Project Patches remain atomic operations in Causcape's command layer; they must not be represented as an editor-local history entry.

## Canonical Causcape document model

The canonical model should be plain TypeScript data equivalent to JSON, defined and validated in the future DOM-free core package. It should expose product semantics rather than editor classes:

```ts
type Document = {
  schemaVersion: 1;
  blocks: DocumentBlock[];
};

type DocumentBlock = {
  id: string;
  type:
    | "paragraph"
    | "heading"
    | "bulletListItem"
    | "numberedListItem"
    | "checkListItem"
    | "codeBlock"
    | "callout";
  props: Record<string, string | number | boolean>;
  content: InlineContent[];
  children: DocumentBlock[];
};

type InlineContent =
  | {
      type: "text";
      text: string;
      styles: TextStyles;
    }
  | {
      type: "link";
      href: string;
      content: StyledText[];
    }
  | {
      type: "canvasReference";
      canvasObjectId: string;
      labelOverride?: string;
    };
```

The precise per-block `props` should be narrowed into discriminated types during implementation: heading level, checklist state, code language, and callout tone are enough for version 1. Block IDs and Canvas Reference target IDs are persistent data. Editor selections, DOM positions, React nodes, menus, hover state, and history stacks are session state and must not be serialized.

The model intentionally resembles BlockNote's public block JSON to keep conversion mechanical, but it is not an alias or re-export of `Block`. BlockNote documents expose JSON-shaped blocks through `editor.document`, and block IDs stay stable until deletion ([document structure](https://www.blocknotejs.org/docs/foundations/document-structure)). Keeping the canonical type independent prevents an editor upgrade from silently becoming a `.causcape` format change and lets the CLI inspect, validate, migrate, and patch documents without constructing a browser editor.

## Serialization and migrations

The `.causcape` Project owns the outer `schemaVersion`; the Document additionally owns its schema version so document migrations can be tested independently of canvas migrations. Loading follows one path in browser and CLI:

1. Parse untrusted JSON.
2. Reject unsupported future versions without mutating or discarding data.
3. Apply explicit, sequential migrations to a copy.
4. Validate the latest Project and Document structures.
5. Only then construct the BlockNote adapter in the browser.

Saving runs the inverse adapter and validates the canonical JSON before persistence. No editor-native JSON or unknown extension nodes are passed through in the file. This is stricter than using an editor's serializer as the product contract: Tiptap, for example, persists extension names into its JSON schema ([extension API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension)), while Lexical custom nodes define their own JSON import/export behavior ([Lexical nodes](https://lexical.dev/docs/concepts/nodes)). In both cases an editor extension change can therefore alter persisted structure. Causcape should make that change only through an explicit migration.

## Editor adapter boundary

The browser-only adapter owns:

- the BlockNote schema and custom Canvas Reference inline spec;
- conversion to and from canonical `Document` JSON;
- the `@` suggestion menu over named canvas objects;
- reference hover, click, highlight, and deleted-placeholder rendering;
- editor-local Undo/Redo and focus reporting;
- edit/read presentation and editor UI composition.

The DOM-independent core owns:

- canonical document types and validation;
- schema migrations;
- referential-integrity checks against project-local canvas-object IDs;
- document operations used by Project Patches;
- deletion semantics and unresolved-reference detection;
- deterministic serialization.

This seam is mandatory. BlockNote's React view is intentionally an uncontrolled component whose editor manages its own live state ([editor setup](https://www.blocknotejs.org/docs/getting-started/editor-setup)); Causcape should synchronize at explicit load, change, patch, and save boundaries rather than trying to make every keystroke a controlled project replacement.

## Alternatives considered

| Foundation | Evidence | Assessment |
| --- | --- | --- |
| **BlockNote** | Purpose-built block editor with a ready UI, typed block JSON, custom inline content, transactions, Undo/Redo, read-only mode, React 19 peer range, and Vite examples ([introduction](https://www.blocknotejs.org/docs), [editor API](https://www.blocknotejs.org/docs/reference/editor/overview), [React manifest](https://github.com/TypeCellOS/BlockNote/blob/main/packages/react/package.json)). | **Choose.** It supplies the closest match to the intended Notion-like experience while allowing Causcape to constrain the schema. |
| **Tiptap 3 / ProseMirror** | Strict schema and transaction model, JSON persistence, inline atomic custom nodes, read-only mode, React 19 peer range, and an official React/Vite setup ([concepts](https://tiptap.dev/docs/editor/core-concepts/introduction), [persistence](https://tiptap.dev/docs/editor/core-concepts/persistence), [node API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node), [React/Vite guide](https://tiptap.dev/docs/editor/getting-started/install/react), [React manifest](https://github.com/ueberdosis/tiptap/blob/main/packages/react/package.json)). | Strong fallback if BlockNote proves visually or operationally constraining. It requires Causcape to build more of the block handles, insertion menus, and editing UX that BlockNote already supplies. |
| **Lexical** | Framework-agnostic immutable editor state, JSON serialization, extensible token/custom nodes, built-in history, read/edit mode, and React 19-compatible peer requirements ([repository](https://github.com/facebook/lexical), [editor state](https://lexical.dev/docs/concepts/editor-state), [nodes](https://lexical.dev/docs/concepts/nodes), [history](https://lexical.dev/docs/concepts/history), [read/edit mode](https://lexical.dev/docs/concepts/read-only), [React manifest](https://github.com/facebook/lexical/blob/main/packages/lexical-react/package.json)). | Technically capable, but it is a lower-level editing framework. Causcape would own substantially more block-editor UX and behavior for no current product advantage. |
| **Slate** | JSON-shaped custom node trees, React rendering, history plugin, read-only rendering, and React 18+ peers ([introduction](https://docs.slatejs.org/), [rendering](https://docs.slatejs.org/concepts/09-rendering), [history](https://docs.slatejs.org/libraries/slate-history), [editable](https://docs.slatejs.org/libraries/slate-react/editable), [React manifest](https://github.com/ianstormtaylor/slate/blob/main/packages/slate-react/package.json)). | Do not choose. Its own documentation still calls the project beta and warns that APIs can break; it also supplies less product-ready block UI than BlockNote. |

Direct ProseMirror is not a separate finalist: Tiptap and BlockNote already expose its schema/transaction capabilities at more appropriate abstraction levels. Choosing it directly would move additional contenteditable integration and UI construction into Causcape.

## Dependency and license boundary

BlockNote's base packages are MPL-2.0, not MIT. Its own license states that commercial and closed-source applications may use the base packages, while modifications to BlockNote source files must be published; its `xl-*` packages use GPL-3.0 or a commercial license ([BlockNote license](https://github.com/TypeCellOS/BlockNote/blob/main/LICENSE.txt)). Mozilla describes MPL-2.0 as file-level copyleft: new surrounding files may remain under another license, but modified MPL-covered files remain covered ([MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)).

Therefore:

- consume released base packages without vendoring or modifying their source;
- keep Causcape extensions and adapters in new Causcape-owned files;
- exclude every `@blocknote/xl-*` package from the MVP;
- preserve dependency notices and have the eventual distribution model reviewed for license compliance.

If MPL-2.0 is rejected as a product constraint, use Tiptap 3 as the fallback; its core repository is MIT-licensed ([Tiptap license](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md)). That choice knowingly adds editor-UX implementation work.

## Validation required during implementation

Before the first editor implementation is merged, add a focused integration spike that proves:

1. The exact pinned BlockNote packages install under the repository's Yarn 1 workspace and build with its React 19/Vite configuration.
2. Canonical JSON round-trips through the adapter without changing stable block IDs or Canvas Reference IDs.
3. `@` inserts a structured Canvas Reference, selection highlighting does not mutate document content, and a missing target renders `Deleted object`.
4. Document Undo does not consume canvas history and canvas Undo does not consume document history.
5. Read mode remains navigable: Canvas References can focus canvas objects while document mutation is disabled.
6. A core/CLI test can parse, migrate, validate, and patch the same document without importing BlockNote or requiring DOM globals.

If any of tests 1-5 fails because of a BlockNote constraint rather than adapter code, stop and re-evaluate the Tiptap fallback before broad implementation.

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/ariakit";
import {
  createReactInlineContentSpec,
  createReactBlockSpec,
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
  useCreateBlockNote,
} from "@blocknote/react";
import {
  createContext,
  useContext,
  useEffect,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import "@blocknote/ariakit/style.css";

import "./CauscapeDocumentEditor.scss";

import type {
  CanvasObject,
  CauscapeDocument,
  DocumentBlock,
  InlineContent as CauscapeInlineContent,
} from "@causcape/core";

type CanvasReferenceProps = {
  objectId: string;
};

type EditorText = {
  type: "text";
  text: string;
  styles: Record<string, boolean>;
};

type EditorLink = {
  type: "link";
  href: string;
  content: EditorText[];
};

type EditorReference = {
  type: "canvasReference";
  props: CanvasReferenceProps;
};

type EditorInline = EditorText | EditorLink | EditorReference;

export type CauscapeEditorBlock = {
  id: string;
  type:
    | "paragraph"
    | "heading"
    | "bulletListItem"
    | "numberedListItem"
    | "checkListItem"
    | "codeBlock"
    | "callout";
  props: Record<string, string | number | boolean | null>;
  content: EditorInline[];
  children: CauscapeEditorBlock[];
};

type ReferenceInteraction = {
  objects: Readonly<Record<string, CanvasObject>>;
  selectedObjectIds: ReadonlySet<string>;
  onActivate?: (objectId: string) => void;
};

const ReferenceInteractionContext = createContext<ReferenceInteraction>({
  objects: {},
  selectedObjectIds: new Set(),
});

const CanvasReferenceView = ({ objectId }: CanvasReferenceProps) => {
  const { objects, selectedObjectIds, onActivate } = useContext(
    ReferenceInteractionContext,
  );
  const object = objects[objectId];
  const isDeleted = !object || object.state === "deleted";
  const displayText = isDeleted
    ? "Deleted object"
    : object.name || object.lastKnownName || "Unnamed object";

  const activate = () => {
    if (!isDeleted) {
      onActivate?.(objectId);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  return (
    <span
      className="causcape-canvas-reference"
      data-object-id={objectId}
      data-deleted={isDeleted || undefined}
      data-selected={selectedObjectIds.has(objectId) || undefined}
      role="link"
      tabIndex={isDeleted ? -1 : 0}
      title={isDeleted ? "This canvas object was deleted" : displayText}
      onClick={activate}
      onKeyDown={handleKeyDown}
    >
      {displayText}
    </span>
  );
};

const CanvasReference = createReactInlineContentSpec(
  {
    type: "canvasReference",
    propSchema: {
      objectId: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: ({ inlineContent }) => (
      <CanvasReferenceView objectId={inlineContent.props.objectId} />
    ),
  },
);

const Callout = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      kind: {
        default: "info",
        values: ["info", "warning", "success", "danger"],
      },
    },
    content: "inline",
  } as const,
  {
    render: ({ block, contentRef }) => (
      <aside
        className="causcape-document-callout"
        data-kind={block.props.kind}
        ref={contentRef}
      />
    ),
  },
)();

export const causcapeDocumentSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: Callout,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    canvasReference: CanvasReference,
  },
});

const blockTypeToEditor = (
  type: DocumentBlock["type"],
): CauscapeEditorBlock["type"] => {
  switch (type) {
    case "bullet-list-item":
      return "bulletListItem";
    case "numbered-list-item":
      return "numberedListItem";
    case "check-list-item":
      return "checkListItem";
    case "code-block":
      return "codeBlock";
    default:
      return type;
  }
};

const blockTypeFromEditor = (
  type: CauscapeEditorBlock["type"],
): DocumentBlock["type"] => {
  switch (type) {
    case "bulletListItem":
      return "bullet-list-item";
    case "numberedListItem":
      return "numbered-list-item";
    case "checkListItem":
      return "check-list-item";
    case "codeBlock":
      return "code-block";
    default:
      return type;
  }
};

const inlineToEditor = (content: CauscapeInlineContent): EditorInline => {
  if (content.type === "canvas-reference") {
    return {
      type: "canvasReference",
      props: { objectId: content.objectId },
    };
  }
  if (content.type === "link") {
    return {
      type: "link",
      href: content.href,
      content: content.content.map(({ text }) => ({
        type: "text",
        text,
        styles: {},
      })),
    };
  }
  return {
    type: "text",
    text: content.text,
    styles: content.styles ?? {},
  };
};

const inlineFromEditor = (content: EditorInline): CauscapeInlineContent => {
  if (content.type === "canvasReference") {
    return {
      type: "canvas-reference",
      objectId: content.props.objectId,
    };
  }
  if (content.type === "link") {
    return {
      type: "link",
      href: content.href,
      content: content.content.map(({ text }) => ({ text })),
    };
  }
  return {
    type: "text",
    text: content.text,
    ...(Object.keys(content.styles).length > 0
      ? { styles: content.styles }
      : {}),
  };
};

export const toBlockNoteDocument = (
  document: CauscapeDocument,
): CauscapeEditorBlock[] =>
  document.blocks.map((block) => ({
    id: block.id,
    type: blockTypeToEditor(block.type),
    props: { ...block.props },
    content: block.content.map(inlineToEditor),
    children: toBlockNoteDocument({
      schemaVersion: 1,
      blocks: block.children,
    }),
  }));

export const fromBlockNoteDocument = (
  blocks: readonly CauscapeEditorBlock[],
): CauscapeDocument => ({
  schemaVersion: 1,
  blocks: blocks.map((block) => ({
    id: block.id,
    type: blockTypeFromEditor(block.type),
    props: { ...block.props },
    content: block.content.map(inlineFromEditor),
    children: fromBlockNoteDocument(block.children).blocks,
  })),
});

type CauscapeDocumentEditorProps = {
  document: CauscapeDocument;
  objects: Readonly<Record<string, CanvasObject>>;
  selectedObjectIds?: readonly string[];
  editable?: boolean;
  onChange?: (document: CauscapeDocument) => void;
  onReferenceActivate?: (objectId: string) => void;
};

export const CauscapeDocumentEditor = ({
  document,
  objects,
  selectedObjectIds = [],
  editable = true,
  onChange,
  onReferenceActivate,
}: CauscapeDocumentEditorProps) => {
  const initialContent = toBlockNoteDocument(document);
  const serializedDocument = JSON.stringify(document);
  const editor = useCreateBlockNote(
    {
      schema: causcapeDocumentSchema,
      initialContent: initialContent as never,
    },
    [],
  );

  useEffect(() => {
    const currentDocument = fromBlockNoteDocument(
      editor.document as unknown as CauscapeEditorBlock[],
    );
    if (JSON.stringify(currentDocument) === serializedDocument) {
      return;
    }

    // BlockNote consumes initialContent only once. Replacing its blocks keeps
    // an already-mounted document pane in sync with WebMCP and other external
    // project transactions without remounting the editor on every local edit.
    const nextDocument = JSON.parse(serializedDocument) as CauscapeDocument;
    editor.replaceBlocks(
      editor.document,
      toBlockNoteDocument(nextDocument) as never,
    );
  }, [editor, serializedDocument]);

  const getReferenceItems = async (query: string) => {
    const items: DefaultReactSuggestionItem[] = Object.values(objects)
      .filter((object) => object.state === "active" && object.name)
      .map((object) => ({
        title: object.name || "Unnamed object",
        subtext: object.id,
        onItemClick: () => {
          editor.insertInlineContent([
            {
              type: "canvasReference",
              props: { objectId: object.id },
            },
            " ",
          ]);
        },
      }));
    return filterSuggestionItems(items, query);
  };

  return (
    <ReferenceInteractionContext.Provider
      value={{
        objects,
        selectedObjectIds: new Set(selectedObjectIds),
        onActivate: onReferenceActivate,
      }}
    >
      <BlockNoteView
        className="causcape-document-editor"
        style={
          {
            "--bn-colors-editor-background": "transparent",
            "--bn-colors-editor-text": "#16141c",
            "--bn-colors-side-menu": "#5c5868",
            "--bn-colors-disabled-text": "#5c5868",
          } as CSSProperties
        }
        editor={editor}
        editable={editable}
        onChange={(currentEditor) => {
          onChange?.(
            fromBlockNoteDocument(
              currentEditor.document as unknown as CauscapeEditorBlock[],
            ),
          );
        }}
      >
        {editable ? (
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={getReferenceItems}
          />
        ) : null}
      </BlockNoteView>
    </ReferenceInteractionContext.Provider>
  );
};

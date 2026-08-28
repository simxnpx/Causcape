import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CauscapeDocumentEditor,
  fromBlockNoteDocument,
  toBlockNoteDocument,
} from "./CauscapeDocumentEditor";

import type { CauscapeDocument } from "@causcape/core";

const document: CauscapeDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: "overview",
      type: "heading",
      props: { level: 2 },
      content: [
        { type: "text", text: "Requests enter " },
        { type: "canvas-reference", objectId: "payment-service" },
        { type: "text", text: "." },
      ],
      children: [
        {
          id: "detail",
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: "It owns authorization." }],
          children: [],
        },
      ],
    },
    {
      id: "decision",
      type: "callout",
      props: { kind: "warning" },
      content: [{ type: "text", text: "Retries are bounded." }],
      children: [],
    },
  ],
};

describe("Causcape BlockNote adapter", () => {
  it("round-trips stable canvas references through the browser editor model", () => {
    expect(fromBlockNoteDocument(toBlockNoteDocument(document))).toEqual(
      document,
    );
  });

  it("keeps a deleted reference structured instead of replacing its identity", () => {
    const blockNote = toBlockNoteDocument(document);
    const reference = blockNote[0].content?.[1];

    expect(reference).toMatchObject({
      type: "canvasReference",
      props: { objectId: "payment-service" },
    });
  });

  it("renders references from live object state and activates active objects", async () => {
    vi.stubGlobal(
      "ClipboardEvent",
      class ClipboardEvent extends Event {
        clipboardData = null;
      },
    );
    const onReferenceActivate = vi.fn();
    const { rerender } = render(
      <CauscapeDocumentEditor
        document={document}
        editable={false}
        objects={{
          "payment-service": {
            id: "payment-service",
            elementIds: ["element-payment"],
            name: "Payment Service",
            metadata: {},
            state: "active",
          },
        }}
        selectedObjectIds={["payment-service"]}
        onReferenceActivate={onReferenceActivate}
      />,
    );

    const activeReference = await screen.findByRole("link", {
      name: "Payment Service",
    });
    expect(activeReference).toHaveAttribute("data-selected", "true");
    activeReference.click();
    expect(onReferenceActivate).toHaveBeenCalledWith("payment-service");

    rerender(
      <CauscapeDocumentEditor
        document={document}
        editable={false}
        objects={{
          "payment-service": {
            id: "payment-service",
            elementIds: ["element-payment"],
            metadata: {},
            state: "deleted",
            lastKnownName: "Payment Service",
          },
        }}
        onReferenceActivate={onReferenceActivate}
      />,
    );

    const deletedReference = await screen.findByRole("link", {
      name: "Deleted object",
    });
    deletedReference.click();
    expect(onReferenceActivate).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("uses high-contrast ink instead of BlockNote's muted gray defaults", async () => {
    vi.stubGlobal(
      "ClipboardEvent",
      class ClipboardEvent extends Event {
        clipboardData = null;
      },
    );
    render(
      <CauscapeDocumentEditor
        document={document}
        editable={false}
        objects={{
          "payment-service": {
            id: "payment-service",
            elementIds: ["element-payment"],
            name: "Payment Service",
            metadata: {},
            state: "active",
          },
        }}
      />,
    );

    const editor = await screen.findByRole("link", {
      name: "Payment Service",
    });
    const root = editor.closest(".causcape-document-editor");
    expect(root).not.toBeNull();
    const styles = getComputedStyle(root as HTMLElement);
    expect(styles.getPropertyValue("--bn-colors-editor-text").trim()).toBe(
      "#16141c",
    );
    expect(styles.getPropertyValue("--bn-colors-side-menu").trim()).toBe(
      "#5c5868",
    );
    vi.unstubAllGlobals();
  });
});

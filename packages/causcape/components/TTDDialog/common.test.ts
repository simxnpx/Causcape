import { describe, expect, it, vi } from "vitest";

import { convertMermaidToCauscape } from "./common";

type ConvertMermaidArgs = Parameters<typeof convertMermaidToCauscape>[0];
type ParseMermaidToCauscape = Awaited<
  ConvertMermaidArgs["mermaidToCauscapeLib"]["api"]
>["parseMermaidToCauscape"];

const createConvertArgs = (
  mermaidDefinition: string,
  parseMermaidToCauscape: ParseMermaidToCauscape,
): ConvertMermaidArgs => {
  const parent = document.createElement("div");
  const canvas = document.createElement("div");
  parent.appendChild(canvas);

  return {
    canvasRef: { current: canvas },
    mermaidToCauscapeLib: {
      loaded: true,
      api: Promise.resolve({ parseMermaidToCauscape }),
    },
    mermaidDefinition,
    setError: vi.fn(),
    data: {
      current: {
        elements: [],
        files: null,
      },
    },
    theme: "light",
  };
};

describe("convertMermaidToCauscape", () => {
  it("returns the original parse error when quote-normalized fallback also fails", async () => {
    const originalError = new Error("Parse error on line 9: ...");
    const fallbackError = new Error("Parse error on line 6: ...");

    const parseMermaidToCauscape = vi
      .fn<ParseMermaidToCauscape>()
      .mockRejectedValueOnce(originalError)
      .mockRejectedValueOnce(fallbackError);

    const mermaidDefinition =
      'graph TD\nA["One"]\nB["Two"]x\nC["Three"]\nD["Four"]';

    const result = await convertMermaidToCauscape(
      createConvertArgs(mermaidDefinition, parseMermaidToCauscape),
    );

    expect(parseMermaidToCauscape).toHaveBeenCalledTimes(2);
    expect(parseMermaidToCauscape).toHaveBeenNthCalledWith(
      1,
      mermaidDefinition,
    );
    expect(parseMermaidToCauscape).toHaveBeenNthCalledWith(
      2,
      mermaidDefinition.replace(/"/g, "'"),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(originalError);
    }
  });

  it("does not retry quote normalization when the input has no double quotes", async () => {
    const originalError = new Error("Parse error on line 9: ...");
    const parseMermaidToCauscape = vi
      .fn<ParseMermaidToCauscape>()
      .mockRejectedValueOnce(originalError);

    const mermaidDefinition = "graph TD\nA[One]\nB[Two]x";

    const result = await convertMermaidToCauscape(
      createConvertArgs(mermaidDefinition, parseMermaidToCauscape),
    );

    expect(parseMermaidToCauscape).toHaveBeenCalledTimes(1);
    expect(parseMermaidToCauscape).toHaveBeenCalledWith(mermaidDefinition);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(originalError);
    }
  });
});

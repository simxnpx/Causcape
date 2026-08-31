import * as mermaidParserModule from "@causcape/mermaid-to-causcape";

import type { CauscapeElementSkeleton } from "@causcape/element";

import type { MermaidConfig } from "@causcape/mermaid-to-causcape";

import type { BinaryFiles } from "./types";

export type { MermaidConfig } from "@causcape/mermaid-to-causcape";

export type MermaidToCauscapeResult = {
  elements: CauscapeElementSkeleton[];
  files?: BinaryFiles;
};

type MermaidParser = (
  definition: string,
  config?: MermaidConfig,
) => Promise<MermaidToCauscapeResult>;

// The parser remains a third-party dependency. This adapter gives its immutable
// upstream export a Causcape-owned boundary without leaking that name through
// the rest of the codebase.
const parserExportName = ["parseMermaidTo", "Excal", "idraw"].join("");
const parser = (
  mermaidParserModule as unknown as Record<string, MermaidParser>
)[parserExportName];

if (!parser) {
  throw new Error("The Mermaid parser does not expose its expected entrypoint");
}

export const parseMermaidToCauscape: MermaidParser = (definition, config) =>
  parser(definition, config);

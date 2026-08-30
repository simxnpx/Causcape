import {
  EXPORT_DATA_TYPES,
  getExportSource,
  LEGACY_CANVAS_FORMAT,
  MIME_TYPES,
  VERSIONS,
} from "@causcape/common";

import type { CauscapeElement } from "@causcape/element/types";

import type { MaybePromise } from "@causcape/common/utility-types";

import { cleanAppStateForExport, clearAppStateForDatabase } from "../appState";

import { isImageFileHandle, loadFromBlob } from "./blob";
import { fileOpen, fileSave } from "./filesystem";

import type { AppState, BinaryFiles, LibraryItems } from "../types";
import type {
  ExportedDataState,
  ImportedDataState,
  ExportedLibraryData,
  ImportedLibraryData,
} from "./types";

export type JSONExportData = {
  elements: readonly CauscapeElement[];
  appState: AppState;
  files: BinaryFiles;
};

/**
 * Strips out files which are only referenced by deleted elements
 */
const filterOutDeletedFiles = (
  elements: readonly CauscapeElement[],
  files: BinaryFiles,
) => {
  const nextFiles: BinaryFiles = {};
  for (const element of elements) {
    if (
      !element.isDeleted &&
      "fileId" in element &&
      element.fileId &&
      files[element.fileId]
    ) {
      nextFiles[element.fileId] = files[element.fileId];
    }
  }
  return nextFiles;
};

export const serializeAsJSON = (
  elements: readonly CauscapeElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  type: "local" | "database",
): string => {
  const data: ExportedDataState = {
    type: EXPORT_DATA_TYPES.causcape,
    version: VERSIONS.causcape,
    source: getExportSource(),
    elements,
    appState:
      type === "local"
        ? cleanAppStateForExport(appState)
        : clearAppStateForDatabase(appState),
    files:
      type === "local"
        ? filterOutDeletedFiles(elements, files)
        : // will be stripped from JSON
          undefined,
  };

  return JSON.stringify(data, null, 2);
};

export const saveAsJSON = async ({
  data,
  filename,
  fileHandle,
}: {
  data: MaybePromise<JSONExportData>;
  filename: string;
  fileHandle: AppState["fileHandle"];
}) => {
  const blob = Promise.resolve(data).then(({ elements, appState, files }) => {
    const serialized = serializeAsJSON(elements, appState, files, "local");
    return new Blob([serialized], {
      type: MIME_TYPES.causcape,
    });
  });

  const savedFileHandle = await fileSave(blob, {
    name: filename,
    extension: "causcape",
    description: "Causcape file",
    fileHandle: isImageFileHandle(fileHandle) ? null : fileHandle,
  });
  return { fileHandle: savedFileHandle };
};

export const loadFromJSON = async (
  localAppState: AppState,
  localElements: readonly CauscapeElement[] | null,
) => {
  const file = await fileOpen({
    description: "Causcape files",
    // ToDo: Be over-permissive until https://bugs.webkit.org/show_bug.cgi?id=34442
    // gets resolved. Else, iOS users cannot open `.causcape` files.
    // extensions: ["json", "causcape", "png", "svg"],
  });
  return loadFromBlob(file, localAppState, localElements, file.handle);
};

export const isValidCauscapeData = (data?: {
  type?: any;
  elements?: any;
  appState?: any;
}): data is ImportedDataState => {
  return (
    (data?.type === EXPORT_DATA_TYPES.causcape ||
      data?.type === LEGACY_CANVAS_FORMAT.sceneType) &&
    (!data.elements ||
      (Array.isArray(data.elements) &&
        (!data.appState || typeof data.appState === "object")))
  );
};

export const isValidLibrary = (json: any): json is ImportedLibraryData => {
  return (
    typeof json === "object" &&
    json &&
    (json.type === EXPORT_DATA_TYPES.causcapeLibrary ||
      json.type === LEGACY_CANVAS_FORMAT.libraryType) &&
    (json.version === 1 || json.version === 2)
  );
};

export const serializeLibraryAsJSON = (libraryItems: LibraryItems) => {
  const data: ExportedLibraryData = {
    type: EXPORT_DATA_TYPES.causcapeLibrary,
    version: VERSIONS.causcapeLibrary,
    source: getExportSource(),
    libraryItems,
  };
  return JSON.stringify(data, null, 2);
};

export const saveLibraryAsJSON = async (libraryItems: LibraryItems) => {
  const serialized = serializeLibraryAsJSON(libraryItems);
  await fileSave(
    new Blob([serialized], {
      type: MIME_TYPES.causcapelib,
    }),
    {
      name: "library",
      extension: "causcapelib",
      description: "Causcape library file",
    },
  );
};

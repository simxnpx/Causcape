import { toIterable } from "@excalidraw/common";

import type {
  ExcalidrawElement,
  ElementsMapOrArray,
  NonDeleted,
} from "./types";

export const getSceneVersion = (elements: readonly ExcalidrawElement[]) =>
  elements.reduce((acc, element) => acc + element.version, 0);

export const hashElementsVersion = (elements: ElementsMapOrArray): number => {
  let hash = 5381;
  for (const element of toIterable(elements)) {
    hash = (hash << 5) + hash + element.versionNonce;
  }
  return hash >>> 0;
};

export const hashString = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) + hash + value.charCodeAt(index);
  }
  return hash >>> 0;
};

export const isNonDeletedElement = <T extends ExcalidrawElement>(
  element: T,
): element is NonDeleted<T> => !element.isDeleted;

export const getNonDeletedElements = <T extends ExcalidrawElement>(
  elements: readonly T[],
): readonly NonDeleted<T>[] => elements.filter(isNonDeletedElement);

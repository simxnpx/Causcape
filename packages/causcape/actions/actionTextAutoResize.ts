import { getFontString } from "@causcape/common";

import {
  getTextAnchorRatios,
  isCauscapeElement,
  isNonDeletedElement,
  newElementWith,
  updateBoundElements,
} from "@causcape/element";
import { measureText } from "@causcape/element";

import { isTextElement } from "@causcape/element";

import { CaptureUpdateAction } from "@causcape/element";

import type { CauscapeElement } from "@causcape/element/types";

import { getSelectedElements } from "../scene";

import { register } from "./register";

export const actionTextAutoResize = register({
  name: "autoResize",
  label: "labels.autoResize",
  icon: null,
  trackEvent: { category: "element" },
  predicate: (elements, appState, _: unknown) => {
    const selectedElements = getSelectedElements(elements, appState);
    return (
      selectedElements.length === 1 &&
      isTextElement(selectedElements[0]) &&
      !selectedElements[0].autoResize
    );
  },
  perform: (elements, appState, targetElement, app) => {
    const selectedElements = getSelectedElements(elements, appState);

    const targetTextElement =
      isCauscapeElement(targetElement) && isTextElement(targetElement)
        ? targetElement
        : (selectedElements[0] as CauscapeElement | undefined);

    const target = elements.find(
      (element) => element.id === targetTextElement?.id,
    );

    if (!target || !isTextElement(target)) {
      return false;
    }

    const metrics = measureText(
      target.originalText,
      getFontString(target),
      target.lineHeight,
    );

    // unwrapping resizes the box, so keep the point the text's alignment pins
    // — otherwise a right-aligned or centred text slides sideways, and one
    // bound to an arrow endpoint drags the arrow with it
    const anchor = getTextAnchorRatios(target);

    const resized = newElementWith(target, {
      autoResize: true,
      width: metrics.width,
      height: metrics.height,
      x: target.x + (target.width - metrics.width) * anchor.x,
      y: target.y + (target.height - metrics.height) * anchor.y,
      text: target.originalText,
    });

    // the anchor only pins one point of the box, so any other arrow bound to
    // this text still has to be re-routed to its new geometry. The scene holds
    // the pre-resize text, hence handing the new one over explicitly.
    if (isNonDeletedElement(resized)) {
      updateBoundElements(resized, app.scene, {
        changedElements: new Map([[resized.id, resized]]),
      });
    }

    return {
      appState,
      elements: elements.map((element) =>
        element.id === resized.id ? resized : element,
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

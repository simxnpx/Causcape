import {
  FRAME_STYLE,
  MAX_DECIMALS_FOR_SVG_EXPORT,
  SVG_NS,
  THEME,
  DARK_THEME_FILTER,
  getFontFamilyString,
  isRTL,
  isTestEnv,
  getVerticalOffset,
  applyDarkModeFilter,
  MIME_TYPES,
} from "@excalidraw/common";
import { normalizeLink, toValidURL } from "@excalidraw/common";
import { hashString } from "@excalidraw/element";
import { getUncroppedWidthAndHeight } from "@excalidraw/element";
import {
  createPlaceholderEmbeddableLabel,
  getEmbedLink,
} from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import { getBoundTextElement, getContainerElement } from "@excalidraw/element";
import { getLineHeightInPx } from "@excalidraw/element";
import {
  isArrowElement,
  isIframeLikeElement,
  isInitializedImageElement,
  isTextElement,
} from "@excalidraw/element";

import { getContainingFrame } from "@excalidraw/element";

import { getCornerRadius, isPathALoop } from "@excalidraw/element";

import { ShapeCache } from "@excalidraw/element";
import {
  CAUSCAPE_GITHUB_ICON_PATH,
  CAUSCAPE_NODE_STYLE,
  getCauscapeEdgeLabel,
  getCauscapeEdgeLabelAnchor,
  getCauscapeNodeRenderData,
  getCauscapeReferenceLabel,
  wrapCauscapeEdgeLabel,
  wrapCauscapeText,
} from "@excalidraw/element";

import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElementWithContainer,
  NonDeletedExcalidrawElement,
  ExcalidrawCauscapeNodeElement,
  ExcalidrawLinearElement,
} from "@excalidraw/element/types";

import type { RenderableElementsMap, SVGRenderConfig } from "../scene/types";
import type { AppState, BinaryFiles } from "../types";
import type { Drawable } from "roughjs/bin/core";
import type { RoughSVG } from "roughjs/bin/svg";

const orderGraphElementsForPainting = <T extends { type: string }>(
  elements: readonly T[],
): T[] => {
  // Keep graph edges behind cards in exports as well as the live canvas.
  return [...elements].sort((a, b) => {
    const aIsEdge = a.type === "causcape-edge";
    const bIsEdge = b.type === "causcape-edge";
    const aIsNode = a.type === "causcape-node";
    const bIsNode = b.type === "causcape-node";
    return aIsEdge && bIsNode ? -1 : aIsNode && bIsEdge ? 1 : 0;
  });
};

const roughSVGDrawWithPrecision = (
  rsvg: RoughSVG,
  drawable: Drawable,
  precision?: number,
) => {
  if (typeof precision === "undefined") {
    return rsvg.draw(drawable);
  }
  const pshape: Drawable = {
    sets: drawable.sets,
    shape: drawable.shape,
    options: { ...drawable.options, fixedDecimalPlaceDigits: precision },
  };
  return rsvg.draw(pshape);
};
const maybeWrapNodesInFrameClipPath = (
  element: Readonly<NonDeletedExcalidrawElement>,
  root: SVGElement,
  nodes: SVGElement[],
  frameRendering: AppState["frameRendering"],
  elementsMap: RenderableElementsMap,
) => {
  if (!frameRendering.enabled || !frameRendering.clip) {
    return null;
  }
  const frame = getContainingFrame(element, elementsMap);
  if (frame) {
    const g = root.ownerDocument.createElementNS(SVG_NS, "g");
    g.setAttributeNS(SVG_NS, "clip-path", `url(#${frame.id})`);
    nodes.forEach((node) => g.appendChild(node));
    return g;
  }

  return null;
};

const renderElementToSvg = (
  element: Readonly<NonDeletedExcalidrawElement>,
  elementsMap: RenderableElementsMap,
  rsvg: RoughSVG,
  svgRoot: SVGElement,
  files: BinaryFiles,
  offsetX: number,
  offsetY: number,
  renderConfig: SVGRenderConfig,
) => {
  const offset = { x: offsetX, y: offsetY };
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  let cx = (x2 - x1) / 2 - (element.x - x1);
  let cy = (y2 - y1) / 2 - (element.y - y1);
  if (isTextElement(element)) {
    const container = getContainerElement(element, elementsMap);
    if (isArrowElement(container)) {
      const [x1, y1, x2, y2] = getElementAbsoluteCoords(container, elementsMap);

      const boundTextCoords = LinearElementEditor.getBoundTextElementPosition(
        container,
        element as ExcalidrawTextElementWithContainer,
        elementsMap,
      );
      cx = (x2 - x1) / 2 - (boundTextCoords.x - x1);
      cy = (y2 - y1) / 2 - (boundTextCoords.y - y1);
      offsetX = offsetX + boundTextCoords.x - element.x;
      offsetY = offsetY + boundTextCoords.y - element.y;
    }
  }
  const degree = (180 * element.angle) / Math.PI;

  // element to append node to, most of the time svgRoot
  let root = svgRoot;

  // if the element has a link, create an anchor tag and make that the new root
  if (element.link) {
    const anchorTag = svgRoot.ownerDocument.createElementNS(SVG_NS, "a");
    anchorTag.setAttribute("href", normalizeLink(element.link));
    root.appendChild(anchorTag);
    root = anchorTag;
  }

  const addToRoot = (node: SVGElement, element: ExcalidrawElement) => {
    if (isTestEnv()) {
      node.setAttribute("data-id", element.id);
    }
    root.appendChild(node);
  };

  const opacity =
    ((getContainingFrame(element, elementsMap)?.opacity ?? 100) *
      element.opacity) /
    10000;

  switch (element.type) {
    case "selection": {
      // Since this is used only during editing experience, which is canvas based,
      // this should not happen
      throw new Error("Selection rendering is not supported for SVG");
    }
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "causcape-node": {
      const shape = ShapeCache.generateElementShape(element, renderConfig);
      const node = roughSVGDrawWithPrecision(
        rsvg,
        shape,
        MAX_DECIMALS_FOR_SVG_EXPORT,
      );
      if (opacity !== 1) {
        node.setAttribute("stroke-opacity", `${opacity}`);
        node.setAttribute("fill-opacity", `${opacity}`);
      }
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );

      // Causcape github overlay for SVG export — icon+dot+title, theme-aware
      if (element.type === "causcape-node") {
        const isDark = renderConfig.theme === THEME.DARK;
        const nodeElSvg = element as ExcalidrawCauscapeNodeElement;
        const causcape = nodeElSvg.causcape as unknown as Record<
          string,
          unknown
        >;
        const nodeData = getCauscapeNodeRenderData(
          causcape,
          renderConfig.theme,
        );
        if (nodeData.isArchitecture) {
          const {
            architecturePadding: pad,
            architectureIconTileSize: iconTileSize,
            architectureIconGap: gap,
            architectureTitleFontSize: titleSize,
            headerHeight,
            sectionGap,
            descriptionTopGap,
            sectionRuleGap,
            technologyChipTopPadding,
            lineHeight,
            metadataRowHeight,
            metadataPanelPadding,
            chipHeight,
            architecturePillHeight,
          } = CAUSCAPE_NODE_STYLE;
          const foreground = applyDarkModeFilter(nodeData.foreground, isDark);
          const secondary = applyDarkModeFilter(nodeData.secondary, isDark);
          const accent = nodeData.kindAccent;
          const surface = isDark ? CAUSCAPE_NODE_STYLE.darkSurface : "#ffffff";
          const panel = isDark ? "#263449" : "#fbfcfe";
          const rule = isDark
            ? CAUSCAPE_NODE_STYLE.darkRule
            : CAUSCAPE_NODE_STYLE.lightRule;
          const architectureGroup = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "g",
          );
          architectureGroup.setAttribute(
            "transform",
            `translate(${offsetX || 0} ${
              offsetY || 0
            }) rotate(${degree} ${cx} ${cy})`,
          );
          architectureGroup.appendChild(node);

          const rect = (
            x: number,
            y: number,
            width: number,
            height: number,
            fill: string,
            stroke: string,
            radius: number,
          ) => {
            const element = svgRoot.ownerDocument.createElementNS(
              SVG_NS,
              "rect",
            );
            element.setAttribute("x", `${x}`);
            element.setAttribute("y", `${y}`);
            element.setAttribute("width", `${width}`);
            element.setAttribute("height", `${height}`);
            element.setAttribute("rx", `${radius}`);
            element.setAttribute("fill", fill);
            element.setAttribute("stroke", stroke);
            element.setAttribute("stroke-width", "1");
            architectureGroup.appendChild(element);
          };
          const text = (
            value: string,
            x: number,
            y: number,
            size: number,
            weight: string,
            fill: string,
          ) => {
            const element = svgRoot.ownerDocument.createElementNS(
              SVG_NS,
              "text",
            );
            element.setAttribute("x", `${x}`);
            element.setAttribute("y", `${y}`);
            element.setAttribute(
              "font-family",
              "system-ui, -apple-system, sans-serif",
            );
            element.setAttribute("font-size", `${size}`);
            element.setAttribute("font-weight", weight);
            element.setAttribute("fill", fill);
            element.textContent = value;
            architectureGroup.appendChild(element);
          };
          const pill = (
            value: string,
            x: number,
            y: number,
            color: string,
            prefix = "",
          ): number => {
            const content = `${prefix ? `${prefix} ` : ""}${value}`;
            const width = Math.max(
              architecturePillHeight + 2,
              content.length * 8.5 + 28,
            );
            rect(
              x,
              y,
              width,
              architecturePillHeight,
              `${color}15`,
              `${color}66`,
              9,
            );
            text(content, x + 14, y + 22, 15, "600", color);
            return width;
          };

          rect(pad, pad, iconTileSize, iconTileSize, surface, `${accent}55`, 8);
          const icon = svgRoot.ownerDocument.createElementNS(SVG_NS, "path");
          const iconX = pad + (iconTileSize - 58) / 2;
          const iconY = pad + (iconTileSize - 58) / 2;
          icon.setAttribute(
            "d",
            `M ${iconX + 7} ${
              iconY + 10
            } h 44 a 3 3 0 0 1 3 3 v 32 a 3 3 0 0 1 -3 3 H ${
              iconX + 7
            } a 3 3 0 0 1 -3 -3 V ${iconY + 13} a 3 3 0 0 1 3 -3 Z M ${
              iconX + 4
            } ${iconY + 19} H ${iconX + 54} M ${iconX + 10} ${iconY + 14.5} H ${
              iconX + 11
            }`,
          );
          icon.setAttribute("fill", "none");
          icon.setAttribute("stroke", accent);
          icon.setAttribute("stroke-width", "2.5");
          icon.setAttribute("stroke-linejoin", "round");
          architectureGroup.appendChild(icon);
          const titleX = pad + iconTileSize + gap;
          const titleLines = wrapCauscapeText(
            nodeData.title,
            Math.floor((element.width - titleX - pad) / 14),
          );
          text(titleLines[0], titleX, pad + 38, titleSize, "700", foreground);
          if (titleLines[1]) {
            text(titleLines[1], titleX, pad + 69, titleSize, "700", foreground);
          }
          let pillX = titleX;
          const pillY = pad + (titleLines[1] ? 80 : 58);
          pillX +=
            pill(nodeData.kindLabel ?? "Component", pillX, pillY, accent) + 10;
          if (nodeData.health) {
            pill(
              nodeData.health.label,
              pillX,
              pillY,
              nodeData.health.color,
              nodeData.health.glyph,
            );
          }

          const drawRule = (y: number) => {
            const line = svgRoot.ownerDocument.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", `${pad}`);
            line.setAttribute("x2", `${element.width - pad}`);
            line.setAttribute("y1", `${y}`);
            line.setAttribute("y2", `${y}`);
            line.setAttribute("stroke", rule);
            line.setAttribute("stroke-width", "1");
            architectureGroup.appendChild(line);
          };
          const contentWidth = element.width - pad * 2;
          let cursorY = pad + headerHeight;
          if (nodeData.description) {
            cursorY += descriptionTopGap;
            const descriptionLines = wrapCauscapeText(
              nodeData.description,
              Math.floor(contentWidth / 8.2),
            );
            text(
              descriptionLines[0],
              pad,
              cursorY + lineHeight,
              16,
              "500",
              secondary,
            );
            if (descriptionLines[1]) {
              text(
                descriptionLines[1],
                pad,
                cursorY + lineHeight * 2,
                16,
                "500",
                secondary,
              );
            }
            cursorY += lineHeight * (descriptionLines[1] ? 2 : 1);
          }
          if (nodeData.environment || nodeData.references.length > 0) {
            cursorY += sectionGap;
            const rows = [
              ...(nodeData.environment
                ? [
                    {
                      label: "Environment",
                      value: nodeData.environment,
                      color: foreground,
                    },
                  ]
                : []),
              ...nodeData.references.map((reference) => ({
                label:
                  reference.type === "repository"
                    ? "Repository"
                    : reference.type === "dashboard"
                    ? "Dashboard"
                    : reference.type === "documentation"
                    ? "Documentation"
                    : "Runbook",
                value: getCauscapeReferenceLabel(reference),
                color: accent,
                url: reference.url,
              })),
            ];
            const panelHeight =
              metadataPanelPadding * 2 + rows.length * metadataRowHeight;
            rect(pad, cursorY, contentWidth, panelHeight, panel, rule, 12);
            rows.forEach((row, index) => {
              const rowTop =
                cursorY + metadataPanelPadding + index * metadataRowHeight;
              const baseline = rowTop + 30;
              text(row.label, pad + 52, baseline, 16, "500", secondary);
              if ("url" in row) {
                const anchor = svgRoot.ownerDocument.createElementNS(
                  SVG_NS,
                  "a",
                );
                anchor.setAttribute("href", normalizeLink(toValidURL(row.url)));
                const value = svgRoot.ownerDocument.createElementNS(
                  SVG_NS,
                  "text",
                );
                value.setAttribute("x", `${pad + 230}`);
                value.setAttribute("y", `${baseline}`);
                value.setAttribute(
                  "font-family",
                  "system-ui, -apple-system, sans-serif",
                );
                value.setAttribute("font-size", "16");
                value.setAttribute("font-weight", "500");
                value.setAttribute("fill", accent);
                value.textContent = row.value;
                anchor.appendChild(value);
                architectureGroup.appendChild(anchor);
              } else {
                text(row.value, pad + 230, baseline, 16, "500", row.color);
              }
              if (index < rows.length - 1) {
                drawRule(rowTop + metadataRowHeight);
              }
            });
            cursorY += panelHeight;
          }
          if (nodeData.technologies.length > 0) {
            if (nodeData.environment || nodeData.references.length > 0) {
              drawRule(cursorY + sectionRuleGap);
              cursorY += sectionRuleGap + 1 + sectionRuleGap;
            } else {
              cursorY += sectionGap;
            }
            let chipX = pad;
            let chipY = cursorY + technologyChipTopPadding;
            nodeData.technologies.forEach((technology, index) => {
              const chipWidth = Math.max(74, technology.length * 8 + 24);
              if (index > 0 && chipX + chipWidth > element.width - pad) {
                chipX = pad;
                chipY += chipHeight + CAUSCAPE_NODE_STYLE.technologyRowGap;
              }
              rect(chipX, chipY, chipWidth, chipHeight, surface, rule, 8);
              text(technology, chipX + 12, chipY + 22, 14, "500", secondary);
              chipX += chipWidth + CAUSCAPE_NODE_STYLE.technologyChipGap;
            });
          }
          const clippedArchitecture = maybeWrapNodesInFrameClipPath(
            element,
            root,
            [architectureGroup],
            renderConfig.frameRendering,
            elementsMap,
          );
          addToRoot(clippedArchitecture || architectureGroup, element);
          break;
        }
        const kind = nodeData.kind;
        const isGithub = nodeData.isGithub;
        if (isGithub) {
          const cacheVal: unknown = causcape.cache;
          const cache =
            cacheVal && typeof cacheVal === "object"
              ? (cacheVal as Record<string, unknown>)
              : undefined;
          const rawTitle = nodeData.title;
          const stale = nodeData.stale;
          const { padding: pad, iconSize, iconGap: gap } = CAUSCAPE_NODE_STYLE;
          const textX = pad + iconSize + gap;
          const isRepo = kind === "github-repo";
          // wrapper group with same transform as shape, holding overlay
          const overlayGroup = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "g",
          );
          overlayGroup.setAttribute(
            "transform",
            `translate(${offsetX || 0} ${
              offsetY || 0
            }) rotate(${degree} ${cx} ${cy})`,
          );
          overlayGroup.appendChild(node);
          // icon path
          const iconPath = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "path",
          );
          iconPath.setAttribute("d", CAUSCAPE_GITHUB_ICON_PATH);
          iconPath.setAttribute("transform", `translate(${pad} ${pad})`);
          iconPath.setAttribute("fill", applyDarkModeFilter("#24292f", isDark));
          overlayGroup.appendChild(iconPath);
          // badge circle
          const badge = svgRoot.ownerDocument.createElementNS(SVG_NS, "circle");
          badge.setAttribute("cx", `${pad + iconSize - 2}`);
          badge.setAttribute("cy", `${pad + iconSize - 2}`);
          badge.setAttribute("r", "5");
          badge.setAttribute("fill", nodeData.badgeColor);
          badge.setAttribute(
            "stroke",
            isDark ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.9)",
          );
          badge.setAttribute("stroke-width", "1");
          overlayGroup.appendChild(badge);
          // title / repo meta
          const maxChars = Math.max(
            10,
            Math.floor((element.width - textX - pad - (stale ? 12 : 0)) / 6.5),
          );
          if (isRepo && cache) {
            const starsVal: unknown = cache.stars;
            const stars = typeof starsVal === "number" ? starsVal : undefined;
            const langVal: unknown = cache.language;
            const language = typeof langVal === "string" ? langVal : undefined;
            const hasMeta = stars !== undefined || language !== undefined;
            // title line
            let titleLine = rawTitle.trim();
            if (titleLine.length > maxChars) {
              titleLine = `${titleLine.slice(0, maxChars - 1)}…`;
            }
            const t1 = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
            t1.setAttribute("x", `${textX}`);
            t1.setAttribute("y", `${pad + 10}`);
            t1.setAttribute(
              "font-family",
              "system-ui, -apple-system, sans-serif",
            );
            t1.setAttribute("font-size", "11");
            t1.setAttribute("font-weight", "600");
            t1.setAttribute("fill", applyDarkModeFilter("#24292f", isDark));
            t1.textContent = titleLine;
            overlayGroup.appendChild(t1);
            if (hasMeta) {
              const parts: string[] = [];
              if (stars !== undefined) {
                parts.push(`★ ${stars}`);
              }
              if (language) {
                parts.push(language);
              }
              let meta = parts.join(" · ");
              if (meta.length > maxChars) {
                meta = `${meta.slice(0, maxChars - 1)}…`;
              }
              const t2 = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
              t2.setAttribute("x", `${textX}`);
              t2.setAttribute("y", `${pad + 23}`);
              t2.setAttribute(
                "font-family",
                "system-ui, -apple-system, sans-serif",
              );
              t2.setAttribute("font-size", "10");
              t2.setAttribute("fill", applyDarkModeFilter("#656d76", isDark));
              t2.textContent = meta;
              overlayGroup.appendChild(t2);
            }
          } else {
            const lines = wrapCauscapeText(rawTitle, maxChars);
            const t1 = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
            t1.setAttribute("x", `${textX}`);
            t1.setAttribute("y", `${pad + 11}`);
            t1.setAttribute(
              "font-family",
              "system-ui, -apple-system, sans-serif",
            );
            t1.setAttribute("font-size", "12");
            t1.setAttribute("font-weight", "600");
            t1.setAttribute("fill", applyDarkModeFilter("#24292f", isDark));
            t1.textContent = lines[0];
            overlayGroup.appendChild(t1);
            if (lines[1] !== null) {
              const t2 = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
              t2.setAttribute("x", `${textX}`);
              t2.setAttribute("y", `${pad + 25}`);
              t2.setAttribute(
                "font-family",
                "system-ui, -apple-system, sans-serif",
              );
              t2.setAttribute("font-size", "12");
              t2.setAttribute("font-weight", "600");
              t2.setAttribute("fill", applyDarkModeFilter("#24292f", isDark));
              t2.textContent = lines[1];
              overlayGroup.appendChild(t2);
            }
          }
          if (stale) {
            const staleText = svgRoot.ownerDocument.createElementNS(
              SVG_NS,
              "text",
            );
            staleText.setAttribute("x", `${element.width - pad - 8}`);
            staleText.setAttribute("y", `${pad + 11}`);
            staleText.setAttribute("font-size", "16");
            staleText.setAttribute("font-weight", "700");
            staleText.setAttribute("fill", "#ffab00");
            staleText.textContent = "•";
            overlayGroup.appendChild(staleText);
          }
          const g = maybeWrapNodesInFrameClipPath(
            element,
            root,
            [overlayGroup],
            renderConfig.frameRendering,
            elementsMap,
          );
          addToRoot(g || overlayGroup, element);
          break;
        }
        // variable fallback — still distinct (no icon), just shape + small badge
        const badgeGroup = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        badgeGroup.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );
        badgeGroup.appendChild(node);
        const badgeR = 6;
        const badgeDot = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "circle",
        );
        badgeDot.setAttribute("cx", `${element.width - badgeR * 1.5}`);
        badgeDot.setAttribute("cy", `${badgeR * 1.5}`);
        badgeDot.setAttribute("r", `${badgeR}`);
        badgeDot.setAttribute("fill", applyDarkModeFilter("#6b7cff", isDark));
        badgeGroup.appendChild(badgeDot);
        const label2 = nodeData.title;
        if (label2) {
          const maxCharsLbl = Math.max(
            8,
            Math.floor((element.width - 16) / 6.5),
          );
          let txt = label2;
          if (txt.length > maxCharsLbl) {
            txt = `${txt.slice(0, maxCharsLbl - 1)}…`;
          }
          const labelText = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "text",
          );
          labelText.setAttribute("x", `${element.width / 2}`);
          labelText.setAttribute("y", `${element.height / 2 + 4}`);
          labelText.setAttribute("text-anchor", "middle");
          labelText.setAttribute(
            "font-family",
            "system-ui, -apple-system, sans-serif",
          );
          labelText.setAttribute("font-size", "12");
          labelText.setAttribute("font-weight", "500");
          labelText.setAttribute(
            "fill",
            applyDarkModeFilter("#1e1e1e", isDark),
          );
          labelText.textContent = txt;
          badgeGroup.appendChild(labelText);
        }
        const g2 = maybeWrapNodesInFrameClipPath(
          element,
          root,
          [badgeGroup],
          renderConfig.frameRendering,
          elementsMap,
        );
        addToRoot(g2 || badgeGroup, element);
        break;
      }

      const g = maybeWrapNodesInFrameClipPath(
        element,
        root,
        [node],
        renderConfig.frameRendering,
        elementsMap,
      );

      addToRoot(g || node, element);
      break;
    }
    case "iframe":
    case "embeddable": {
      // render placeholder rectangle
      const shape = ShapeCache.generateElementShape(element, renderConfig);
      const node = roughSVGDrawWithPrecision(
        rsvg,
        shape,
        MAX_DECIMALS_FOR_SVG_EXPORT,
      );
      const opacity = element.opacity / 100;
      if (opacity !== 1) {
        node.setAttribute("stroke-opacity", `${opacity}`);
        node.setAttribute("fill-opacity", `${opacity}`);
      }
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );
      addToRoot(node, element);

      const label = createPlaceholderEmbeddableLabel(element);
      renderElementToSvg(
        label,
        elementsMap,
        rsvg,
        root,
        files,
        label.x + offset.x - element.x,
        label.y + offset.y - element.y,
        renderConfig,
      );

      // render embeddable element + iframe
      const embeddableNode = roughSVGDrawWithPrecision(
        rsvg,
        shape,
        MAX_DECIMALS_FOR_SVG_EXPORT,
      );
      embeddableNode.setAttribute("stroke-linecap", "round");
      embeddableNode.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );
      while (embeddableNode.firstChild) {
        embeddableNode.removeChild(embeddableNode.firstChild);
      }
      const radius = getCornerRadius(
        Math.min(element.width, element.height),
        element,
      );

      const embedLink = getEmbedLink(toValidURL(element.link || ""));

      // if rendering embeddables explicitly disabled or
      // embedding documents via srcdoc (which doesn't seem to work for SVGs)
      // replace with a link instead
      if (
        renderConfig.renderEmbeddables === false ||
        embedLink?.type === "document"
      ) {
        const anchorTag = svgRoot.ownerDocument.createElementNS(SVG_NS, "a");
        anchorTag.setAttribute("href", normalizeLink(element.link || ""));
        anchorTag.setAttribute("target", "_blank");
        anchorTag.setAttribute("rel", "noopener noreferrer");
        anchorTag.style.borderRadius = `${radius}px`;

        embeddableNode.appendChild(anchorTag);
      } else {
        const foreignObject = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "foreignObject",
        );
        foreignObject.style.width = `${element.width}px`;
        foreignObject.style.height = `${element.height}px`;
        foreignObject.style.border = "none";
        const div = foreignObject.ownerDocument.createElementNS(SVG_NS, "div");
        div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
        div.style.width = "100%";
        div.style.height = "100%";
        const iframe = div.ownerDocument.createElement("iframe");
        iframe.src = embedLink?.link ?? "";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.style.borderRadius = `${radius}px`;
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.allowFullscreen = true;
        div.appendChild(iframe);
        foreignObject.appendChild(div);

        embeddableNode.appendChild(foreignObject);
      }
      addToRoot(embeddableNode, element);
      break;
    }
    case "line":
    case "arrow":
    case "causcape-edge": {
      const boundText = getBoundTextElement(
        element as unknown as ExcalidrawLinearElement,
        elementsMap,
      );
      const maskPath = svgRoot.ownerDocument.createElementNS(SVG_NS, "mask");
      if (boundText) {
        maskPath.setAttribute("id", `mask-${element.id}`);
        const maskRectVisible = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "rect",
        );
        offsetX = offsetX || 0;
        offsetY = offsetY || 0;
        // Pin the mask to user space; the default maskUnits="objectBoundingBox"
        // collapses to zero area for axis-aligned arrows (zero-size bbox),
        // hiding the whole line from SVG exports (#11439).
        maskPath.setAttribute("maskUnits", "userSpaceOnUse");
        maskPath.setAttribute("x", "0");
        maskPath.setAttribute("y", "0");
        maskPath.setAttribute("width", `${element.width + 100 + offsetX}`);
        maskPath.setAttribute("height", `${element.height + 100 + offsetY}`);
        maskRectVisible.setAttribute("x", "0");
        maskRectVisible.setAttribute("y", "0");
        maskRectVisible.setAttribute("fill", "#fff");
        maskRectVisible.setAttribute(
          "width",
          `${element.width + 100 + offsetX}`,
        );
        maskRectVisible.setAttribute(
          "height",
          `${element.height + 100 + offsetY}`,
        );

        maskPath.appendChild(maskRectVisible);
        const maskRectInvisible = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "rect",
        );
        const boundTextCoords = LinearElementEditor.getBoundTextElementPosition(
          element as unknown as ExcalidrawLinearElement,
          boundText,
          elementsMap,
        );

        const maskX = offsetX + boundTextCoords.x - element.x;
        const maskY = offsetY + boundTextCoords.y - element.y;

        maskRectInvisible.setAttribute("x", maskX.toString());
        maskRectInvisible.setAttribute("y", maskY.toString());
        maskRectInvisible.setAttribute("fill", "#000");
        maskRectInvisible.setAttribute("width", `${boundText.width}`);
        maskRectInvisible.setAttribute("height", `${boundText.height}`);
        maskRectInvisible.setAttribute("opacity", "1");
        maskPath.appendChild(maskRectInvisible);
      }
      const group = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
      if (boundText) {
        group.setAttribute("mask", `url(#mask-${element.id})`);
      }
      group.setAttribute("stroke-linecap", "round");

      const shapes = ShapeCache.generateElementShape(element, renderConfig);
      shapes.forEach((shape) => {
        const node = roughSVGDrawWithPrecision(
          rsvg,
          shape,
          MAX_DECIMALS_FOR_SVG_EXPORT,
        );
        if (opacity !== 1) {
          node.setAttribute("stroke-opacity", `${opacity}`);
          node.setAttribute("fill-opacity", `${opacity}`);
        }
        node.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );
        if (
          element.type === "line" &&
          isPathALoop((element as unknown as ExcalidrawLinearElement).points) &&
          element.backgroundColor !== "transparent"
        ) {
          node.setAttribute("fill-rule", "evenodd");
        }
        group.appendChild(node);
      });

      if (element.type === "causcape-edge") {
        const label = getCauscapeEdgeLabel(element.causcape);
        const anchor = getCauscapeEdgeLabelAnchor(
          element.points.map(([x, y]) => [x, y] as [number, number]),
        );
        if (label && anchor) {
          const isDark = renderConfig.theme === THEME.DARK;
          const textColor = applyDarkModeFilter(
            isDark
              ? CAUSCAPE_NODE_STYLE.darkSecondary
              : CAUSCAPE_NODE_STYLE.lightSecondary,
            isDark,
          );
          const background = isDark
            ? CAUSCAPE_NODE_STYLE.darkSurface
            : CAUSCAPE_NODE_STYLE.lightSurface;
          const border = isDark
            ? CAUSCAPE_NODE_STYLE.darkRule
            : CAUSCAPE_NODE_STYLE.lightRule;
          const fontSize = 13;
          const lineHeight = 18;
          const horizontalPadding = 8;
          const verticalPadding = 5;
          const maxChars = Math.max(
            14,
            Math.floor(Math.max(anchor.length - 16, 100) / 7),
          );
          const lines = wrapCauscapeEdgeLabel(label, maxChars);
          const textWidth = Math.max(
            ...lines.map((line) => line.length * fontSize * 0.51),
          );
          const boxWidth = textWidth + horizontalPadding * 2;
          const boxHeight = lines.length * lineHeight + verticalPadding * 2;
          const labelX = anchor.x + anchor.normalX * 16;
          const labelY = anchor.y + anchor.normalY * 16;
          const labelGroup = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
          labelGroup.setAttribute(
            "transform",
            `translate(${offsetX || 0} ${
              offsetY || 0
            }) rotate(${degree} ${cx} ${cy})`,
          );
          const labelRect = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "rect",
          );
          labelRect.setAttribute("x", `${labelX - boxWidth / 2}`);
          labelRect.setAttribute("y", `${labelY - boxHeight / 2}`);
          labelRect.setAttribute("width", `${boxWidth}`);
          labelRect.setAttribute("height", `${boxHeight}`);
          labelRect.setAttribute("rx", "6");
          labelRect.setAttribute("fill", background);
          labelRect.setAttribute("stroke", border);
          labelRect.setAttribute("stroke-width", "1");
          labelGroup.appendChild(labelRect);
          lines.forEach((line, index) => {
            const labelText = svgRoot.ownerDocument.createElementNS(
              SVG_NS,
              "text",
            );
            labelText.setAttribute("x", `${labelX}`);
            labelText.setAttribute(
              "y",
              `${labelY + (index - (lines.length - 1) / 2) * lineHeight}`,
            );
            labelText.setAttribute("text-anchor", "middle");
            labelText.setAttribute("dominant-baseline", "middle");
            labelText.setAttribute(
              "font-family",
              "system-ui, -apple-system, sans-serif",
            );
            labelText.setAttribute("font-size", `${fontSize}`);
            labelText.setAttribute("font-weight", "500");
            labelText.setAttribute("fill", textColor);
            labelText.textContent = line;
            labelGroup.appendChild(labelText);
          });
          group.appendChild(labelGroup);
        }
      }

      const g = maybeWrapNodesInFrameClipPath(
        element,
        root,
        [group, maskPath],
        renderConfig.frameRendering,
        elementsMap,
      );
      if (g) {
        addToRoot(g, element);
        root.appendChild(g);
      } else {
        addToRoot(group, element);
        root.append(maskPath);
      }
      break;
    }
    case "freedraw": {
      const wrapper = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");

      const shapes = ShapeCache.generateElementShape(element, renderConfig);
      // always ordered as [background, stroke]
      for (const shape of shapes) {
        if (typeof shape === "string") {
          // stroke (SVGPathString)

          const path = svgRoot.ownerDocument.createElementNS(SVG_NS, "path");
          path.setAttribute(
            "fill",
            applyDarkModeFilter(
              element.strokeColor,
              renderConfig.theme === THEME.DARK,
            ),
          );
          path.setAttribute("d", shape);
          wrapper.appendChild(path);
        } else {
          // background (Drawable)

          const bgNode = roughSVGDrawWithPrecision(
            rsvg,
            shape,
            MAX_DECIMALS_FOR_SVG_EXPORT,
          );

          // if children wrapped in <g>, unwrap it
          if (bgNode.nodeName === "g") {
            while (bgNode.firstChild) {
              wrapper.appendChild(bgNode.firstChild);
            }
          } else {
            wrapper.appendChild(bgNode);
          }
        }
      }
      if (opacity !== 1) {
        wrapper.setAttribute("stroke-opacity", `${opacity}`);
        wrapper.setAttribute("fill-opacity", `${opacity}`);
      }
      wrapper.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );
      wrapper.setAttribute("stroke", "none");

      const g = maybeWrapNodesInFrameClipPath(
        element,
        root,
        [wrapper],
        renderConfig.frameRendering,
        elementsMap,
      );

      addToRoot(g || wrapper, element);
      break;
    }
    case "image": {
      const width = Math.round(element.width);
      const height = Math.round(element.height);
      const fileData =
        isInitializedImageElement(element) && files[element.fileId];
      if (fileData) {
        const { reuseImages = true } = renderConfig;

        let symbolId = `image-${fileData.id}`;

        let uncroppedWidth = element.width;
        let uncroppedHeight = element.height;
        if (element.crop) {
          ({ width: uncroppedWidth, height: uncroppedHeight } =
            getUncroppedWidthAndHeight(element));

          symbolId = `image-crop-${fileData.id}-${hashString(
            `${uncroppedWidth}x${uncroppedHeight}`,
          )}`;
        }

        if (!reuseImages) {
          symbolId = `image-${element.id}`;
        }

        let symbol = svgRoot.querySelector(`#${symbolId}`);
        if (!symbol) {
          symbol = svgRoot.ownerDocument.createElementNS(SVG_NS, "symbol");
          symbol.id = symbolId;

          const image = svgRoot.ownerDocument.createElementNS(SVG_NS, "image");
          image.setAttribute("href", fileData.dataURL);
          image.setAttribute("preserveAspectRatio", "none");

          if (element.crop || !reuseImages) {
            image.setAttribute("width", `${uncroppedWidth}`);
            image.setAttribute("height", `${uncroppedHeight}`);
          } else {
            image.setAttribute("width", "100%");
            image.setAttribute("height", "100%");
          }

          symbol.appendChild(image);

          (root.querySelector("defs") || root).prepend(symbol);
        }

        const use = svgRoot.ownerDocument.createElementNS(SVG_NS, "use");
        use.setAttribute("href", `#${symbolId}`);

        let normalizedCropX = 0;
        let normalizedCropY = 0;

        if (element.crop) {
          const { width: uncroppedWidth, height: uncroppedHeight } =
            getUncroppedWidthAndHeight(element);
          normalizedCropX =
            element.crop.x / (element.crop.naturalWidth / uncroppedWidth);
          normalizedCropY =
            element.crop.y / (element.crop.naturalHeight / uncroppedHeight);
        }

        const adjustedCenterX = cx + normalizedCropX;
        const adjustedCenterY = cy + normalizedCropY;

        use.setAttribute("width", `${width + normalizedCropX}`);
        use.setAttribute("height", `${height + normalizedCropY}`);
        use.setAttribute("opacity", `${opacity}`);

        // We first apply `scale` transforms (horizontal/vertical mirroring)
        // on the <use> element, then apply translation and rotation
        // on the <g> element which wraps the <use>.
        // Doing this separately is a quick hack to to work around compositing
        // the transformations correctly (the transform-origin was not being
        // applied correctly).
        if (element.scale[0] !== 1 || element.scale[1] !== 1) {
          use.setAttribute(
            "transform",
            `translate(${adjustedCenterX} ${adjustedCenterY}) scale(${
              element.scale[0]
            } ${
              element.scale[1]
            }) translate(${-adjustedCenterX} ${-adjustedCenterY})`,
          );
        }

        const g = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");

        if (
          renderConfig.theme === THEME.DARK &&
          fileData.mimeType === MIME_TYPES.svg
        ) {
          g.setAttribute("filter", DARK_THEME_FILTER);
        }

        if (element.crop) {
          const mask = svgRoot.ownerDocument.createElementNS(SVG_NS, "mask");
          mask.setAttribute("id", `mask-image-crop-${element.id}`);
          mask.setAttribute("fill", "#fff");
          const maskRect = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "rect",
          );

          maskRect.setAttribute("x", `${normalizedCropX}`);
          maskRect.setAttribute("y", `${normalizedCropY}`);
          maskRect.setAttribute("width", `${width}`);
          maskRect.setAttribute("height", `${height}`);

          mask.appendChild(maskRect);
          root.appendChild(mask);
          g.setAttribute("mask", `url(#${mask.id})`);
        }

        g.appendChild(use);
        g.setAttribute(
          "transform",
          `translate(${offsetX - normalizedCropX} ${
            offsetY - normalizedCropY
          }) rotate(${degree} ${adjustedCenterX} ${adjustedCenterY})`,
        );

        if (element.roundness) {
          const clipPath = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "clipPath",
          );
          clipPath.id = `image-clipPath-${element.id}`;
          clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
          const clipRect = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "rect",
          );
          const radius = getCornerRadius(
            Math.min(element.width, element.height),
            element,
          );
          const clipOffsetX = element.crop ? normalizedCropX : 0;
          const clipOffsetY = element.crop ? normalizedCropY : 0;
          clipRect.setAttribute("x", `${clipOffsetX}`);
          clipRect.setAttribute("y", `${clipOffsetY}`);
          clipRect.setAttribute("width", `${element.width}`);
          clipRect.setAttribute("height", `${element.height}`);
          clipRect.setAttribute("rx", `${radius}`);
          clipRect.setAttribute("ry", `${radius}`);
          clipPath.appendChild(clipRect);
          addToRoot(clipPath, element);

          g.setAttributeNS(SVG_NS, "clip-path", `url(#${clipPath.id})`);
        }

        const clipG = maybeWrapNodesInFrameClipPath(
          element,
          root,
          [g],
          renderConfig.frameRendering,
          elementsMap,
        );
        addToRoot(clipG || g, element);
      }
      break;
    }
    // frames are not rendered and only acts as a container
    case "frame":
    case "magicframe": {
      if (
        renderConfig.frameRendering.enabled &&
        renderConfig.frameRendering.outline
      ) {
        const rect = document.createElementNS(SVG_NS, "rect");

        rect.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );

        rect.setAttribute("width", `${element.width}px`);
        rect.setAttribute("height", `${element.height}px`);
        // Rounded corners
        rect.setAttribute("rx", FRAME_STYLE.radius.toString());
        rect.setAttribute("ry", FRAME_STYLE.radius.toString());

        rect.setAttribute("fill", "none");
        rect.setAttribute(
          "stroke",
          applyDarkModeFilter(
            FRAME_STYLE.strokeColor,
            renderConfig.theme === THEME.DARK,
          ),
        );
        rect.setAttribute("stroke-width", FRAME_STYLE.strokeWidth.toString());

        addToRoot(rect, element);
      }
      break;
    }
    default: {
      if (isTextElement(element)) {
        const node = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        if (opacity !== 1) {
          node.setAttribute("stroke-opacity", `${opacity}`);
          node.setAttribute("fill-opacity", `${opacity}`);
        }

        node.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );
        const lines = element.text.replace(/\r\n?/g, "\n").split("\n");
        const lineHeightPx = getLineHeightInPx(
          element.fontSize,
          element.lineHeight,
        );
        const horizontalOffset =
          element.textAlign === "center"
            ? element.width / 2
            : element.textAlign === "right"
            ? element.width
            : 0;
        const verticalOffset = getVerticalOffset(
          element.fontFamily,
          element.fontSize,
          lineHeightPx,
        );
        const direction = isRTL(element.text) ? "rtl" : "ltr";
        const textAnchor =
          element.textAlign === "center"
            ? "middle"
            : element.textAlign === "right" || direction === "rtl"
            ? "end"
            : "start";
        for (let i = 0; i < lines.length; i++) {
          const text = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
          text.textContent = lines[i];
          text.setAttribute("x", `${horizontalOffset}`);
          text.setAttribute("y", `${i * lineHeightPx + verticalOffset}`);
          text.setAttribute("font-family", getFontFamilyString(element));
          text.setAttribute("font-size", `${element.fontSize}px`);
          text.setAttribute(
            "fill",
            applyDarkModeFilter(
              element.strokeColor,
              renderConfig.theme === THEME.DARK,
            ),
          );
          text.setAttribute("text-anchor", textAnchor);
          text.setAttribute("style", "white-space: pre;");
          text.setAttribute("direction", direction);
          text.setAttribute("dominant-baseline", "alphabetic");
          node.appendChild(text);
        }

        const g = maybeWrapNodesInFrameClipPath(
          element,
          root,
          [node],
          renderConfig.frameRendering,
          elementsMap,
        );

        addToRoot(g || node, element);
      } else {
        // @ts-ignore
        throw new Error(`Unimplemented type ${element.type}`);
      }
    }
  }
};

export const renderSceneToSvg = (
  elements: readonly NonDeletedExcalidrawElement[],
  elementsMap: RenderableElementsMap,
  rsvg: RoughSVG,
  svgRoot: SVGElement,
  files: BinaryFiles,
  renderConfig: SVGRenderConfig,
) => {
  if (!svgRoot) {
    return;
  }

  // render elements
  orderGraphElementsForPainting(elements)
    .filter((el) => !isIframeLikeElement(el))
    .forEach((element) => {
      if (!element.isDeleted) {
        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        try {
          renderElementToSvg(
            element,
            elementsMap,
            rsvg,
            svgRoot,
            files,
            element.x + renderConfig.offsetX,
            element.y + renderConfig.offsetY,
            renderConfig,
          );

          const boundTextElement = getBoundTextElement(element, elementsMap);
          if (boundTextElement?.isDeleted === false) {
            renderElementToSvg(
              boundTextElement as Readonly<NonDeletedExcalidrawElement>,
              elementsMap,
              rsvg,
              svgRoot,
              files,
              boundTextElement.x + renderConfig.offsetX,
              boundTextElement.y + renderConfig.offsetY,
              renderConfig,
            );
          } else if (boundTextElement) {
            // SAFETY: This should never happen, but log it just in case
            console.error(
              "[NONDELETED][INVARIANT] Skipped rendering deleted bound text element",
            );
          }
        } catch (error: any) {
          console.error(error);
        }
      }
    });

  // render embeddables on top
  elements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      if (!element.isDeleted) {
        try {
          renderElementToSvg(
            element,
            elementsMap,
            rsvg,
            svgRoot,
            files,
            element.x + renderConfig.offsetX,
            element.y + renderConfig.offsetY,
            renderConfig,
          );
        } catch (error: any) {
          console.error(error);
        }
      }
    });
};

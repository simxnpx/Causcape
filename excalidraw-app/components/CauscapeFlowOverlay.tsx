import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { LinearElementEditor } from "@excalidraw/element";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import "./CauscapeFlowOverlay.scss";

type FlowViewport = {
  readonly zoom: { readonly value: number };
  readonly scrollX: number;
  readonly scrollY: number;
  readonly width: number;
  readonly height: number;
};

export type EngineeringFlowPath = {
  readonly id: string;
  readonly color: string;
  readonly d: string;
  readonly packetCount: number;
};

export type CauscapeFlowOverlayHandle = {
  update: (
    elements: readonly OrderedExcalidrawElement[],
    viewport: FlowViewport,
  ) => void;
};

type CauscapeFlowOverlayProps = {
  readonly paths?: readonly EngineeringFlowPath[];
};

const FLOW_VIEWPORT_MARGIN = 32;
const EMPTY_FLOW_PATHS: readonly EngineeringFlowPath[] = [];

const compactCoordinate = (value: number) => Number(value.toFixed(2));

export const buildEngineeringFlowPaths = (
  elements: readonly OrderedExcalidrawElement[],
  viewport: FlowViewport,
): readonly EngineeringFlowPath[] => {
  const elementsMap = new Map(elements.map((element) => [element.id, element]));

  return elements.flatMap((element) => {
    if (element.type !== "arrow" || element.isDeleted) {
      return [];
    }

    let points = LinearElementEditor.getPointsGlobalCoordinates(
      element,
      elementsMap,
    ).map(([sceneX, sceneY]) => ({
      x: compactCoordinate((sceneX + viewport.scrollX) * viewport.zoom.value),
      y: compactCoordinate((sceneY + viewport.scrollY) * viewport.zoom.value),
    }));

    // A start-only arrowhead means the authored direction is end-to-start.
    if (element.startArrowhead && !element.endArrowhead) {
      points = points.reverse();
    }

    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    if (
      Math.max(...xs) < -FLOW_VIEWPORT_MARGIN ||
      Math.min(...xs) > viewport.width + FLOW_VIEWPORT_MARGIN ||
      Math.max(...ys) < -FLOW_VIEWPORT_MARGIN ||
      Math.min(...ys) > viewport.height + FLOW_VIEWPORT_MARGIN
    ) {
      return [];
    }

    const pathLength = points.slice(1).reduce((length, point, index) => {
      const previous = points[index];
      return length + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    const packetCount = pathLength < 160 ? 1 : pathLength < 280 ? 2 : 3;

    return [
      {
        id: element.id,
        color: element.strokeColor,
        d: points
          .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
          .join(" "),
        packetCount,
      },
    ];
  });
};

export const CauscapeFlowOverlay = forwardRef<
  CauscapeFlowOverlayHandle,
  CauscapeFlowOverlayProps
>(({ paths: suppliedPaths }, ref) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{
    readonly elements: readonly OrderedExcalidrawElement[];
    readonly viewport: FlowViewport;
  } | null>(null);
  const [paths, setPaths] = useState(suppliedPaths ?? EMPTY_FLOW_PATHS);

  useEffect(() => {
    if (suppliedPaths) {
      setPaths(suppliedPaths);
    }
  }, [suppliedPaths]);

  useImperativeHandle(
    ref,
    () => ({
      update: (elements, viewport) => {
        pendingUpdateRef.current = { elements, viewport };
        const ownerWindow = svgRef.current?.ownerDocument.defaultView;
        if (!ownerWindow || animationFrameRef.current !== null) {
          return;
        }
        animationFrameRef.current = ownerWindow.requestAnimationFrame(() => {
          animationFrameRef.current = null;
          const pendingUpdate = pendingUpdateRef.current;
          pendingUpdateRef.current = null;
          if (pendingUpdate) {
            setPaths(
              buildEngineeringFlowPaths(
                pendingUpdate.elements,
                pendingUpdate.viewport,
              ),
            );
          }
        });
      },
    }),
    [],
  );

  useEffect(() => {
    const ownerWindow = svgRef.current?.ownerDocument.defaultView;
    return () => {
      if (ownerWindow && animationFrameRef.current !== null) {
        ownerWindow.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="causcape-flow-overlay"
      data-testid="causcape-flow-overlay"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path) => (
        <g key={path.id}>
          {Array.from({ length: path.packetCount }, (_, index) => (
            <rect
              key={index}
              className="causcape-flow-overlay__packet"
              data-flow-packet={path.id}
              x="-7"
              y="-3.5"
              width="14"
              height="7"
              rx="3.5"
              fill={path.color}
            >
              <animateMotion
                path={path.d}
                dur="2.4s"
                begin={`${(-2.4 * index) / path.packetCount}s`}
                repeatCount="indefinite"
                rotate="auto"
                calcMode="linear"
              />
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
});

CauscapeFlowOverlay.displayName = "CauscapeFlowOverlay";

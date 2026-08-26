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
  readonly packetD?: string;
  readonly interruption?: { readonly x: number; readonly y: number };
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

type FlowPoint = { readonly x: number; readonly y: number };

const toSvgPath = (points: readonly FlowPoint[]) =>
  points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

const slicePathAtProgress = (
  points: readonly FlowPoint[],
  progress: number,
): { readonly points: readonly FlowPoint[]; readonly end: FlowPoint } => {
  const segmentLengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  const targetLength =
    segmentLengths.reduce((sum, length) => sum + length, 0) * progress;
  const slicedPoints: FlowPoint[] = [points[0]];
  let traversed = 0;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    const start = points[index];
    const end = points[index + 1];
    if (traversed + segmentLength < targetLength) {
      slicedPoints.push(end);
      traversed += segmentLength;
      continue;
    }
    const segmentProgress = segmentLength
      ? (targetLength - traversed) / segmentLength
      : 0;
    const interruption = {
      x: compactCoordinate(start.x + (end.x - start.x) * segmentProgress),
      y: compactCoordinate(start.y + (end.y - start.y) * segmentProgress),
    };
    slicedPoints.push(interruption);
    return { points: slicedPoints, end: interruption };
  }

  return { points, end: points[points.length - 1] };
};

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
    const causcapeData = element.customData?.causcape as
      | { readonly metadata?: Readonly<Record<string, unknown>> }
      | undefined;
    const isInterrupted = causcapeData?.metadata?.status === "interrupted";
    const interruption = isInterrupted
      ? slicePathAtProgress(points, 0.5)
      : null;

    return [
      {
        id: element.id,
        color: element.strokeColor,
        d: toSvgPath(points),
        packetCount,
        ...(interruption
          ? {
              packetD: toSvgPath(interruption.points),
              interruption: interruption.end,
            }
          : {}),
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
                path={path.packetD ?? path.d}
                dur="2.4s"
                begin={`${(-2.4 * index) / path.packetCount}s`}
                repeatCount="indefinite"
                rotate="auto"
                calcMode="linear"
              />
            </rect>
          ))}
          {path.interruption ? (
            <g
              className="causcape-flow-overlay__interruption"
              data-flow-interruption={path.id}
              transform={`translate(${path.interruption.x} ${path.interruption.y})`}
            >
              <circle
                className="causcape-flow-overlay__interruption-pulse"
                r="10"
              >
                <animate
                  attributeName="r"
                  values="10;18"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.55;0"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle
                className="causcape-flow-overlay__interruption-core"
                r="10"
              />
              <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" />
            </g>
          ) : null}
        </g>
      ))}
    </svg>
  );
});

CauscapeFlowOverlay.displayName = "CauscapeFlowOverlay";

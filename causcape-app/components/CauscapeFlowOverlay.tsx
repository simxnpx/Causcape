import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { LinearElementEditor } from "@causcape/element";
import {
  getCauscapeEdgeLabel,
  getCauscapeEdgeLabelAnchor,
} from "@causcape/element";

import type {
  CauscapeLinearElement,
  OrderedCauscapeElement,
} from "@causcape/element/types";

import "./CauscapeFlowOverlay.scss";

type FlowViewport = {
  readonly zoom: { readonly value: number };
  readonly scrollX: number;
  readonly scrollY: number;
  readonly width: number;
  readonly height: number;
};

type EngineeringRelationship =
  | "calls"
  | "depends-on"
  | "reads"
  | "writes"
  | "publishes"
  | "subscribes"
  | "flow";

type EngineeringFlowVariant =
  | "synchronous"
  | "dependency"
  | "data"
  | "asynchronous"
  | "generic";

type EngineeringFlowStatus = "active" | "degraded" | "interrupted";

type EngineeringPacketVariant = "capsule" | "dot" | "diamond";

export type EngineeringFlowPath = {
  readonly id: string;
  readonly color: string;
  readonly d: string;
  readonly packetCount: number;
  readonly relationship?: EngineeringRelationship;
  readonly variant?: EngineeringFlowVariant;
  readonly packetVariant?: EngineeringPacketVariant;
  readonly status?: EngineeringFlowStatus;
  readonly durationSeconds?: number;
  readonly label?: string;
  readonly labelAnchor?: { readonly x: number; readonly y: number };
  readonly packetD?: string;
  readonly reverseD?: string;
  readonly reversePacketD?: string;
  /** Authored source-to-target geometry, independent of relationship styling. */
  readonly playbackForwardD?: string;
  readonly playbackReverseD?: string;
  readonly interruption?: { readonly x: number; readonly y: number };
};

export type CauscapeFlowOverlayHandle = {
  update: (
    elements: readonly OrderedCauscapeElement[],
    viewport: FlowViewport,
  ) => void;
};

type CauscapeFlowOverlayProps = {
  readonly paths?: readonly EngineeringFlowPath[];
  readonly playback?: {
    readonly activeEdgeId?: string;
    readonly activeDirection?: "forward" | "reverse";
    readonly completedEdgeIds: readonly string[];
    readonly isPlaying: boolean;
  };
};

const FLOW_VIEWPORT_MARGIN = 32;
const EMPTY_FLOW_PATHS: readonly EngineeringFlowPath[] = [];

const compactCoordinate = (value: number) => Number(value.toFixed(2));

type FlowPoint = { readonly x: number; readonly y: number };

const toSvgPath = (points: readonly FlowPoint[]) =>
  points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

const RELATIONSHIP_PRESENTATION: Record<
  Exclude<EngineeringRelationship, "flow">,
  Readonly<{
    color: string;
    variant: EngineeringFlowVariant;
    packetVariant: EngineeringPacketVariant;
    durationSeconds: number;
    reverseDirection?: boolean;
  }>
> = {
  calls: {
    color: "#2563eb",
    variant: "synchronous",
    packetVariant: "capsule",
    durationSeconds: 1.9,
  },
  "depends-on": {
    color: "#64748b",
    variant: "dependency",
    packetVariant: "diamond",
    durationSeconds: 3.4,
  },
  reads: {
    color: "#7c3aed",
    variant: "data",
    packetVariant: "dot",
    durationSeconds: 2.2,
    reverseDirection: true,
  },
  writes: {
    color: "#7c3aed",
    variant: "data",
    packetVariant: "dot",
    durationSeconds: 2.2,
  },
  publishes: {
    color: "#d97706",
    variant: "asynchronous",
    packetVariant: "dot",
    durationSeconds: 2.7,
  },
  subscribes: {
    color: "#d97706",
    variant: "asynchronous",
    packetVariant: "dot",
    durationSeconds: 2.7,
    reverseDirection: true,
  },
};

const isEngineeringRelationship = (
  value: unknown,
): value is Exclude<EngineeringRelationship, "flow"> =>
  typeof value === "string" && value in RELATIONSHIP_PRESENTATION;

const getFlowMetadata = (element: OrderedCauscapeElement) => {
  if (element.type === "causcape-edge") {
    return element.causcape as Readonly<Record<string, unknown>>;
  }
  const data = element.customData?.causcape as
    | { readonly metadata?: Readonly<Record<string, unknown>> }
    | undefined;
  return data?.metadata ?? {};
};

const getFlowStatus = (
  metadata: Readonly<Record<string, unknown>>,
): EngineeringFlowStatus =>
  metadata.status === "interrupted" || metadata.status === "failed"
    ? "interrupted"
    : metadata.status === "degraded"
    ? "degraded"
    : "active";

const getMarkerId = (id: string) =>
  `causcape-flow-marker-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const getVisibleLabel = (label: string) =>
  label.length > 42 ? `${label.slice(0, 41).trimEnd()}…` : label;

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
  elements: readonly OrderedCauscapeElement[],
  viewport: FlowViewport,
): readonly EngineeringFlowPath[] => {
  const elementsMap = new Map(elements.map((element) => [element.id, element]));

  return elements.flatMap((element) => {
    if (
      (element.type !== "arrow" && element.type !== "causcape-edge") ||
      element.isDeleted
    ) {
      return [];
    }

    const authoredPoints = LinearElementEditor.getPointsGlobalCoordinates(
      element as unknown as CauscapeLinearElement,
      elementsMap,
    ).map(([sceneX, sceneY]) => ({
      x: compactCoordinate((sceneX + viewport.scrollX) * viewport.zoom.value),
      y: compactCoordinate((sceneY + viewport.scrollY) * viewport.zoom.value),
    }));
    let points = authoredPoints;

    const metadata = getFlowMetadata(element);
    const relationship = isEngineeringRelationship(metadata.relationship)
      ? metadata.relationship
      : null;
    const presentation = relationship
      ? RELATIONSHIP_PRESENTATION[relationship]
      : null;

    // Reads/subscriptions describe the consumer relation, while their visible
    // packets travel from the producer. Start-only arrows have the same
    // end-to-start authored direction.
    if (
      presentation?.reverseDirection ||
      (element.startArrowhead && !element.endArrowhead)
    ) {
      points = [...points].reverse();
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
    const status = getFlowStatus(metadata);
    const isInterrupted = status === "interrupted";
    const isBidirectional =
      (!!element.startArrowhead && !!element.endArrowhead) ||
      metadata.direction === "bidirectional";
    const interruption = isInterrupted
      ? slicePathAtProgress(points, 0.5)
      : null;
    const reversePoints = isBidirectional ? [...points].reverse() : null;
    const reverseInterruption =
      isInterrupted && reversePoints
        ? slicePathAtProgress(reversePoints, 0.5)
        : null;
    const label =
      element.type === "causcape-edge"
        ? getCauscapeEdgeLabel(element.causcape)
        : null;
    const labelAnchor = label
      ? getCauscapeEdgeLabelAnchor(
          points.map(({ x, y }) => [x, y] as [number, number]),
        )
      : null;
    const color =
      status === "interrupted"
        ? "#dc2626"
        : status === "degraded"
        ? "#d97706"
        : presentation?.color ?? element.strokeColor;

    return [
      {
        id: element.id,
        color,
        d: toSvgPath(points),
        playbackForwardD: toSvgPath(authoredPoints),
        playbackReverseD: toSvgPath([...authoredPoints].reverse()),
        packetCount,
        relationship: relationship ?? "flow",
        variant: presentation?.variant ?? "generic",
        packetVariant: presentation?.packetVariant ?? "capsule",
        status,
        durationSeconds:
          status === "degraded"
            ? Math.max(3.2, presentation?.durationSeconds ?? 2.4)
            : presentation?.durationSeconds ?? 2.4,
        ...(label ? { label } : {}),
        ...(labelAnchor
          ? {
              labelAnchor: {
                x: compactCoordinate(labelAnchor.x + labelAnchor.normalX * 22),
                y: compactCoordinate(labelAnchor.y + labelAnchor.normalY * 22),
              },
            }
          : {}),
        ...(interruption
          ? {
              packetD: toSvgPath(interruption.points),
              interruption: interruption.end,
            }
          : {}),
        ...(reversePoints
          ? {
              reverseD: toSvgPath(reversePoints),
              ...(reverseInterruption
                ? { reversePacketD: toSvgPath(reverseInterruption.points) }
                : {}),
            }
          : {}),
      },
    ];
  });
};

export const CauscapeFlowOverlay = forwardRef<
  CauscapeFlowOverlayHandle,
  CauscapeFlowOverlayProps
>(({ paths: suppliedPaths, playback }, ref) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const updateTimeoutRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{
    readonly elements: readonly OrderedCauscapeElement[];
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
        svgRef.current?.setAttribute(
          "data-flow-input-count",
          String(elements.length),
        );
        svgRef.current?.setAttribute(
          "data-flow-viewport",
          `${viewport.width}x${viewport.height}@${viewport.zoom.value}:${viewport.scrollX},${viewport.scrollY}`,
        );
        const ownerWindow = svgRef.current?.ownerDocument.defaultView;
        if (
          !ownerWindow ||
          animationFrameRef.current !== null ||
          updateTimeoutRef.current !== null
        ) {
          return;
        }
        const flushUpdate = () => {
          if (animationFrameRef.current !== null) {
            ownerWindow.cancelAnimationFrame(animationFrameRef.current);
          }
          if (updateTimeoutRef.current !== null) {
            ownerWindow.clearTimeout(updateTimeoutRef.current);
          }
          animationFrameRef.current = null;
          updateTimeoutRef.current = null;
          const pendingUpdate = pendingUpdateRef.current;
          pendingUpdateRef.current = null;
          if (pendingUpdate) {
            const nextPaths = buildEngineeringFlowPaths(
              pendingUpdate.elements,
              pendingUpdate.viewport,
            );
            svgRef.current?.setAttribute(
              "data-flow-built-count",
              String(nextPaths.length),
            );
            setPaths(nextPaths);
          }
        };
        animationFrameRef.current =
          ownerWindow.requestAnimationFrame(flushUpdate);
        // Background tabs may pause animation frames indefinitely. This
        // bounded fallback keeps restored projects ready when they become
        // visible without changing the foreground frame-coalescing path.
        updateTimeoutRef.current = ownerWindow.setTimeout(flushUpdate, 120);
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
      if (ownerWindow && updateTimeoutRef.current !== null) {
        ownerWindow.clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="causcape-flow-overlay"
      data-testid="causcape-flow-overlay"
      data-flow-count={paths.length}
      data-playback-active={playback ? "true" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path) => {
        const playbackState = playback
          ? path.id === playback.activeEdgeId
            ? "active"
            : playback.completedEdgeIds.includes(path.id)
            ? "completed"
            : "inactive"
          : undefined;
        const directions = [
          { name: "forward", d: path.packetD ?? path.d },
          ...(path.reverseD
            ? [
                {
                  name: "reverse",
                  d: path.reversePacketD ?? path.reverseD,
                },
              ]
            : []),
        ];
        const packetCount = path.reverseD
          ? Math.max(1, Math.ceil(path.packetCount / 2))
          : path.packetCount;
        const markerId = getMarkerId(path.id);
        const duration = path.durationSeconds ?? 2.4;
        const playbackD =
          playbackState === "active"
            ? playback?.activeDirection === "reverse"
              ? path.playbackReverseD ?? path.reverseD ?? path.d
              : path.playbackForwardD ?? path.d
            : null;
        const visibleLabel = path.label ? getVisibleLabel(path.label) : null;
        const labelWidth = visibleLabel
          ? Math.min(286, Math.max(96, visibleLabel.length * 7.2 + 28))
          : 0;

        return (
          <g
            key={path.id}
            data-flow-id={path.id}
            data-playback-state={playbackState}
            className={`causcape-flow-overlay__flow causcape-flow-overlay__flow--${
              path.variant ?? "generic"
            } causcape-flow-overlay__flow--${path.status ?? "active"}`}
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 1 1 L 9 5 L 1 9 Z" fill={path.color} />
              </marker>
            </defs>
            <path
              className="causcape-flow-overlay__track-underlay"
              d={path.d}
            />
            <path
              className="causcape-flow-overlay__track"
              data-flow-track={path.id}
              data-flow-playback-track={playbackD ? path.id : undefined}
              d={playbackD ?? path.d}
              stroke={path.color}
              markerStart={
                !playbackD && path.reverseD ? `url(#${markerId})` : undefined
              }
              markerEnd={`url(#${markerId})`}
            />
            {playbackState === "active" && playback?.isPlaying ? (
              <circle
                key={`${path.id}:${playback.activeDirection ?? "forward"}`}
                className="causcape-flow-overlay__playback-packet"
                r="7"
                fill={path.color}
              >
                <animateMotion
                  data-flow-playback-packet={path.id}
                  path={playbackD ?? path.d}
                  dur="1.15s"
                  repeatCount="indefinite"
                  rotate="auto"
                  calcMode="linear"
                />
              </circle>
            ) : null}
            {!playback
              ? directions.flatMap((direction) =>
                  Array.from({ length: packetCount }, (_, index) => {
                    const packetProps = {
                      className: `causcape-flow-overlay__packet causcape-flow-overlay__packet--${
                        path.packetVariant ?? "capsule"
                      }`,
                      "data-flow-packet": path.id,
                      "data-flow-direction": direction.name,
                      fill: path.color,
                    } as const;
                    const animation = (
                      <animateMotion
                        path={direction.d}
                        dur={`${duration}s`}
                        begin={`${(-duration * index) / packetCount}s`}
                        repeatCount="indefinite"
                        rotate="auto"
                        calcMode="linear"
                      />
                    );
                    return path.packetVariant === "dot" ? (
                      <circle
                        key={`${direction.name}-${index}`}
                        {...packetProps}
                        r="4.5"
                      >
                        {animation}
                      </circle>
                    ) : path.packetVariant === "diamond" ? (
                      <path
                        key={`${direction.name}-${index}`}
                        {...packetProps}
                        d="M 0 -5 L 6 0 L 0 5 L -6 0 Z"
                      >
                        {animation}
                      </path>
                    ) : (
                      <rect
                        key={`${direction.name}-${index}`}
                        {...packetProps}
                        x="-8"
                        y="-3.5"
                        width="16"
                        height="7"
                        rx="3.5"
                      >
                        {animation}
                      </rect>
                    );
                  }),
                )
              : null}
            {visibleLabel && path.labelAnchor ? (
              <g
                className="causcape-flow-overlay__label"
                data-flow-label={path.id}
                transform={`translate(${path.labelAnchor.x} ${path.labelAnchor.y})`}
              >
                <rect
                  x={-labelWidth / 2}
                  y="-15"
                  width={labelWidth}
                  height="30"
                  rx="9"
                />
                <circle
                  cx={-labelWidth / 2 + 14}
                  cy="0"
                  r="3"
                  fill={path.color}
                />
                <text x={-labelWidth / 2 + 24} y="0">
                  {visibleLabel}
                </text>
              </g>
            ) : null}
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
        );
      })}
    </svg>
  );
});

CauscapeFlowOverlay.displayName = "CauscapeFlowOverlay";

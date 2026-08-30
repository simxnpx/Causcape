import { THEME } from "@causcape/common";

import type {
  CauscapeArchitectureNodeKind,
  CauscapeArchitectureNodeMetadata,
  CauscapeNodeData,
  CauscapeNodeHealth,
  CauscapeNodeKind,
  CauscapeReference,
  CauscapeReferenceType,
  CauscapeEdgeElement,
  CauscapeNodeElement,
  GithubRef,
  Theme,
} from "./types";

export const CAUSCAPE_SCHEMA_VERSION = 1 as const;

export const CAUSCAPE_NODE_STYLE = {
  padding: 8,
  iconSize: 16,
  iconGap: 6,
  titleFontSize: 11,
  metaFontSize: 10,
  variableFontSize: 12,
  architecturePadding: 24,
  architectureIconSize: 58,
  architectureIconTileSize: 104,
  architectureIconGap: 22,
  architectureTitleFontSize: 28,
  kindFontSize: 15,
  bodyFontSize: 16,
  badgeFontSize: 14,
  lineHeight: 23,
  sectionGap: 16,
  minWidth: 420,
  maxWidth: 720,
  defaultArchitectureWidth: 560,
  defaultArchitectureHeight: 180,
  defaultLegacyWidth: 180,
  defaultLegacyHeight: 60,
  headerHeight: 104,
  chipHeight: 32,
  metadataRowHeight: 48,
  metadataPanelPadding: 14,
  metadataIconXOffset: 16,
  metadataLabelXOffset: 52,
  metadataValueXOffset: 206,
  technologyPanelPadding: 14,
  technologyChipGap: 4,
  technologyRowGap: 4,
  architecturePillHeight: 32,
  staleColor: "#ffab00",
  variableAccent: "#6b7cff",
  lightForeground: "#24292f",
  darkForeground: "#f0f6fc",
  lightSecondary: "#656d76",
  darkSecondary: "#8b949e",
  lightSurface: "#ffffff",
  darkSurface: "#1f2937",
  lightRule: "#d8e0ea",
  darkRule: "#3d4a5b",
  descriptionTopGap: 15,
  technologyChipTopPadding: 4,
  sectionRuleGap: 8,
} as const;

export const CAUSCAPE_GITHUB_ICON_PATH =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";

export const CAUSCAPE_ARCHITECTURE_NODE_KINDS: readonly CauscapeArchitectureNodeKind[] =
  ["service", "datastore", "queue", "external-system", "user"] as const;

const NODE_KINDS: readonly CauscapeNodeKind[] = [
  ...CAUSCAPE_ARCHITECTURE_NODE_KINDS,
  "variable",
  "github-issue",
  "github-pr",
  "github-commit",
  "github-repo",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeKind = (value: unknown): value is CauscapeNodeKind =>
  typeof value === "string" && NODE_KINDS.includes(value as CauscapeNodeKind);

export const isCauscapeArchitectureNodeKind = (
  value: unknown,
): value is CauscapeArchitectureNodeKind =>
  typeof value === "string" &&
  CAUSCAPE_ARCHITECTURE_NODE_KINDS.includes(
    value as CauscapeArchitectureNodeKind,
  );

const isNodeHealth = (value: unknown): value is CauscapeNodeHealth =>
  value === "healthy" ||
  value === "degraded" ||
  value === "failed" ||
  value === "unknown";

const REFERENCE_TYPES: readonly CauscapeReferenceType[] = [
  "repository",
  "dashboard",
  "documentation",
  "runbook",
] as const;

const isReferenceType = (value: unknown): value is CauscapeReferenceType =>
  typeof value === "string" &&
  REFERENCE_TYPES.includes(value as CauscapeReferenceType);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeTechnologies = (
  value: unknown,
): readonly string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const technologies = Array.from(
    new Set(
      value
        .map(normalizeOptionalString)
        .filter((technology): technology is string => technology !== undefined),
    ),
  );
  return technologies.length > 0 ? technologies : undefined;
};

const normalizeReference = (value: unknown): CauscapeReference | null => {
  if (!isRecord(value)) {
    return null;
  }
  const type = isReferenceType(value.type)
    ? value.type
    : value.kind === "github-repo"
    ? "repository"
    : null;
  const url = normalizeOptionalString(value.url);
  if (!type || !url) {
    return null;
  }
  const label = normalizeOptionalString(value.label);
  return label ? { type, url, label } : { type, url };
};

const normalizeReferences = (
  value: unknown,
): readonly CauscapeReference[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seen = new Set<string>();
  const references: CauscapeReference[] = [];
  for (const item of value) {
    const reference = normalizeReference(item);
    if (!reference) {
      continue;
    }
    const key = `${reference.type}:${reference.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    references.push(reference);
  }
  return references.length > 0 ? references : undefined;
};

/** Normalize persisted/plugin data without trusting its shape at render time. */
export const normalizeCauscapeNodeData = (
  value: unknown,
): CauscapeNodeData & Record<string, unknown> => {
  const raw = isRecord(value) ? value : {};
  const kind = isNodeKind(raw.kind) ? raw.kind : "variable";
  const {
    environment,
    health,
    description,
    technologies,
    references,
    ...otherData
  } = raw;
  const metadata: CauscapeArchitectureNodeMetadata = {
    ...(normalizeOptionalString(environment)
      ? { environment: normalizeOptionalString(environment) }
      : {}),
    ...(isNodeHealth(health) ? { health } : {}),
    ...(normalizeOptionalString(description)
      ? { description: normalizeOptionalString(description) }
      : {}),
    ...(normalizeTechnologies(technologies)
      ? { technologies: normalizeTechnologies(technologies) }
      : {}),
    ...(normalizeReferences(references)
      ? { references: normalizeReferences(references) }
      : {}),
  };
  return {
    ...otherData,
    schemaVersion: CAUSCAPE_SCHEMA_VERSION,
    kind,
    label: normalizeOptionalString(raw.label) ?? "",
    ...metadata,
  } as CauscapeNodeData & Record<string, unknown>;
};

export const normalizeCauscapeEdgeData = (
  value: unknown,
): CauscapeEdgeElement["causcape"] => {
  const raw = isRecord(value) ? value : {};
  return {
    ...raw,
    schemaVersion: CAUSCAPE_SCHEMA_VERSION,
    fromNodeId: typeof raw.fromNodeId === "string" ? raw.fromNodeId : "",
    toNodeId: typeof raw.toNodeId === "string" ? raw.toNodeId : "",
    ...(typeof raw.label === "string" ? { label: raw.label } : {}),
  };
};

/** Returns the user-facing text for a typed architecture relationship. */
export const getCauscapeEdgeLabel = (value: unknown): string | null => {
  const raw = isRecord(value) ? value : {};
  const relationship =
    typeof raw.relationship === "string"
      ? raw.relationship.trim().replaceAll("-", " ")
      : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const text = [relationship, label].filter(Boolean).join(" · ");
  return text || null;
};

/** Wraps an edge label without truncating it. Edge labels may span any number of lines. */
export const wrapCauscapeEdgeLabel = (
  text: string,
  maxChars: number,
): readonly string[] => {
  const limit = Math.max(1, maxChars);
  const lines: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/)) {
    if (!word) {
      continue;
    }
    if (word.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += limit) {
        lines.push(word.slice(index, index + limit));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > limit) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
};

export type CauscapeEdgeLabelAnchor = Readonly<{
  x: number;
  y: number;
  length: number;
  normalX: number;
  normalY: number;
}>;

export const getCauscapeEdgeLabelAnchor = (
  points: readonly [number, number][],
): CauscapeEdgeLabelAnchor | null => {
  let longest = 0;
  let anchor: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    length: number;
  } | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const [startX, startY] = points[index - 1];
    const [endX, endY] = points[index];
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    if (length > longest) {
      longest = length;
      anchor = {
        x: (startX + endX) / 2,
        y: (startY + endY) / 2,
        dx,
        dy,
        length,
      };
    }
  }
  if (!anchor || anchor.length === 0) {
    return null;
  }
  let normalX = -anchor.dy / anchor.length;
  let normalY = anchor.dx / anchor.length;
  if (Math.abs(normalY) >= 0.1 && normalY < 0) {
    normalX = -normalX;
    normalY = -normalY;
  } else if (Math.abs(normalY) < 0.1 && normalX < 0) {
    normalX = -normalX;
    normalY = -normalY;
  }
  return {
    x: anchor.x,
    y: anchor.y,
    length: anchor.length,
    normalX,
    normalY,
  };
};

export type CauscapeEdgeLabelBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
  lines: readonly string[];
}>;

/** Returns the complete label rectangle in the edge's local coordinate space. */
export const getCauscapeEdgeLabelBounds = (
  points: readonly [number, number][],
  value: unknown,
  options: Readonly<{
    offset?: number;
    characterWidth?: number;
    lineHeight?: number;
    horizontalPadding?: number;
    verticalPadding?: number;
  }> = {},
): CauscapeEdgeLabelBounds | null => {
  const label = getCauscapeEdgeLabel(value);
  const anchor = getCauscapeEdgeLabelAnchor(points);
  if (!label || !anchor) {
    return null;
  }
  const characterWidth = options.characterWidth ?? 7;
  const lineHeight = options.lineHeight ?? 18;
  const horizontalPadding = options.horizontalPadding ?? 8;
  const verticalPadding = options.verticalPadding ?? 5;
  const offset = options.offset ?? 16;
  const maxChars = Math.max(
    14,
    Math.floor(Math.max(anchor.length - 16, 100) / 7),
  );
  const lines = wrapCauscapeEdgeLabel(label, maxChars);
  const width = Math.max(
    ...lines.map(
      (line) => line.length * characterWidth + horizontalPadding * 2,
    ),
  );
  const height = lines.length * lineHeight + verticalPadding * 2;
  const labelX = anchor.x + anchor.normalX * offset;
  const labelY = anchor.y + anchor.normalY * offset;
  return {
    x: labelX - width / 2,
    y: labelY - height / 2,
    width,
    height,
    labelX,
    labelY,
    lines,
  };
};

const ARCHITECTURE_KIND_LABELS: Record<CauscapeArchitectureNodeKind, string> = {
  service: "Service",
  datastore: "Datastore",
  queue: "Queue",
  "external-system": "External system",
  user: "User",
};

const HEALTH_PRESENTATION: Record<
  CauscapeNodeHealth,
  { label: string; glyph: string; lightColor: string; darkColor: string }
> = {
  healthy: {
    label: "Healthy",
    glyph: "✓",
    lightColor: "#1a7f37",
    darkColor: "#3fb950",
  },
  degraded: {
    label: "Degraded",
    glyph: "!",
    lightColor: "#9a6700",
    darkColor: "#d29922",
  },
  failed: {
    label: "Failed",
    glyph: "×",
    lightColor: "#cf222e",
    darkColor: "#f85149",
  },
  unknown: {
    label: "Unknown",
    glyph: "?",
    lightColor: "#656d76",
    darkColor: "#8b949e",
  },
};

const ARCHITECTURE_KIND_ACCENTS: Record<
  CauscapeArchitectureNodeKind,
  { light: string; dark: string }
> = {
  service: { light: "#0969da", dark: "#58a6ff" },
  datastore: { light: "#8250df", dark: "#bc8cff" },
  queue: { light: "#bc4c00", dark: "#f0883e" },
  "external-system": { light: "#0a7b68", dark: "#3fb9a4" },
  user: { light: "#bf3989", dark: "#db61a2" },
};

const REFERENCE_LABELS: Record<CauscapeReferenceType, string> = {
  repository: "Repository",
  dashboard: "Dashboard",
  documentation: "Docs",
  runbook: "Runbook",
};

export const getCauscapeArchitectureNodeKindLabel = (
  kind: CauscapeArchitectureNodeKind,
): string => ARCHITECTURE_KIND_LABELS[kind];

export const getCauscapeReferenceLabel = (
  reference: CauscapeReference,
): string => reference.label || REFERENCE_LABELS[reference.type];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const estimateCauscapeTextWidth = (text: string, fontSize: number): number =>
  text.length * fontSize * 0.51;

export type CauscapeMetadataIcon =
  | "environment"
  | "repository"
  | "dashboard"
  | "documentation"
  | "runbook";

export type CauscapeLayoutRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type CauscapeLayoutText = Readonly<{
  lines: readonly string[];
  x: number;
  baselines: readonly number[];
}>;

export type CauscapeLayoutPill = Readonly<{
  rect: CauscapeLayoutRect;
  text: string;
  textX: number;
  baseline: number;
}>;

export type CauscapeMetadataRowLayout = Readonly<{
  rect: CauscapeLayoutRect;
  icon: CauscapeMetadataIcon;
  iconRect: CauscapeLayoutRect;
  label: string;
  value: string;
  labelX: number;
  valueX: number;
  baseline: number;
  reference: CauscapeReference | null;
}>;

export type CauscapeTechnologyChipLayout = Readonly<{
  rect: CauscapeLayoutRect;
  label: string;
  textX: number;
  baseline: number;
}>;

export type CauscapeArchitectureLayout = Readonly<{
  width: number;
  height: number;
  requiredHeight: number;
  contentRect: CauscapeLayoutRect;
  header: Readonly<{
    iconTileRect: CauscapeLayoutRect;
    iconRect: CauscapeLayoutRect;
    title: CauscapeLayoutText;
    kindPill: CauscapeLayoutPill;
    healthPill: CauscapeLayoutPill | null;
  }>;
  rules: readonly number[];
  description: CauscapeLayoutText | null;
  metadata: Readonly<{
    rect: CauscapeLayoutRect;
    rows: readonly CauscapeMetadataRowLayout[];
  }> | null;
  technologies: Readonly<{
    rect: CauscapeLayoutRect;
    chips: readonly CauscapeTechnologyChipLayout[];
  }> | null;
}>;

const getCauscapeTextLines = (
  text: string,
  maxWidth: number,
  fontSize: number,
): readonly string[] => {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.51)));
  return wrapCauscapeText(text, maxChars).filter((line): line is string =>
    Boolean(line),
  );
};

const getCauscapePillLayout = (
  text: string,
  x: number,
  y: number,
  colorFontSize: number,
  prefix = "",
): CauscapeLayoutPill => {
  const height = CAUSCAPE_NODE_STYLE.architecturePillHeight;
  const horizontalPadding = 14;
  const content = `${prefix ? `${prefix} ` : ""}${text}`;
  const width = Math.max(
    height + 2,
    Math.ceil(
      estimateCauscapeTextWidth(content, colorFontSize) + horizontalPadding * 2,
    ),
  );
  return {
    rect: { x, y, width, height },
    text: content,
    textX: x + horizontalPadding,
    baseline: y + height / 2 + 5,
  };
};

const getCauscapeChipWidth = (label: string): number =>
  Math.min(
    220,
    Math.max(
      74,
      Math.ceil(
        estimateCauscapeTextWidth(label, CAUSCAPE_NODE_STYLE.badgeFontSize) +
          24,
      ),
    ),
  );

const getCauscapeChipLabel = (
  label: string,
  availableWidth: number,
): string => {
  const maxChars = Math.max(
    1,
    Math.floor(
      Math.max(availableWidth - 24, 1) /
        (CAUSCAPE_NODE_STYLE.badgeFontSize * 0.51),
    ),
  );
  return wrapCauscapeText(label, maxChars)[0];
};

export const getCauscapeChipLayouts = (
  labels: readonly string[],
  x: number,
  y: number,
  availableWidth: number,
): readonly CauscapeTechnologyChipLayout[] => {
  const chips: CauscapeTechnologyChipLayout[] = [];
  let cursorX = x;
  let cursorY = y;
  const chipHeight = CAUSCAPE_NODE_STYLE.chipHeight;
  for (const label of labels) {
    const visibleLabel = getCauscapeChipLabel(label, availableWidth);
    const width = Math.min(availableWidth, getCauscapeChipWidth(visibleLabel));
    if (cursorX !== x && cursorX + width > x + availableWidth) {
      cursorX = x;
      cursorY += chipHeight + CAUSCAPE_NODE_STYLE.technologyRowGap;
    }
    chips.push({
      rect: { x: cursorX, y: cursorY, width, height: chipHeight },
      label: visibleLabel,
      textX: cursorX + 12,
      baseline: cursorY + 22,
    });
    cursorX += width + CAUSCAPE_NODE_STYLE.technologyChipGap;
  }
  return chips;
};

export const getCauscapeChipRows = (
  labels: readonly string[],
  availableWidth: number,
): number => {
  const chips = getCauscapeChipLayouts(labels, 0, 0, availableWidth);
  if (chips.length === 0) {
    return 0;
  }
  return new Set(chips.map((chip) => chip.rect.y)).size;
};

export type CauscapeNodeRenderData = {
  kind: CauscapeNodeKind;
  isGithub: boolean;
  isArchitecture: boolean;
  title: string;
  meta: string | null;
  stale: boolean;
  badgeColor: string;
  kindAccent: string;
  foreground: string;
  secondary: string;
  kindLabel: string | null;
  health: {
    value: CauscapeNodeHealth;
    label: string;
    glyph: string;
    color: string;
  } | null;
  description: string | null;
  environment: string | null;
  references: readonly CauscapeReference[];
  technologies: readonly string[];
};

export const getCauscapeNodeRenderData = (
  value: unknown,
  theme: Theme,
): CauscapeNodeRenderData => {
  const data = normalizeCauscapeNodeData(value);
  const dataRecord = data as Record<string, unknown>;
  const cache = isRecord(dataRecord.cache) ? dataRecord.cache : undefined;
  const cacheTitle =
    typeof cache?.title === "string"
      ? cache.title
      : typeof cache?.message === "string"
      ? cache.message.split("\n")[0]
      : typeof cache?.description === "string"
      ? cache.description
      : null;
  const title =
    cacheTitle && cacheTitle.trim().toLowerCase() !== "not found"
      ? cacheTitle
      : data.label;
  const isDark = theme === THEME.DARK;
  const isGithub = data.kind.startsWith("github-");
  const isArchitecture = isCauscapeArchitectureNodeKind(data.kind);
  const architectureKind = isArchitecture
    ? (data.kind as CauscapeArchitectureNodeKind)
    : null;
  const health = isNodeHealth(data.health) ? data.health : null;
  const state =
    typeof cache?.state === "string" ? cache.state.toLowerCase() : "";
  const badgeColor =
    state === "open"
      ? isDark
        ? "#3fb950"
        : "#1a7f37"
      : state === "merged"
      ? isDark
        ? "#ab7ff2"
        : "#8250df"
      : state === "closed"
      ? isDark
        ? "#f85149"
        : "#cf222e"
      : isDark
      ? "#8c959f"
      : "#656d76";
  const kindAccent = architectureKind
    ? ARCHITECTURE_KIND_ACCENTS[architectureKind][isDark ? "dark" : "light"]
    : badgeColor;
  const metaParts: string[] = [];
  if (data.kind === "github-repo" && typeof cache?.stars === "number") {
    metaParts.push(`★ ${cache.stars}`);
  }
  if (
    data.kind === "github-repo" &&
    typeof cache?.language === "string" &&
    cache.language
  ) {
    metaParts.push(cache.language);
  }
  return {
    kind: data.kind,
    isGithub,
    isArchitecture,
    title,
    meta: metaParts.length ? metaParts.join(" · ") : null,
    stale: cache?.stale === true,
    badgeColor: architectureKind
      ? HEALTH_PRESENTATION[health ?? "unknown"][
          isDark ? "darkColor" : "lightColor"
        ]
      : badgeColor,
    kindAccent,
    foreground: isDark
      ? CAUSCAPE_NODE_STYLE.darkForeground
      : CAUSCAPE_NODE_STYLE.lightForeground,
    secondary: isDark
      ? CAUSCAPE_NODE_STYLE.darkSecondary
      : CAUSCAPE_NODE_STYLE.lightSecondary,
    kindLabel: architectureKind
      ? getCauscapeArchitectureNodeKindLabel(architectureKind)
      : null,
    health:
      architectureKind && health
        ? {
            value: health,
            label: HEALTH_PRESENTATION[health].label,
            glyph: HEALTH_PRESENTATION[health].glyph,
            color:
              HEALTH_PRESENTATION[health][isDark ? "darkColor" : "lightColor"],
          }
        : null,
    description:
      isArchitecture && typeof data.description === "string"
        ? data.description
        : null,
    environment:
      isArchitecture && typeof data.environment === "string"
        ? data.environment
        : null,
    references:
      isArchitecture && Array.isArray(data.references) ? data.references : [],
    technologies:
      isArchitecture && Array.isArray(data.technologies)
        ? data.technologies
        : [],
  };
};

export type CauscapeNodeSize = Readonly<{ width: number; height: number }>;

export type CauscapeArchitectureLayoutOptions = Readonly<{
  width?: number;
  height?: number;
  theme?: Theme;
}>;

const getCauscapeArchitectureWidth = (data: CauscapeNodeRenderData): number => {
  const labels = [
    data.title,
    data.description ?? "",
    data.environment ?? "",
    ...data.references.map(getCauscapeReferenceLabel),
    ...data.technologies,
  ];
  const widestLabel = labels.reduce(
    (widest, label) => Math.max(widest, label.length),
    0,
  );
  return Math.ceil(
    clamp(
      Math.max(
        CAUSCAPE_NODE_STYLE.defaultArchitectureWidth,
        widestLabel * 8 + CAUSCAPE_NODE_STYLE.architecturePadding * 2 + 48,
      ),
      CAUSCAPE_NODE_STYLE.minWidth,
      CAUSCAPE_NODE_STYLE.maxWidth,
    ),
  );
};

const getCauscapeSingleLine = (text: string, maxWidth: number): string => {
  const maxChars = Math.max(
    1,
    Math.floor(maxWidth / (CAUSCAPE_NODE_STYLE.bodyFontSize * 0.51)),
  );
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
};

const getCauscapeTextLayout = (
  lines: readonly string[],
  x: number,
  firstBaseline: number,
): CauscapeLayoutText => ({
  lines,
  x,
  baselines: lines.map(
    (_, index) => firstBaseline + index * CAUSCAPE_NODE_STYLE.lineHeight,
  ),
});

/**
 * The single geometry model for architecture cards. Canvas, SVG export,
 * sizing, and interaction all consume these rectangles and baselines so a
 * spacing change is made once and cannot make the renderers disagree.
 */
export const getCauscapeArchitectureLayout = (
  value: unknown,
  options: CauscapeArchitectureLayoutOptions = {},
): CauscapeArchitectureLayout => {
  const theme = options.theme ?? THEME.LIGHT;
  const data = getCauscapeNodeRenderData(value, theme);
  const width = Math.ceil(options.width ?? getCauscapeArchitectureWidth(data));
  const padding = CAUSCAPE_NODE_STYLE.architecturePadding;
  const contentWidth = Math.max(0, width - padding * 2);
  const contentRect = {
    x: padding,
    y: padding,
    width: contentWidth,
    height: Math.max(0, (options.height ?? 0) - padding * 2),
  };
  const iconTileRect = {
    x: padding,
    y: padding,
    width: CAUSCAPE_NODE_STYLE.architectureIconTileSize,
    height: CAUSCAPE_NODE_STYLE.architectureIconTileSize,
  };
  const iconRect = {
    x:
      iconTileRect.x +
      (iconTileRect.width - CAUSCAPE_NODE_STYLE.architectureIconSize) / 2,
    y:
      iconTileRect.y +
      (iconTileRect.height - CAUSCAPE_NODE_STYLE.architectureIconSize) / 2,
    width: CAUSCAPE_NODE_STYLE.architectureIconSize,
    height: CAUSCAPE_NODE_STYLE.architectureIconSize,
  };
  const titleX =
    iconTileRect.x +
    iconTileRect.width +
    CAUSCAPE_NODE_STYLE.architectureIconGap;
  const titleWidth = Math.max(60, width - titleX - padding);
  const titleLines = getCauscapeTextLines(
    data.title,
    titleWidth,
    CAUSCAPE_NODE_STYLE.architectureTitleFontSize,
  );
  const title = getCauscapeTextLayout(titleLines, titleX, padding + 38);
  const pillY = padding + (titleLines.length > 1 ? 80 : 58);
  const kindPill = getCauscapePillLayout(
    data.kindLabel ?? "Component",
    titleX,
    pillY,
    CAUSCAPE_NODE_STYLE.kindFontSize,
  );
  const healthPill = data.health
    ? getCauscapePillLayout(
        data.health.label,
        kindPill.rect.x + kindPill.rect.width + 10,
        pillY,
        CAUSCAPE_NODE_STYLE.kindFontSize,
        data.health.glyph,
      )
    : null;

  const rules: number[] = [];
  let cursorY = padding + CAUSCAPE_NODE_STYLE.headerHeight;
  const description = data.description
    ? (() => {
        const descriptionTop = cursorY + CAUSCAPE_NODE_STYLE.descriptionTopGap;
        const layout = getCauscapeTextLayout(
          getCauscapeTextLines(
            data.description,
            contentWidth,
            CAUSCAPE_NODE_STYLE.bodyFontSize,
          ),
          padding,
          descriptionTop + CAUSCAPE_NODE_STYLE.lineHeight,
        );
        cursorY =
          descriptionTop + layout.lines.length * CAUSCAPE_NODE_STYLE.lineHeight;
        return layout;
      })()
    : null;

  const metadataValues: readonly Readonly<{
    label: string;
    value: string;
    icon: CauscapeMetadataIcon;
    reference: CauscapeReference | null;
  }>[] = [
    ...(data.environment
      ? [
          {
            label: "Environment",
            value: data.environment,
            icon: "environment" as const,
            reference: null,
          },
        ]
      : []),
    ...data.references.map((reference) => ({
      label: REFERENCE_LABELS[reference.type],
      value: getCauscapeReferenceLabel(reference),
      icon: reference.type,
      reference,
    })),
  ];
  const metadata = metadataValues.length
    ? (() => {
        cursorY += CAUSCAPE_NODE_STYLE.sectionGap;
        const rect = {
          x: padding,
          y: cursorY,
          width: contentWidth,
          height:
            CAUSCAPE_NODE_STYLE.metadataPanelPadding * 2 +
            metadataValues.length * CAUSCAPE_NODE_STYLE.metadataRowHeight,
        };
        const valueX =
          rect.x +
          Math.min(
            CAUSCAPE_NODE_STYLE.metadataValueXOffset,
            Math.max(
              CAUSCAPE_NODE_STYLE.metadataLabelXOffset + 120,
              rect.width - 140,
            ),
          );
        const rows = metadataValues.map((row, index) => {
          const rowTop =
            rect.y +
            CAUSCAPE_NODE_STYLE.metadataPanelPadding +
            index * CAUSCAPE_NODE_STYLE.metadataRowHeight;
          const rowRect = {
            x: rect.x,
            y: rowTop,
            width: rect.width,
            height: CAUSCAPE_NODE_STYLE.metadataRowHeight,
          };
          const iconRect = {
            x: rect.x + CAUSCAPE_NODE_STYLE.metadataIconXOffset,
            y: rowTop + (CAUSCAPE_NODE_STYLE.metadataRowHeight - 20) / 2,
            width: 20,
            height: 20,
          };
          return {
            rect: rowRect,
            icon: row.icon,
            iconRect,
            label: row.label,
            value: getCauscapeSingleLine(
              row.value,
              rect.x + rect.width - 16 - valueX,
            ),
            labelX: rect.x + CAUSCAPE_NODE_STYLE.metadataLabelXOffset,
            valueX,
            baseline: rowTop + 30,
            reference: row.reference,
          };
        });
        cursorY = rect.y + rect.height;
        return { rect, rows };
      })()
    : null;

  const technologies = data.technologies.length
    ? (() => {
        const hasMetadata = Boolean(metadata);
        if (hasMetadata) {
          rules.push(cursorY + CAUSCAPE_NODE_STYLE.sectionRuleGap);
          cursorY += CAUSCAPE_NODE_STYLE.sectionRuleGap * 2 + 1;
        } else {
          cursorY += CAUSCAPE_NODE_STYLE.sectionGap;
        }
        const chipX = padding;
        const chipY = cursorY + CAUSCAPE_NODE_STYLE.technologyChipTopPadding;
        const availableWidth = Math.max(1, contentWidth);
        const chips = getCauscapeChipLayouts(
          data.technologies,
          chipX,
          chipY,
          availableWidth,
        );
        const rows = getCauscapeChipRows(data.technologies, availableWidth);
        const rect = {
          x: padding,
          y: cursorY,
          width: contentWidth,
          height:
            CAUSCAPE_NODE_STYLE.technologyChipTopPadding +
            rows * CAUSCAPE_NODE_STYLE.chipHeight +
            Math.max(0, rows - 1) * CAUSCAPE_NODE_STYLE.technologyRowGap,
        };
        cursorY = rect.y + rect.height;
        return { rect, chips };
      })()
    : null;

  const requiredHeight = Math.ceil(
    Math.max(CAUSCAPE_NODE_STYLE.defaultArchitectureHeight, cursorY + padding),
  );
  return {
    width,
    height: Math.ceil(options.height ?? requiredHeight),
    requiredHeight,
    contentRect,
    header: {
      iconTileRect,
      iconRect,
      title,
      kindPill,
      healthPill,
    },
    rules,
    description,
    metadata,
    technologies,
  };
};

/**
 * Returns deterministic card dimensions from serialized node data. Explicit
 * element dimensions can still override these defaults in the constructor.
 */
export const getCauscapeNodeSize = (value: unknown): CauscapeNodeSize => {
  const data = normalizeCauscapeNodeData(value);
  if (!isCauscapeArchitectureNodeKind(data.kind)) {
    return {
      width: CAUSCAPE_NODE_STYLE.defaultLegacyWidth,
      height: CAUSCAPE_NODE_STYLE.defaultLegacyHeight,
    };
  }

  const renderData = getCauscapeNodeRenderData(data, THEME.LIGHT);
  const width = getCauscapeArchitectureWidth(renderData);
  const layout = getCauscapeArchitectureLayout(data, { width });
  return { width, height: layout.requiredHeight };
};

/**
 * Returns the architecture reference painted under a scene point. Keeping
 * this geometry next to the renderer lets the editor make the same pixels
 * interactive without introducing DOM children into the Causcape scene.
 */
export const getCauscapeReferenceAtPoint = (
  element: CauscapeNodeElement,
  point: Readonly<{ x: number; y: number }>,
  theme: Theme,
): CauscapeReference | null => {
  const data = getCauscapeNodeRenderData(element.causcape, theme);
  if (!data.isArchitecture || data.references.length === 0) {
    return null;
  }

  const layout = getCauscapeArchitectureLayout(element.causcape, {
    width: element.width,
    height: element.height,
    theme,
  });

  const centerX = element.width / 2;
  const centerY = element.height / 2;
  const dx = point.x - (element.x + centerX);
  const dy = point.y - (element.y + centerY);
  const cos = Math.cos(-element.angle);
  const sin = Math.sin(-element.angle);
  const localX = centerX + dx * cos - dy * sin;
  const localY = centerY + dx * sin + dy * cos;
  const row = layout.metadata?.rows.find(
    (candidate) =>
      candidate.reference &&
      localX >= candidate.rect.x &&
      localX <= candidate.rect.x + candidate.rect.width &&
      localY >= candidate.rect.y &&
      localY <= candidate.rect.y + candidate.rect.height,
  );
  return row?.reference ?? null;
};

export const wrapCauscapeText = (
  text: string,
  maxChars: number,
): readonly [string, string | null] => {
  const raw = text.trim();
  const limit = Math.max(1, maxChars);
  if (!raw || raw.length <= limit) {
    return [raw, null];
  }
  const words = raw.split(/\s+/);
  let first = "";
  let index = 0;
  while (index < words.length) {
    const candidate = first ? `${first} ${words[index]}` : words[index];
    if (candidate.length > limit) {
      break;
    }
    first = candidate;
    index++;
  }
  if (!first) {
    return [`${words[0].slice(0, Math.max(1, limit - 1))}…`, null];
  }
  let second = "";
  while (index < words.length) {
    const candidate = second ? `${second} ${words[index]}` : words[index];
    if (candidate.length + (index < words.length - 1 ? 1 : 0) > limit) {
      break;
    }
    second = candidate;
    index++;
  }
  if (index < words.length) {
    second = `${second.slice(0, Math.max(1, limit - 1))}…`;
  }
  return [first, second || null];
};

export const isGithubRefForKind = (
  value: unknown,
  kind: CauscapeNodeKind,
): value is GithubRef =>
  isRecord(value) &&
  value.kind === kind &&
  typeof value.owner === "string" &&
  typeof value.repo === "string" &&
  typeof value.url === "string";

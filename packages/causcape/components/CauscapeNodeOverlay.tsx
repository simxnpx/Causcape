import React from "react";

import {
  type CauscapeMetadataIcon,
  getCauscapeNodeRenderData,
  getCauscapeReferenceLabel,
} from "@causcape/element";

import type {
  CauscapeArchitectureNodeKind,
  CauscapeNodeElement,
  Theme,
} from "@causcape/element/types";

import {
  DeviceDesktopIcon,
  ExternalLinkIcon,
  GithubIcon,
  clipboard,
  file,
  presentationIcon,
  save,
  stackPushIcon,
  usersIcon,
} from "./icons";

type CauscapeNodeOverlayProps = Readonly<{
  element: CauscapeNodeElement;
  theme: Theme;
  linksEnabled: boolean;
}>;

const ARCHITECTURE_ICONS: Record<
  CauscapeArchitectureNodeKind,
  React.ReactElement
> = {
  service: DeviceDesktopIcon,
  datastore: save,
  queue: stackPushIcon,
  "external-system": ExternalLinkIcon,
  user: usersIcon,
};

const ArchitectureIcon = ({
  kind,
}: Readonly<{ kind: CauscapeArchitectureNodeKind }>) =>
  ARCHITECTURE_ICONS[kind];

const METADATA_ICONS: Record<CauscapeMetadataIcon, React.ReactElement> = {
  environment: DeviceDesktopIcon,
  repository: GithubIcon,
  dashboard: presentationIcon,
  documentation: file,
  runbook: clipboard,
};

const MetadataIcon = ({ kind }: Readonly<{ kind: CauscapeMetadataIcon }>) => {
  return METADATA_ICONS[kind];
};

const REFERENCE_TYPE_LABELS = {
  repository: "Repository",
  dashboard: "Dashboard",
  documentation: "Documentation",
  runbook: "Runbook",
} as const;

export const CauscapeNodeOverlay = ({
  element,
  theme,
  linksEnabled,
}: CauscapeNodeOverlayProps) => {
  const data = getCauscapeNodeRenderData(element.causcape, theme);
  if (!data.isArchitecture) {
    return null;
  }

  return (
    <article
      className="causcape-node-overlay-card"
      data-testid="causcape-node-overlay"
      data-links-enabled={linksEnabled}
      style={{
        ["--causcape-accent" as string]: data.kindAccent,
        ["--causcape-foreground" as string]: data.foreground,
        ["--causcape-secondary" as string]: data.secondary,
        ["--causcape-panel" as string]:
          theme === "dark" ? "#263449" : "#fbfcfe",
        ["--causcape-surface" as string]:
          theme === "dark" ? "#1f2937" : "#ffffff",
        ["--causcape-rule" as string]: theme === "dark" ? "#3d4a5b" : "#d8e0ea",
      }}
    >
      <header className="causcape-node-overlay-card__header">
        <div className="causcape-node-overlay-card__icon-tile">
          <ArchitectureIcon kind={data.kind as CauscapeArchitectureNodeKind} />
        </div>
        <div className="causcape-node-overlay-card__heading">
          <div className="causcape-node-overlay-card__context">
            <span className="causcape-node-overlay-card__context-chip causcape-node-overlay-card__context-chip--kind">
              {data.kindLabel ?? "Component"}
            </span>
            {data.environment && (
              <span className="causcape-node-overlay-card__context-chip causcape-node-overlay-card__context-chip--environment">
                <MetadataIcon kind="environment" />
                {data.environment}
              </span>
            )}
            {data.health && (
              <span
                className="causcape-node-overlay-card__context-chip causcape-node-overlay-card__context-chip--health"
                data-health={data.health.value}
                style={{
                  ["--causcape-pill-color" as string]: data.health.color,
                }}
              >
                <span
                  className="causcape-node-overlay-card__health-dot"
                  aria-hidden="true"
                />
                {data.health.label}
              </span>
            )}
          </div>
          <h3>{data.title || "Untitled component"}</h3>
        </div>
      </header>

      {data.description && (
        <p className="causcape-node-overlay-card__description">
          {data.description}
        </p>
      )}

      {(data.technologies.length > 0 || data.references.length > 0) && (
        <footer className="causcape-node-overlay-card__footer">
          {data.technologies.length > 0 && (
            <section className="causcape-node-overlay-card__technologies">
              {data.technologies.map((technology) => (
                <span
                  className="causcape-node-overlay-card__technology"
                  key={technology}
                >
                  {technology}
                </span>
              ))}
            </section>
          )}
          {data.references.length > 0 && (
            <nav
              className="causcape-node-overlay-card__references"
              aria-label="Component references"
            >
              {data.references.map((reference) => {
                const label = getCauscapeReferenceLabel(reference);
                const typeLabel = REFERENCE_TYPE_LABELS[reference.type];
                return (
                  <a
                    className="causcape-node-overlay-card__reference"
                    data-reference-type={reference.type}
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${typeLabel}: ${label}`}
                    title={`${typeLabel}: ${label}`}
                    key={`${reference.type}:${reference.url}`}
                  >
                    <MetadataIcon kind={reference.type} />
                    <span>{label}</span>
                  </a>
                );
              })}
            </nav>
          )}
        </footer>
      )}
    </article>
  );
};

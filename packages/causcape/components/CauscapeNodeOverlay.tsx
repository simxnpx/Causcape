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
          <h3>{data.title || "Untitled component"}</h3>
          <div className="causcape-node-overlay-card__pills">
            <span className="causcape-node-overlay-card__pill causcape-node-overlay-card__pill--kind">
              {data.kindLabel ?? "Component"}
            </span>
            {data.health && (
              <span
                className="causcape-node-overlay-card__pill"
                style={{
                  ["--causcape-pill-color" as string]: data.health.color,
                }}
              >
                <span aria-hidden="true">{data.health.glyph}</span>
                {data.health.label}
              </span>
            )}
          </div>
        </div>
      </header>

      {data.description && (
        <p className="causcape-node-overlay-card__description">
          {data.description}
        </p>
      )}

      {(data.environment || data.references.length > 0) && (
        <section className="causcape-node-overlay-card__metadata">
          {data.environment && (
            <div className="causcape-node-overlay-card__metadata-row">
              <MetadataIcon kind="environment" />
              <span className="causcape-node-overlay-card__metadata-label">
                Environment
              </span>
              <span className="causcape-node-overlay-card__metadata-value causcape-node-overlay-card__metadata-value--plain">
                {data.environment}
              </span>
            </div>
          )}
          {data.references.map((reference) => (
            <div
              className="causcape-node-overlay-card__metadata-row"
              key={`${reference.type}:${reference.url}`}
            >
              <MetadataIcon kind={reference.type} />
              <span className="causcape-node-overlay-card__metadata-label">
                {reference.type === "repository"
                  ? "Repository"
                  : reference.type === "dashboard"
                  ? "Dashboard"
                  : reference.type === "documentation"
                  ? "Documentation"
                  : "Runbook"}
              </span>
              <a
                className="causcape-node-overlay-card__metadata-value"
                href={reference.url}
                target="_blank"
                rel="noreferrer"
              >
                {getCauscapeReferenceLabel(reference)}
              </a>
            </div>
          ))}
        </section>
      )}

      {data.technologies.length > 0 && (
        <>
          {(data.environment || data.references.length > 0) && (
            <div className="causcape-node-overlay-card__section-rule" />
          )}
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
        </>
      )}
    </article>
  );
};

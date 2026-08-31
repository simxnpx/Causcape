import React, { useEffect, useRef, useState } from "react";

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
  CloseIcon,
  clipboard,
  file,
  infoCircleIcon,
  presentationIcon,
  save,
  stackPushIcon,
  usersIcon,
} from "./icons";

type CauscapeNodeOverlayProps = Readonly<{
  element: CauscapeNodeElement;
  theme: Theme;
  linksEnabled: boolean;
  onOpenDescription: (elementId: CauscapeNodeElement["id"]) => void;
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
  onOpenDescription,
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
      <button
        type="button"
        className="causcape-node-overlay-card__info"
        aria-label={`About ${data.title || "this component"}`}
        title="About this component"
        data-has-description={Boolean(data.description)}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenDescription(element.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.detail === 0) {
            onOpenDescription(element.id);
          }
        }}
      >
        {infoCircleIcon}
      </button>
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

type CauscapeNodeDescriptionSheetProps = Readonly<{
  element: CauscapeNodeElement | null;
  theme: Theme;
  onClose: () => void;
}>;

const DESCRIPTION_EXIT_MS = 360;

export const CauscapeNodeDescriptionSheet = ({
  element,
  theme,
  onClose,
}: CauscapeNodeDescriptionSheetProps) => {
  const [displayedElement, setDisplayedElement] = useState(element);
  const [isOpen, setIsOpen] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (element) {
      setDisplayedElement(element);
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    const ownerWindow = sheetRef.current?.ownerDocument.defaultView;
    if (!ownerWindow) {
      setDisplayedElement(null);
      return;
    }
    const timeout = ownerWindow.setTimeout(
      () => setDisplayedElement(null),
      DESCRIPTION_EXIT_MS,
    );
    return () => ownerWindow.clearTimeout(timeout);
  }, [element]);

  useEffect(() => {
    if (!displayedElement || !element) {
      return;
    }
    const ownerWindow = sheetRef.current?.ownerDocument.defaultView;
    if (!ownerWindow) {
      setIsOpen(true);
      return;
    }
    // Let the sheet paint once below the viewport before transitioning it in.
    // A short owner-window timer also runs reliably in backgrounded canvases.
    const timeout = ownerWindow.setTimeout(() => setIsOpen(true), 20);
    return () => ownerWindow.clearTimeout(timeout);
  }, [displayedElement, element]);

  useEffect(() => {
    const ownerDocument = sheetRef.current?.ownerDocument;
    if (!displayedElement || !ownerDocument) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    ownerDocument.addEventListener("keydown", closeOnEscape);
    return () => ownerDocument.removeEventListener("keydown", closeOnEscape);
  }, [displayedElement, onClose]);

  if (!displayedElement) {
    return null;
  }

  const data = getCauscapeNodeRenderData(displayedElement.causcape, theme);
  if (!data.isArchitecture) {
    return null;
  }
  const title = data.title || "Untitled component";
  const context = [data.kindLabel, data.environment]
    .filter(Boolean)
    .join(" · ");
  const titleId = `causcape-node-description-${displayedElement.id}`;

  return (
    <aside
      ref={sheetRef}
      className="causcape-node-description-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-open={isOpen}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        ["--causcape-accent" as string]: data.kindAccent,
        ["--causcape-foreground" as string]: data.foreground,
        ["--causcape-secondary" as string]: data.secondary,
        ["--causcape-sheet" as string]:
          theme === "dark" ? "#202b3a" : "#ffffff",
        ["--causcape-rule" as string]: theme === "dark" ? "#3d4a5b" : "#d8e0ea",
      }}
    >
      <div className="causcape-node-description-sheet__accent" />
      <div className="causcape-node-description-sheet__icon">
        <ArchitectureIcon kind={data.kind as CauscapeArchitectureNodeKind} />
      </div>
      <div className="causcape-node-description-sheet__content">
        <span className="causcape-node-description-sheet__eyebrow">
          {context || "Component"}
        </span>
        <h2 id={titleId}>{title}</h2>
        <p>
          {data.description ||
            "No description yet. Select this object and open Object details to add one."}
        </p>
      </div>
      <button
        type="button"
        className="causcape-node-description-sheet__close"
        aria-label={`Close ${title} description`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.detail === 0) {
            onClose();
          }
        }}
      >
        {CloseIcon}
      </button>
    </aside>
  );
};

import { useEffect, useState, type ReactNode } from "react";

import {
  adjustmentsIcon,
  drawShapeToolIcon,
  playerPlayIcon,
} from "@causcape/causcape/components/icons";

import type { CanvasObject, MetadataValue } from "@causcape/core";

import {
  PREPARED_ENGINEERING_SHAPES,
  type PreparedEngineeringShapeKind,
} from "../data/causcapeCanvasObjects";

import "./CauscapeEngineeringTools.scss";

type CauscapeEngineeringToolsProps = {
  selectedObject: CanvasObject | null;
  flowPanel?: ReactNode;
  hasDataFlows?: boolean;
  isFlowPlaying?: boolean;
  onAddShape: (kind: PreparedEngineeringShapeKind) => void;
  onRename: (objectId: string, name: string) => void;
  onDescriptionChange: (objectId: string, description: string) => void;
  onMetadataSet: (objectId: string, key: string, value: MetadataValue) => void;
  onMetadataDelete: (objectId: string, key: string) => void;
};

const metadataValueLabel = (value: MetadataValue) =>
  typeof value === "object" ? value.value : String(value);

const SHAPE_GROUPS = [
  { id: "components", label: "Components" },
  { id: "boundaries", label: "Boundaries" },
  { id: "flows", label: "Flows" },
] as const;

export const CauscapeEngineeringTools = ({
  selectedObject,
  flowPanel,
  hasDataFlows = false,
  isFlowPlaying = false,
  onAddShape,
  onRename,
  onDescriptionChange,
  onMetadataSet,
  onMetadataDelete,
}: CauscapeEngineeringToolsProps) => {
  const [showShapes, setShowShapes] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showFlowPlayer, setShowFlowPlayer] = useState(false);
  const [name, setName] = useState(selectedObject?.name ?? "");
  const [description, setDescription] = useState(
    selectedObject?.description ?? "",
  );
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");

  useEffect(() => {
    setName(selectedObject?.name ?? "");
    setDescription(selectedObject?.description ?? "");
    if (!selectedObject) {
      setShowDetails(false);
    }
  }, [selectedObject]);

  return (
    <div className="causcape-engineering-tools">
      <div
        className="causcape-engineering-tools__buttons"
        role="toolbar"
        aria-label="Engineering canvas tools"
      >
        {flowPanel ? (
          <button
            type="button"
            className={`causcape-engineering-tools__tool causcape-engineering-tools__tool--flow${
              hasDataFlows ? " causcape-engineering-tools__tool--has-flows" : ""
            }${
              isFlowPlaying ? " causcape-engineering-tools__tool--playing" : ""
            }`}
            aria-label="Data flow player"
            aria-expanded={showFlowPlayer}
            aria-controls="causcape-data-flow-player"
            data-tooltip="Data flow player"
            title="Data flow player"
            onClick={() => {
              setShowFlowPlayer((shown) => !shown);
              setShowShapes(false);
              setShowDetails(false);
            }}
          >
            {playerPlayIcon}
          </button>
        ) : null}
        <button
          type="button"
          className="causcape-engineering-tools__tool"
          aria-label="Engineering shapes"
          aria-expanded={showShapes}
          aria-controls="causcape-engineering-shapes"
          data-tooltip="Engineering shapes"
          title="Engineering shapes"
          onClick={() => {
            setShowShapes((shown) => !shown);
            setShowDetails(false);
            setShowFlowPlayer(false);
          }}
        >
          {drawShapeToolIcon}
        </button>
        <button
          type="button"
          className={`causcape-engineering-tools__tool causcape-engineering-tools__tool--details${
            selectedObject
              ? " causcape-engineering-tools__tool--has-selection"
              : ""
          }`}
          disabled={!selectedObject}
          aria-label="Object details"
          aria-expanded={showDetails}
          aria-controls="causcape-object-details"
          data-tooltip={
            selectedObject
              ? "Object details"
              : "Select an object to view details"
          }
          title={
            selectedObject
              ? "Object details"
              : "Select an object to view details"
          }
          onClick={() => {
            setShowDetails((shown) => !shown);
            setShowShapes(false);
            setShowFlowPlayer(false);
          }}
        >
          {adjustmentsIcon}
        </button>
      </div>

      {showFlowPlayer && flowPanel ? (
        <aside
          id="causcape-data-flow-player"
          className="causcape-engineering-tools__popover causcape-engineering-tools__flow-player"
          aria-label="Data flow player setup"
        >
          {flowPanel}
        </aside>
      ) : null}

      {showShapes ? (
        <div
          id="causcape-engineering-shapes"
          className="causcape-engineering-tools__popover causcape-engineering-tools__palette"
          aria-label="Prepared engineering shapes"
        >
          <header className="causcape-engineering-tools__palette-header">
            <strong>Engineering library</strong>
            <span>Place a component or describe a flow</span>
          </header>
          {SHAPE_GROUPS.map((group) => (
            <section
              className="causcape-engineering-tools__palette-group"
              key={group.id}
            >
              <h3>{group.label}</h3>
              <div>
                {PREPARED_ENGINEERING_SHAPES.filter(
                  (shape) => shape.category === group.id,
                ).map((shape) => (
                  <button
                    type="button"
                    key={shape.kind}
                    aria-label={shape.label}
                    onClick={() => {
                      onAddShape(shape.kind);
                      setShowShapes(false);
                    }}
                  >
                    <span
                      className={`causcape-engineering-tools__swatch causcape-engineering-tools__swatch--${shape.elementType} causcape-engineering-tools__swatch--${shape.kind}`}
                      style={{
                        borderColor: shape.strokeColor,
                        background: shape.backgroundColor,
                      }}
                      aria-hidden="true"
                    />
                    <span className="causcape-engineering-tools__shape-copy">
                      <strong>{shape.label}</strong>
                      <span>{shape.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {showDetails && selectedObject ? (
        <aside
          id="causcape-object-details"
          className="causcape-engineering-tools__popover causcape-engineering-tools__details"
          aria-label="Selected object details"
        >
          <header>
            <div>
              <strong>Canvas object</strong>
              <code>{selectedObject.id}</code>
            </div>
            <button
              type="button"
              aria-label="Close object details"
              onClick={() => setShowDetails(false)}
            >
              ×
            </button>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                onRename(selectedObject.id, name.trim());
              }
            }}
          >
            <label>
              Name
              <input
                aria-label="Object name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit">Save name</button>
          </form>

          <form
            className="causcape-engineering-tools__description-form"
            onSubmit={(event) => {
              event.preventDefault();
              onDescriptionChange(selectedObject.id, description.trim());
            }}
          >
            <label>
              Description
              <textarea
                aria-label="Object description"
                rows={4}
                placeholder="Explain what this component owns, why it exists, or how it behaves."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <button type="submit" aria-label="Save description">
              Save description
            </button>
          </form>

          <div className="causcape-engineering-tools__metadata">
            <strong>Metadata</strong>
            {Object.entries(selectedObject.metadata).map(([key, value]) => (
              <div key={key}>
                <span>
                  <code>{key}</code>
                  {metadataValueLabel(value)}
                </span>
                {key !== "kind" ? (
                  <button
                    type="button"
                    aria-label={`Delete ${key} metadata`}
                    onClick={() => onMetadataDelete(selectedObject.id, key)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <form
            className="causcape-engineering-tools__metadata-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (metadataKey.trim() && metadataValue.trim()) {
                onMetadataSet(
                  selectedObject.id,
                  metadataKey.trim(),
                  metadataValue.trim(),
                );
                setMetadataKey("");
                setMetadataValue("");
              }
            }}
          >
            <input
              aria-label="Metadata key"
              placeholder="Key"
              value={metadataKey}
              onChange={(event) => setMetadataKey(event.target.value)}
            />
            <input
              aria-label="Metadata value"
              placeholder="Value"
              value={metadataValue}
              onChange={(event) => setMetadataValue(event.target.value)}
            />
            <button type="submit">Add metadata</button>
          </form>
        </aside>
      ) : null}
    </div>
  );
};

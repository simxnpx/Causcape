import { useEffect, useState } from "react";

import {
  PREPARED_ENGINEERING_SHAPES,
  type PreparedEngineeringShapeKind,
} from "../data/causcapeCanvasObjects";

import "./CauscapeEngineeringTools.scss";

import type { CanvasObject, MetadataValue } from "@causcape/core";

type CauscapeEngineeringToolsProps = {
  selectedObject: CanvasObject | null;
  onAddShape: (kind: PreparedEngineeringShapeKind) => void;
  onRename: (objectId: string, name: string) => void;
  onMetadataSet: (objectId: string, key: string, value: MetadataValue) => void;
  onMetadataDelete: (objectId: string, key: string) => void;
};

const metadataValueLabel = (value: MetadataValue) =>
  typeof value === "object" ? value.value : String(value);

export const CauscapeEngineeringTools = ({
  selectedObject,
  onAddShape,
  onRename,
  onMetadataSet,
  onMetadataDelete,
}: CauscapeEngineeringToolsProps) => {
  const [showShapes, setShowShapes] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [name, setName] = useState(selectedObject?.name ?? "");
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");

  useEffect(() => {
    setName(selectedObject?.name ?? "");
    if (!selectedObject) {
      setShowDetails(false);
    }
  }, [selectedObject]);

  return (
    <div className="causcape-engineering-tools">
      <div className="causcape-engineering-tools__buttons">
        <button type="button" onClick={() => setShowShapes((shown) => !shown)}>
          Engineering shapes
        </button>
        <button
          type="button"
          disabled={!selectedObject}
          onClick={() => setShowDetails((shown) => !shown)}
          aria-label="Object details"
        >
          Details
        </button>
      </div>

      {showShapes ? (
        <div
          className="causcape-engineering-tools__popover causcape-engineering-tools__palette"
          aria-label="Prepared engineering shapes"
        >
          {PREPARED_ENGINEERING_SHAPES.map((shape) => (
            <button
              type="button"
              key={shape.kind}
              onClick={() => {
                onAddShape(shape.kind);
                setShowShapes(false);
              }}
            >
              <span
                className="causcape-engineering-tools__swatch"
                style={{
                  borderColor: shape.strokeColor,
                  background: shape.backgroundColor,
                }}
                aria-hidden="true"
              />
              {shape.label}
            </button>
          ))}
        </div>
      ) : null}

      {showDetails && selectedObject ? (
        <aside
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

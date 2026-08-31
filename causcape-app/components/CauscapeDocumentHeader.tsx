import { eyeIcon, pencilIcon } from "@causcape/causcape/components/icons";

type CauscapeDocumentHeaderProps = {
  editable: boolean;
  onEditableChange: (editable: boolean) => void;
};

export const CauscapeDocumentHeader = ({
  editable,
  onEditableChange,
}: CauscapeDocumentHeaderProps) => (
  <header className="causcape-document-header">
    <p className="causcape-document-eyebrow">Project document</p>
    <div
      className="causcape-document-mode-selector"
      role="group"
      aria-label="Document mode"
    >
      <span className="causcape-document-mode-label" aria-hidden="true">
        Mode
      </span>
      <button
        type="button"
        className="causcape-document-mode-option"
        aria-label="Read document"
        aria-pressed={!editable}
        title="Read document"
        onClick={() => onEditableChange(false)}
      >
        {eyeIcon}
        <span>Read</span>
      </button>
      <button
        type="button"
        className="causcape-document-mode-option"
        aria-label="Edit document"
        aria-pressed={editable}
        title="Edit document"
        onClick={() => onEditableChange(true)}
      >
        {pencilIcon}
        <span>Edit</span>
      </button>
    </div>
  </header>
);

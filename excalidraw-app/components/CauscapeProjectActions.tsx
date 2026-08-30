import { useEffect, useRef, useState } from "react";

import { ExportIcon, LoadIcon } from "@excalidraw/excalidraw/components/icons";

import "./CauscapeProjectActions.scss";

type CauscapeProjectActionsProps = {
  onOpenProjects: () => void;
  onExport: () => void;
};

export const CauscapeProjectActions = ({
  onOpenProjects,
  onExport,
}: CauscapeProjectActionsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const ownerDocument = rootRef.current?.ownerDocument;
    if (!ownerDocument) {
      return;
    }
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    ownerDocument.addEventListener("pointerdown", closeFromOutside);
    ownerDocument.addEventListener("keydown", closeFromKeyboard);
    return () => {
      ownerDocument.removeEventListener("pointerdown", closeFromOutside);
      ownerDocument.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [isOpen]);

  const runAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <nav
      ref={rootRef}
      className="causcape-project-actions"
      aria-label="Project"
    >
      <button
        ref={triggerRef}
        type="button"
        className="causcape-project-actions__trigger"
        aria-label="Project actions"
        aria-expanded={isOpen}
        aria-controls="causcape-project-actions-menu"
        title="Project actions"
        onClick={() => setIsOpen((open) => !open)}
      >
        {LoadIcon}
      </button>

      {isOpen ? (
        <div
          id="causcape-project-actions-menu"
          className="causcape-project-actions__menu"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenProjects)}
          >
            {LoadIcon}
            <span>All projects</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onExport)}
          >
            {ExportIcon}
            <span>Export project</span>
          </button>
        </div>
      ) : null}
    </nav>
  );
};

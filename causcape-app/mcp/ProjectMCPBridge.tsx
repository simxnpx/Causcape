import { useEffect, useRef } from "react";

import {
  createProjectMCPHandlers,
  registerProjectMCP,
  type ProjectMCPContext,
} from "./projectMCP";

type ProjectMCPBridgeProps = ProjectMCPContext & {
  getOwnerDocument: () => Document | null;
};

/** Registers document tools against the window that owns the project shell. */
export const ProjectMCPBridge = ({
  getProject,
  setProject,
  getOwnerDocument,
}: ProjectMCPBridgeProps) => {
  const contextRef = useRef({ getProject, setProject });
  contextRef.current = { getProject, setProject };
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) {
      return;
    }
    const ownerDocument = getOwnerDocument();
    if (!ownerDocument) {
      return;
    }
    const handlers = createProjectMCPHandlers({
      getProject: () => contextRef.current.getProject(),
      setProject: (project) => contextRef.current.setProject(project),
    });
    registerProjectMCP(handlers, ownerDocument);
    registeredRef.current = true;
  }, [getOwnerDocument]);

  return null;
};

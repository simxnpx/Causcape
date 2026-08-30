import { useEffect, useRef } from "react";

import { useCauscapeAPI } from "@causcape/causcape";

import { createGraphMCPHandlers, registerGraphMCP } from "./graphMCP";

/**
 * Mounts once per Causcape instance and registers Causcape graph tools
 * via WebMCP (if available) and window.CauscapeMCP for agents.
 * No UI — just wiring.
 * Derives ownerDocument via api when available to satisfy AGENTS.md rule.
 */
export const GraphMCPBridge = () => {
  const api = useCauscapeAPI();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!api) {
      return;
    }
    // Expose api for e2e agents — use ownerWindow when possible
    try {
      const maybeApp = api as unknown as {
        app?: {
          ownerDocument?: Document;
          ownerWindow?: Window & typeof globalThis;
        };
        ownerWindow?: Window & typeof globalThis;
      };
      const ownerWindow =
        maybeApp.app?.ownerWindow ??
        maybeApp.ownerWindow ??
        maybeApp.app?.ownerDocument?.defaultView ??
        null;
      if (ownerWindow) {
        (ownerWindow as unknown as Record<string, unknown>).causcapeAPI = api;
      }
    } catch {
      // The API may be hosted by a document without an exposed owner window.
      // In that case, leave the debug hook unset rather than leaking it onto
      // this realm's global object.
    }
    if (registeredRef.current) {
      return;
    }
    const getOwnerDocument = (): Document | null => {
      try {
        const maybeApp = api as unknown as {
          app?: { ownerDocument?: Document };
          causcapeContainerRef?: {
            current?: { ownerDocument?: Document } | null;
          };
        };
        const d =
          maybeApp.app?.ownerDocument ??
          maybeApp.causcapeContainerRef?.current?.ownerDocument ??
          null;
        return d ?? null;
      } catch {
        return null;
      }
    };
    const handlers = createGraphMCPHandlers({
      getApi: () => api,
      getOwnerDocument,
    });
    registerGraphMCP(handlers, getOwnerDocument());
    registeredRef.current = true;
  }, [api]);

  return null;
};

import { useEffect, useRef } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";

import { createGraphMCPHandlers, registerGraphMCP } from "./graphMCP";

/**
 * Mounts once per Excalidraw instance and registers Causcape graph tools
 * via WebMCP (if available) and window.CauscapeMCP for agents.
 * No UI — just wiring.
 * Derives ownerDocument via api when available to satisfy AGENTS.md rule.
 */
export const GraphMCPBridge = () => {
  const api = useExcalidrawAPI();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!api) {
      return;
    }
    // Expose api for e2e agents — use ownerWindow when possible
    try {
      const maybeApp = api as unknown as {
        app?: { ownerWindow?: Window & typeof globalThis };
        ownerWindow?: Window & typeof globalThis;
      };
      const ownerWindow =
        maybeApp.app?.ownerWindow ??
        maybeApp.ownerWindow ??
        (typeof window !== "undefined" ? (window as unknown as Window & typeof globalThis) : null);
      if (ownerWindow) {
        (ownerWindow as unknown as Record<string, unknown>).excalidrawAPI = api;
      } else {
        (globalThis as unknown as Record<string, unknown>).excalidrawAPI = api;
      }
    } catch {
      (globalThis as unknown as Record<string, unknown>).excalidrawAPI = api;
    }
    if (registeredRef.current) {
      return;
    }
    const getOwnerDocument = (): Document | null => {
      try {
        const maybeApp = api as unknown as {
          app?: { ownerDocument?: Document };
          excalidrawContainerRef?: { current?: { ownerDocument?: Document } | null };
        };
        const d =
          maybeApp.app?.ownerDocument ??
          maybeApp.excalidrawContainerRef?.current?.ownerDocument ??
          (typeof document !== "undefined" ? (document as unknown as Document) : null);
        return d ?? null;
      } catch {
        return null;
      }
    };
    const handlers = createGraphMCPHandlers({
      getApi: () => api,
      getOwnerDocument,
    });
    registerGraphMCP(handlers);
    registeredRef.current = true;
  }, [api]);

  return null;
};

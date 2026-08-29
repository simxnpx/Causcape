/**
 * Memory-only GitHub token store.
 * - Never persists to localStorage / sessionStorage / IndexedDB.
 * - Token lives only in module-level memory; lost on reload.
 * - Optional expiresAt (epoch ms or ISO string).
 * - Debug exposure via ownerWindow.__CAUSCAPE_GITHUB_TOKEN (memory only).
 */

let _token: string | undefined;
let _expiresAt: number | undefined;

const toEpochMs = (expiresAt?: number | string): number | undefined => {
  if (expiresAt === undefined || expiresAt === null) {
    return undefined;
  }
  if (typeof expiresAt === "number") {
    return Number.isFinite(expiresAt) ? expiresAt : undefined;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const getOwnerWindowForDebug = (): (Window & typeof globalThis) | null => {
  try {
    // Prefer ownerDocument.defaultView when available (AGENTS.md rule).
    // Derive from global document if present; fallback to globalThis window.
    const doc =
      typeof document !== "undefined" ? (document as unknown as Document) : null;
    const fromDoc = doc?.defaultView as (Window & typeof globalThis) | null | undefined;
    if (fromDoc) {
      return fromDoc;
    }
    const g = globalThis as unknown as { window?: Window & typeof globalThis };
    if (g.window) {
      return g.window;
    }
    if (typeof window !== "undefined") {
      return window as unknown as Window & typeof globalThis;
    }
  } catch {
    // ignore
  }
  return null;
};

const syncDebugWindow = (token: string | undefined): void => {
  try {
    const w = getOwnerWindowForDebug();
    if (!w) {
      return;
    }
    const key = "__CAUSCAPE_GITHUB_TOKEN" as const;
    if (token) {
      (w as unknown as Record<string, unknown>)[key] = token;
    } else {
      delete (w as unknown as Record<string, unknown>)[key];
    }
  } catch {
    // ignore debug sync failure
  }
};

export const setGithubToken = (opts: {
  token: string;
  expiresAt?: number | string;
}): void => {
  const raw = opts.token;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("setGithubToken: token must be a non-empty string");
  }
  const token = raw.trim();
  // Basic sanity: GitHub PATs are ~40+ chars, but allow shorter for tests.
  if (token.length < 4) {
    throw new Error("setGithubToken: token too short");
  }
  // Never persist — memory only.
  _token = token;
  _expiresAt = toEpochMs(opts.expiresAt);
  syncDebugWindow(_token);
};

export const getGithubToken = (): string | undefined => {
  if (_token === undefined) {
    return undefined;
  }
  if (_expiresAt !== undefined && Date.now() > _expiresAt) {
    _token = undefined;
    _expiresAt = undefined;
    syncDebugWindow(undefined);
    return undefined;
  }
  return _token;
};

export const clearGithubToken = (): void => {
  _token = undefined;
  _expiresAt = undefined;
  syncDebugWindow(undefined);
};

export const getGithubTokenExpiry = (): number | undefined => _expiresAt;
/**
 * Test seam: reset in-memory state without touching storage.
 */
export const __resetTokenStoreForTests = (): void => {
  _token = undefined;
  _expiresAt = undefined;
  syncDebugWindow(undefined);
};

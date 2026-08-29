import type { GithubCache, GithubCacheRecord, GithubRef } from "./types";
import { githubCacheKey } from "./types";

const DB_NAME = "github-cache-v1";
const STORE_NAME = "github-cache";
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// IndexedDB helpers — use app.ownerDocument.defaultView.indexedDB when
// available, fallback to memory Map otherwise.
// ---------------------------------------------------------------------------

const memoryFallback = new Map<string, GithubCacheRecord>();

/**
 * In-memory mirror for sync reads. Populated on every get/set that hits
 * IndexedDB so `getCachedGithubData` can be synchronous for render paths.
 */
const syncMirror = new Map<string, GithubCache>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

const getIDBFactory = (ownerDocument?: Document | null): IDBFactory | null => {
  try {
    const fromOwner = ownerDocument?.defaultView?.indexedDB;
    if (fromOwner) {
      return fromOwner;
    }
    const doc =
      typeof document !== "undefined" ? (document as unknown as Document) : null;
    const fromDoc = doc?.defaultView?.indexedDB;
    if (fromDoc) {
      return fromDoc;
    }
    const g = globalThis as unknown as { indexedDB?: IDBFactory };
    if (g.indexedDB) {
      return g.indexedDB;
    }
  } catch {
    // ignore
  }
  return null;
};

const openDB = (ownerDocument?: Document | null): Promise<IDBDatabase | null> => {
  if (dbPromise) {
    return dbPromise;
  }
  const factory = getIDBFactory(ownerDocument ?? null);
  if (!factory) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
};

const idbGet = async (
  db: IDBDatabase,
  key: string,
): Promise<GithubCacheRecord | undefined> =>
  new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const v = req.result as GithubCacheRecord | undefined;
        resolve(v);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });

const idbSet = async (
  db: IDBDatabase,
  key: string,
  value: GithubCacheRecord,
): Promise<void> =>
  new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });

// ---------------------------------------------------------------------------
// Public store
// ---------------------------------------------------------------------------

export class GithubCacheStore {
  private readonly ownerDocument: Document | null;

  constructor(ownerDocument?: Document | null) {
    // Boring explicit: caller may pass app.ownerDocument; we keep a ref.
    this.ownerDocument = ownerDocument ?? null;
  }

  async get(key: string): Promise<GithubCacheRecord | undefined> {
    const normalized = key.toLowerCase();
    // Prefer memory fallback fast path when IDB unavailable.
    const db = await openDB(this.ownerDocument);
    if (!db) {
      return memoryFallback.get(normalized);
    }
    const record = await idbGet(db, normalized);
    if (record) {
      memoryFallback.set(normalized, record);
      syncMirror.set(normalized, record.data);
    }
    return record;
  }

  async getByRef(ref: GithubRef): Promise<GithubCacheRecord | undefined> {
    return this.get(githubCacheKey(ref));
  }

  async set(key: string, value: GithubCacheRecord): Promise<void> {
    const normalized = key.toLowerCase();
    // Keep sync mirrors updated immediately.
    memoryFallback.set(normalized, value);
    syncMirror.set(normalized, value.data);

    const db = await openDB(this.ownerDocument);
    if (!db) {
      return;
    }
    await idbSet(db, normalized, value);
  }

  async setByRef(ref: GithubRef, value: GithubCacheRecord): Promise<void> {
    await this.set(githubCacheKey(ref), value);
  }

  /**
   * Hydrate syncMirror from IndexedDB for already persisted entries.
   * Best-effort; callers may await before relying on sync reads after reload.
   */
  async hydrate(): Promise<void> {
    const db = await openDB(this.ownerDocument);
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result as IDBCursorWithValue | null;
          if (!cursor) {
            resolve();
            return;
          }
          const k = String(cursor.key).toLowerCase();
          const v = cursor.value as GithubCacheRecord;
          if (v && typeof v.fetchedAt === "number" && v.data) {
            memoryFallback.set(k, v);
            syncMirror.set(k, v.data);
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const defaultGithubCacheStore = new GithubCacheStore();

// ---------------------------------------------------------------------------
// Sync helper for render paths — never hits IndexedDB, only the in-memory
// mirror populated via get/set/hydrate.
// ---------------------------------------------------------------------------

export const getCachedGithubData = (
  keyOrRef: string | GithubRef,
): GithubCache | undefined => {
  const key =
    typeof keyOrRef === "string" ? keyOrRef.toLowerCase() : githubCacheKey(keyOrRef);
  const fromMirror = syncMirror.get(key);
  if (fromMirror) {
    return fromMirror;
  }
  const fromFallback = memoryFallback.get(key);
  if (fromFallback) {
    return fromFallback.data;
  }
  return undefined;
};

/**
 * Test seam: clear in-memory state and reset dbPromise so tests can
 * re-open with a fresh factory. Not used in production.
 */
export const __resetGithubCacheForTests = (): void => {
  memoryFallback.clear();
  syncMirror.clear();
  if (dbPromise) {
    void dbPromise.then((db) => {
      try {
        db?.close();
      } catch {
        // ignore
      }
    });
  }
  dbPromise = null;
};

// For callers that already hold a store instance.
export const getCachedGithubDataFromStore = getCachedGithubData;

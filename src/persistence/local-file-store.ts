/**
 * IndexedDB store for the user's locally-saved working file.
 *
 * Stores the current file as a Uint8Array (the raw .mvt zip bytes) under a
 * single well-known key so it can be loaded on the next page visit.
 *
 * Follows the same two-tier (memory + IDB) pattern used by PluginBinaryStore
 * and FontBinaryStore so graceful fallback to memory-only is guaranteed when
 * IndexedDB is unavailable.
 */

const DB_NAME = 'mvmnt-local-files';
const STORE_NAME = 'files';
const CURRENT_FILE_KEY = 'current';

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryCache: Uint8Array | null = null;

function getIndexedDB(): IDBFactory | null {
    try {
        const idb = (globalThis as any)?.indexedDB;
        if (idb && typeof idb.open === 'function') {
            return idb as IDBFactory;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function openDatabase(): Promise<IDBDatabase> {
    if (!dbPromise) {
        const idb = getIndexedDB();
        if (!idb) {
            dbPromise = Promise.reject(new Error('IndexedDB unavailable')) as Promise<IDBDatabase>;
        } else {
            dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
                const request = idb.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onerror = () => reject(request.error ?? new Error('Failed to open local-file store'));
                request.onsuccess = () => resolve(request.result);
            }).catch((err) => {
                dbPromise = null;
                throw err;
            }) as Promise<IDBDatabase>;
        }
    }
    return dbPromise!;
}

async function runTransaction<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await fn(store);
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('LocalFileStore transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('LocalFileStore transaction aborted'));
    });
    return result;
}

export const LocalFileStore = {
    /** Persist the current file bytes. Overwrites any previous save. */
    async save(data: Uint8Array): Promise<void> {
        // Clone to own the buffer
        const copy = new Uint8Array(data);
        memoryCache = copy;
        const idb = getIndexedDB();
        if (!idb) return;
        try {
            await runTransaction('readwrite', (store) => {
                store.put(copy.buffer, CURRENT_FILE_KEY);
            });
        } catch {
            /* ignore – already cached in memory */
        }
    },

    /** Load the previously saved file bytes, or null if none exists. */
    async load(): Promise<Uint8Array | null> {
        if (memoryCache) {
            return new Uint8Array(memoryCache);
        }
        const idb = getIndexedDB();
        if (!idb) return null;
        try {
            const result = await runTransaction('readonly', (store) => {
                return new Promise<Uint8Array | null>((resolve, reject) => {
                    const request = store.get(CURRENT_FILE_KEY);
                    request.onerror = () =>
                        reject(request.error ?? new Error('LocalFileStore.load failed'));
                    request.onsuccess = () => {
                        const value = request.result;
                        if (!value) {
                            resolve(null);
                        } else if (value instanceof ArrayBuffer) {
                            resolve(new Uint8Array(value));
                        } else if (ArrayBuffer.isView(value)) {
                            resolve(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
                        } else {
                            resolve(null);
                        }
                    };
                });
            });
            if (result) memoryCache = result;
            return result;
        } catch {
            return null;
        }
    },

    /** Check whether a saved file exists without loading it. */
    async exists(): Promise<boolean> {
        if (memoryCache) return true;
        const idb = getIndexedDB();
        if (!idb) return false;
        try {
            return await runTransaction('readonly', (store) => {
                return new Promise<boolean>((resolve, reject) => {
                    const request = store.count(CURRENT_FILE_KEY);
                    request.onerror = () =>
                        reject(request.error ?? new Error('LocalFileStore.exists failed'));
                    request.onsuccess = () => resolve(request.result > 0);
                });
            });
        } catch {
            return false;
        }
    },

    /** Remove the saved file from IndexedDB and the memory cache. */
    async clear(): Promise<void> {
        memoryCache = null;
        const idb = getIndexedDB();
        if (!idb) return;
        try {
            await runTransaction('readwrite', (store) => {
                store.delete(CURRENT_FILE_KEY);
            });
        } catch {
            /* ignore */
        }
    },
};

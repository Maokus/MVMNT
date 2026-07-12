/**
 * IndexedDB store for the user's locally-saved working file.
 *
 * Stores the current file as a Uint8Array (the raw .mvt zip bytes) under a
 * single well-known key so it can be loaded on the next page visit.
 *
 * Uses a memory fallback only when IndexedDB is unavailable. If IndexedDB is
 * present but the durable write fails, callers must surface that failure
 * because the save will not survive a page reload.
 */

const DB_NAME = 'mvmnt-local-files';
const STORE_NAME = 'files';
const CURRENT_FILE_KEY = 'current';
const CURRENT_FILE_SAVED_AT_KEY = 'current:savedAt';
const CURRENT_FILE_META_KEY = 'current:meta';
const CURRENT_FILE_CHUNK_PREFIX = 'current:chunk:';
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

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
                const request = idb.open(DB_NAME, 2);
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

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onerror = () => reject(request.error ?? new Error('LocalFileStore request failed'));
        request.onsuccess = () => resolve(request.result);
    });
}

function chunkKey(index: number): string {
    return `${CURRENT_FILE_CHUNK_PREFIX}${index}`;
}

function cloneBytes(data: Uint8Array): Uint8Array {
    return new Uint8Array(data);
}

function toStoredBuffer(data: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return buffer;
}

async function deleteCurrentChunks(store: IDBObjectStore): Promise<void> {
    const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
    for (const key of keys) {
        if (typeof key === 'string' && key.startsWith(CURRENT_FILE_CHUNK_PREFIX)) {
            store.delete(key);
        }
    }
}

function readBytesFromStoredValue(value: unknown): Uint8Array | null {
    if (!value) {
        return null;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
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
        const copy = cloneBytes(data);
        const idb = getIndexedDB();
        if (!idb) {
            memoryCache = copy;
            return;
        }
        try {
            await runTransaction('readwrite', async (store) => {
                await deleteCurrentChunks(store);
                store.delete(CURRENT_FILE_KEY);
                const chunkCount = Math.max(1, Math.ceil(copy.byteLength / CHUNK_SIZE_BYTES));
                for (let index = 0; index < chunkCount; index++) {
                    const start = index * CHUNK_SIZE_BYTES;
                    const end = Math.min(copy.byteLength, start + CHUNK_SIZE_BYTES);
                    store.put(toStoredBuffer(copy.subarray(start, end)), chunkKey(index));
                }
                const savedAt = Date.now();
                store.put(
                    {
                        version: 2,
                        byteLength: copy.byteLength,
                        chunkSize: CHUNK_SIZE_BYTES,
                        chunkCount,
                        savedAt,
                    },
                    CURRENT_FILE_META_KEY
                );
                store.put(savedAt, CURRENT_FILE_SAVED_AT_KEY);
            });
            memoryCache = null;
        } catch (error) {
            memoryCache = copy;
            throw error;
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
                    const metaRequest = store.get(CURRENT_FILE_META_KEY);
                    metaRequest.onerror = () =>
                        reject(metaRequest.error ?? new Error('LocalFileStore.load metadata failed'));
                    metaRequest.onsuccess = async () => {
                        const meta = metaRequest.result as
                            | { byteLength?: number; chunkCount?: number }
                            | undefined;
                        if (meta && typeof meta.byteLength === 'number' && typeof meta.chunkCount === 'number') {
                            try {
                                const bytes = new Uint8Array(meta.byteLength);
                                let offset = 0;
                                for (let index = 0; index < meta.chunkCount; index++) {
                                    const chunk = readBytesFromStoredValue(await requestToPromise(store.get(chunkKey(index))));
                                    if (!chunk) {
                                        resolve(null);
                                        return;
                                    }
                                    bytes.set(chunk, offset);
                                    offset += chunk.byteLength;
                                }
                                resolve(bytes);
                            } catch (error) {
                                reject(error);
                            }
                            return;
                        }
                        const request = store.get(CURRENT_FILE_KEY);
                        request.onerror = () =>
                            reject(request.error ?? new Error('LocalFileStore.load failed'));
                        request.onsuccess = () => resolve(readBytesFromStoredValue(request.result));
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
                    const request = store.count(CURRENT_FILE_META_KEY);
                    request.onerror = () =>
                        reject(request.error ?? new Error('LocalFileStore.exists failed'));
                    request.onsuccess = () => {
                        if (request.result > 0) {
                            resolve(true);
                            return;
                        }
                        const legacyRequest = store.count(CURRENT_FILE_KEY);
                        legacyRequest.onerror = () =>
                            reject(legacyRequest.error ?? new Error('LocalFileStore.exists failed'));
                        legacyRequest.onsuccess = () => resolve(legacyRequest.result > 0);
                    };
                });
            });
        } catch {
            return false;
        }
    },

    async savedAt(): Promise<number | null> {
        const idb = getIndexedDB();
        if (!idb) return memoryCache ? Date.now() : null;
        try {
            return await runTransaction('readonly', (store) => {
                return new Promise<number | null>((resolve, reject) => {
                    const request = store.get(CURRENT_FILE_SAVED_AT_KEY);
                    request.onerror = () =>
                        reject(request.error ?? new Error('LocalFileStore.savedAt failed'));
                    request.onsuccess = () => {
                        const value = request.result;
                        resolve(typeof value === 'number' ? value : null);
                    };
                });
            });
        } catch {
            return null;
        }
    },

    /** Remove the saved file from IndexedDB and the memory cache. */
    async clear(): Promise<void> {
        memoryCache = null;
        const idb = getIndexedDB();
        if (!idb) return;
        try {
            await runTransaction('readwrite', async (store) => {
                await deleteCurrentChunks(store);
                store.delete(CURRENT_FILE_KEY);
                store.delete(CURRENT_FILE_SAVED_AT_KEY);
                store.delete(CURRENT_FILE_META_KEY);
            });
        } catch {
            /* ignore */
        }
    },
};

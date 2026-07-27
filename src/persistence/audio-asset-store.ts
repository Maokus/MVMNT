const DB_NAME = 'mvmnt-audio-assets';
const STORE_NAME = 'audio-assets';

interface IndexedDbLike {
    open(name: string, version?: number): IDBOpenDBRequest;
}

export type AudioAssetStorageKind = 'indexeddb' | 'memory';

const memoryCache = new Map<string, ArrayBuffer>();
let dbPromise: Promise<IDBDatabase> | null = null;

function isArrayBuffer(data: unknown): data is ArrayBuffer {
    return Object.prototype.toString.call(data) === '[object ArrayBuffer]';
}

function getIndexedDB(): IndexedDbLike | null {
    try {
        const indexedDB = (globalThis as any)?.indexedDB;
        if (indexedDB && typeof indexedDB.open === 'function') {
            return indexedDB as IndexedDbLike;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function openDatabase(): Promise<IDBDatabase> {
    if (!dbPromise) {
        const indexedDB = getIndexedDB();
        if (!indexedDB) {
            dbPromise = Promise.reject(new Error('indexedDB unavailable')) as Promise<IDBDatabase>;
        } else {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onerror = () => reject(request.error ?? new Error('Failed to open audio asset store'));
                request.onsuccess = () => resolve(request.result);
            }).catch((error) => {
                dbPromise = null;
                throw error;
            }) as Promise<IDBDatabase>;
        }
    }
    return dbPromise;
}

async function runTransaction<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await fn(store);
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Audio asset store transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Audio asset store transaction aborted'));
    });
    return result;
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    let source: Uint8Array;
    if (isArrayBuffer(data)) {
        source = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
        source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
        throw new Error('Unsupported audio asset payload');
    }
    const clone = new Uint8Array(source.byteLength);
    clone.set(source);
    return clone.buffer;
}

export function createAudioAssetId(prefix = 'audio'): string {
    const random =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`;
}

export const AudioAssetStore = {
    async put(id: string, data: ArrayBuffer | ArrayBufferView): Promise<AudioAssetStorageKind> {
        if (!id) throw new Error('AudioAssetStore.put: id is required');
        const buffer = toArrayBuffer(data);
        const indexedDB = getIndexedDB();
        if (indexedDB) {
            try {
                await runTransaction('readwrite', (store) => {
                    store.put(buffer, id);
                });
                memoryCache.delete(id);
                return 'indexeddb';
            } catch {
                /* fall through to memory */
            }
        }
        memoryCache.set(id, buffer.slice(0));
        return 'memory';
    },

    async get(id: string): Promise<ArrayBuffer | undefined> {
        if (!id) return undefined;
        const cached = memoryCache.get(id);
        if (cached) {
            return cached.slice(0);
        }
        if (!getIndexedDB()) {
            return undefined;
        }
        try {
            return await runTransaction('readonly', (store) => {
                return new Promise<ArrayBuffer | undefined>((resolve, reject) => {
                    const request = store.get(id);
                    request.onerror = () => reject(request.error ?? new Error('AudioAssetStore.get failed'));
                    request.onsuccess = () => {
                        const value = request.result;
                        if (value instanceof ArrayBuffer) {
                            resolve(value.slice(0));
                        } else if (value && typeof Blob !== 'undefined' && value instanceof Blob) {
                            value
                                .arrayBuffer()
                                .then((buffer) => resolve(buffer))
                                .catch(reject);
                        } else if (value) {
                            resolve(toArrayBuffer(value));
                        } else {
                            resolve(undefined);
                        }
                    };
                });
            });
        } catch {
            return undefined;
        }
    },

    /**
     * Remove stored originals that are not referenced by the active scene.
     * Scene imports create new IDs for large audio payloads, so retaining old
     * records would otherwise make IndexedDB grow every time a project is
     * opened. This is best-effort: an unavailable store must not block import.
     */
    async removeUnreferenced(referencedAssetIds: Iterable<string>): Promise<number> {
        const referenced = new Set(referencedAssetIds);
        let removed = 0;

        for (const id of memoryCache.keys()) {
            if (!referenced.has(id)) {
                memoryCache.delete(id);
                removed++;
            }
        }

        if (!getIndexedDB()) return removed;
        try {
            const db = await openDatabase();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const cursorRequest = store.openCursor();
                cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Audio asset cleanup failed'));
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) return;
                    if (typeof cursor.key === 'string' && !referenced.has(cursor.key)) {
                        cursor.delete();
                        removed++;
                    }
                    cursor.continue();
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error ?? new Error('Audio asset cleanup transaction failed'));
                tx.onabort = () => reject(tx.error ?? new Error('Audio asset cleanup transaction aborted'));
            });
        } catch {
            // Imports remain usable when browser storage is unavailable.
        }
        return removed;
    },
};

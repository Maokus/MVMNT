const DB_NAME = 'mvmnt-plugins';
const STORE_NAME = 'plugins';

interface IndexedDbLike {
    open(name: string, version?: number): IDBOpenDBRequest;
}

const memoryCache = new Map<string, ArrayBuffer>();

function isArrayBuffer(data: unknown): data is ArrayBuffer {
    return Object.prototype.toString.call(data) === '[object ArrayBuffer]';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDB(): IndexedDbLike | null {
    try {
        const globalIndexedDb = (globalThis as any)?.indexedDB;
        if (globalIndexedDb && typeof globalIndexedDb.open === 'function') {
            return globalIndexedDb as IndexedDbLike;
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
                request.onerror = () => reject(request.error ?? new Error('Failed to open plugin store'));
                request.onsuccess = () => resolve(request.result);
            }).catch((error) => {
                dbPromise = null;
                throw error;
            }) as Promise<IDBDatabase>;
        }
    }
    return dbPromise!;
}

async function runTransaction<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
    try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = await fn(store);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Plugin store transaction failed'));
            tx.onabort = () => reject(tx.error ?? new Error('Plugin store transaction aborted'));
        });
        return result;
    } catch (error) {
        throw error;
    }
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    let source: Uint8Array;
    if (isArrayBuffer(data)) {
        source = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
        source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
        throw new Error('Unsupported plugin binary payload');
    }
    const clone = new Uint8Array(source.byteLength);
    clone.set(source);
    return clone.buffer;
}

export const PluginBinaryStore = {
    async put(id: string, data: ArrayBuffer | ArrayBufferView): Promise<void> {
        if (!id) throw new Error('PluginBinaryStore.put: id is required');
        const buffer = toArrayBuffer(data);
        memoryCache.set(id, buffer.slice(0));
        const indexedDB = getIndexedDB();
        if (!indexedDB) {
            return;
        }
        try {
            await runTransaction('readwrite', async (store) => {
                store.put(buffer, id);
            });
        } catch {
            /* ignore – we already cached the buffer in-memory */
        }
    },

    async get(id: string): Promise<ArrayBuffer | undefined> {
        if (!id) return undefined;
        const cached = memoryCache.get(id);
        if (cached) {
            return cached.slice(0);
        }
        const indexedDB = getIndexedDB();
        if (!indexedDB) {
            return undefined;
        }
        try {
            return await runTransaction('readonly', (store) => {
                return new Promise<ArrayBuffer | undefined>((resolve, reject) => {
                    const request = store.get(id);
                    request.onerror = () => reject(request.error ?? new Error('PluginBinaryStore.get failed'));
                    request.onsuccess = () => {
                        const value = request.result;
                        if (value instanceof ArrayBuffer) {
                            resolve(value.slice(0));
                        } else if (value && typeof Blob !== 'undefined' && value instanceof Blob) {
                            value.arrayBuffer().then((buf) => resolve(buf)).catch(reject);
                        } else if (value) {
                            resolve(toArrayBuffer(value));
                        } else {
                            resolve(undefined);
                        }
                    };
                });
            });
        } catch {
            return memoryCache.get(id)?.slice(0);
        }
    },

    async delete(id: string): Promise<void> {
        if (!id) return;
        memoryCache.delete(id);
        const indexedDB = getIndexedDB();
        if (!indexedDB) {
            return;
        }
        try {
            await runTransaction('readwrite', async (store) => {
                store.delete(id);
            });
        } catch {
            /* ignore */
        }
    },

    async clear(): Promise<void> {
        const indexedDB = getIndexedDB();
        memoryCache.clear();
        if (!indexedDB) return;
        try {
            await runTransaction('readwrite', async (store) => {
                store.clear();
            });
        } catch {
            /* ignore */
        }
    },

    async listIds(): Promise<string[]> {
        const indexedDB = getIndexedDB();
        if (!indexedDB) {
            return Array.from(memoryCache.keys());
        }
        try {
            return await runTransaction('readonly', (store) => {
                return new Promise<string[]>((resolve, reject) => {
                    const request = store.getAllKeys();
                    request.onerror = () => reject(request.error ?? new Error('PluginBinaryStore.listIds failed'));
                    request.onsuccess = () => {
                        const keys = request.result;
                        resolve(keys.map((k) => String(k)));
                    };
                });
            });
        } catch {
            return Array.from(memoryCache.keys());
        }
    },
};

export type PluginBinaryStoreType = typeof PluginBinaryStore;

const DB_NAME = 'mvmnt-autosave-versions';
const STORE_NAME = 'versions';
const DB_VERSION = 1;
const MAX_VERSIONS_PER_PROJECT = 12;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface AutosaveVersionSummary {
    id: string;
    projectId: string;
    documentName: string;
    savedAt: number;
    size: number;
}

interface AutosaveVersionRecord extends AutosaveVersionSummary {
    bytes: ArrayBuffer;
}

let databasePromise: Promise<IDBDatabase> | null = null;
const memoryVersions = new Map<string, AutosaveVersionRecord>();

function indexedDb(): IDBFactory | null {
    try {
        return globalThis.indexedDB ?? null;
    } catch {
        return null;
    }
}

function openDatabase(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;
    const factory = indexedDb();
    if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('projectId', 'projectId');
                store.createIndex('savedAt', 'savedAt');
            }
        };
        request.onerror = () => reject(request.error ?? new Error('Could not open autosave database'));
        request.onsuccess = () => resolve(request.result);
    }).catch((error) => {
        databasePromise = null;
        throw error;
    });
    return databasePromise!;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error ?? new Error('Autosave database request failed'));
    });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, mode);
    const result = await action(tx.objectStore(STORE_NAME));
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Autosave transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Autosave transaction aborted'));
    });
    return result;
}

function normalizeProjectId(name: string): string {
    return (
        name
            .trim()
            .toLocaleLowerCase()
            .replace(/\.mvt$/i, '')
            .replace(/[^a-z0-9_.-]+/g, '-') || 'untitled'
    );
}

function cloneRecord(record: AutosaveVersionRecord): AutosaveVersionRecord {
    return { ...record, bytes: record.bytes.slice(0) };
}

async function allRecords(): Promise<AutosaveVersionRecord[]> {
    if (!indexedDb()) return [...memoryVersions.values()].map(cloneRecord);
    return transaction('readonly', (store) => request(store.getAll() as IDBRequest<AutosaveVersionRecord[]>));
}

async function prune(records: AutosaveVersionRecord[]): Promise<void> {
    const cutoff = Date.now() - MAX_AGE_MS;
    const keep = new Set<string>();
    const grouped = new Map<string, AutosaveVersionRecord[]>();
    for (const record of records) {
        const values = grouped.get(record.projectId) ?? [];
        values.push(record);
        grouped.set(record.projectId, values);
    }
    for (const values of grouped.values()) {
        values.sort((a, b) => b.savedAt - a.savedAt);
        for (const record of values.slice(0, MAX_VERSIONS_PER_PROJECT)) {
            if (record.savedAt >= cutoff) keep.add(record.id);
        }
    }
    const removals = records.filter((record) => !keep.has(record.id));
    if (!indexedDb()) {
        for (const record of removals) memoryVersions.delete(record.id);
        return;
    }
    await transaction('readwrite', async (store) => {
        for (const record of removals) store.delete(record.id);
        return undefined;
    });
}

export const AutosaveVersionStore = {
    policy: { maxVersionsPerProject: MAX_VERSIONS_PER_PROJECT, maxAgeDays: 30 },

    async save(documentName: string, bytes: Uint8Array): Promise<AutosaveVersionSummary> {
        const projectId = normalizeProjectId(documentName);
        const records = await allRecords();
        const latest = records.filter((item) => item.projectId === projectId).sort((a, b) => b.savedAt - a.savedAt)[0];
        // Repeated recovery timers commonly serialize identical packages. Avoid
        // filling the browser quota with byte-for-byte duplicate versions.
        if (latest && latest.size === bytes.byteLength) {
            const current = new Uint8Array(latest.bytes);
            if (current.length === bytes.length && current.every((value, index) => value === bytes[index])) {
                return {
                    id: latest.id,
                    projectId,
                    documentName: latest.documentName,
                    savedAt: latest.savedAt,
                    size: latest.size,
                };
            }
        }
        const savedAt = Date.now();
        const record: AutosaveVersionRecord = {
            id: `${projectId}:${savedAt}:${crypto.randomUUID()}`,
            projectId,
            documentName: documentName.trim().replace(/\.mvt$/i, '') || 'Untitled',
            savedAt,
            size: bytes.byteLength,
            bytes: bytes.slice().buffer,
        };
        if (!indexedDb()) memoryVersions.set(record.id, cloneRecord(record));
        else
            await transaction('readwrite', async (store) => {
                store.put(record);
                return undefined;
            });
        await prune([...records, record]);
        return { id: record.id, projectId, documentName: record.documentName, savedAt, size: record.size };
    },

    async list(): Promise<AutosaveVersionSummary[]> {
        return (await allRecords())
            .sort((a, b) => b.savedAt - a.savedAt)
            .map(({ bytes: _bytes, ...summary }) => summary);
    },

    async load(id: string): Promise<Uint8Array | null> {
        let record: AutosaveVersionRecord | undefined;
        if (!indexedDb()) record = memoryVersions.get(id);
        else
            record = await transaction('readonly', (store) =>
                request(store.get(id) as IDBRequest<AutosaveVersionRecord | undefined>)
            );
        return record ? new Uint8Array(record.bytes.slice(0)) : null;
    },

    async remove(id: string): Promise<void> {
        if (!indexedDb()) {
            memoryVersions.delete(id);
            return;
        }
        await transaction('readwrite', async (store) => {
            store.delete(id);
            return undefined;
        });
    },

    async clear(): Promise<void> {
        memoryVersions.clear();
        if (!indexedDb()) return;
        await transaction('readwrite', async (store) => {
            store.clear();
            return undefined;
        });
    },

    async totalSize(): Promise<number> {
        return (await allRecords()).reduce((total, record) => total + record.size, 0);
    },
};

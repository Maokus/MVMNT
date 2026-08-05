import { sha256Hex } from '@utils/hash/sha256';

const DB_NAME = 'mvmnt-autosave-versions';
const STORE_NAME = 'versions';
const BYTES_STORE_NAME = 'version-bytes';
const DB_VERSION = 2;
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
    digest?: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;
const memoryVersions = new Map<string, AutosaveVersionRecord>();
const memoryBytes = new Map<string, ArrayBuffer>();

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
            const tx = request.transaction!;
            const versions = db.objectStoreNames.contains(STORE_NAME)
                ? tx.objectStore(STORE_NAME)
                : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            if (!versions.indexNames.contains('projectId')) versions.createIndex('projectId', 'projectId');
            if (!versions.indexNames.contains('savedAt')) versions.createIndex('savedAt', 'savedAt');
            if (!db.objectStoreNames.contains(BYTES_STORE_NAME)) {
                const payloads = db.createObjectStore(BYTES_STORE_NAME);
                // V1 stored package bytes alongside metadata. Move them out during the
                // upgrade so routine history operations no longer clone every package.
                versions.openCursor().onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
                    if (!cursor) return;
                    const value = cursor.value as AutosaveVersionRecord & { bytes?: ArrayBuffer };
                    if (value.bytes) {
                        payloads.put(value.bytes, value.id);
                        const { bytes: _bytes, ...metadata } = value;
                        cursor.update(metadata);
                    }
                    cursor.continue();
                };
            }
        };
        request.onerror = () => reject(request.error ?? new Error('Could not open autosave database'));
        request.onsuccess = () => resolve(request.result);
    }).catch((error) => {
        databasePromise = null;
        throw error;
    });
    return databasePromise;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error ?? new Error('Autosave database request failed'));
    });
}

async function transaction<T>(
    mode: IDBTransactionMode,
    action: (versions: IDBObjectStore, bytes: IDBObjectStore) => Promise<T>
): Promise<T> {
    const db = await openDatabase();
    const tx = db.transaction([STORE_NAME, BYTES_STORE_NAME], mode);
    const result = await action(tx.objectStore(STORE_NAME), tx.objectStore(BYTES_STORE_NAME));
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

async function allRecords(): Promise<AutosaveVersionRecord[]> {
    if (!indexedDb()) return [...memoryVersions.values()].map((record) => ({ ...record }));
    return transaction('readonly', (versions) => request(versions.getAll() as IDBRequest<AutosaveVersionRecord[]>));
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
        for (const record of removals) {
            memoryVersions.delete(record.id);
            memoryBytes.delete(record.id);
        }
        return;
    }
    await transaction('readwrite', async (versions, bytes) => {
        for (const record of removals) {
            versions.delete(record.id);
            bytes.delete(record.id);
        }
    });
}

export const AutosaveVersionStore = {
    policy: { maxVersionsPerProject: MAX_VERSIONS_PER_PROJECT, maxAgeDays: 30 },

    async save(documentName: string, bytes: Uint8Array, suppliedDigest?: string): Promise<AutosaveVersionSummary> {
        const projectId = normalizeProjectId(documentName);
        const digest = suppliedDigest ?? (await sha256Hex(bytes));
        const records = await allRecords();
        const latest = records.filter((item) => item.projectId === projectId).sort((a, b) => b.savedAt - a.savedAt)[0];
        if (latest?.digest === digest) return latest;

        const savedAt = Date.now();
        const record: AutosaveVersionRecord = {
            id: `${projectId}:${savedAt}:${crypto.randomUUID()}`,
            projectId,
            documentName: documentName.trim().replace(/\.mvt$/i, '') || 'Untitled',
            savedAt,
            size: bytes.byteLength,
            digest,
        };
        const payload = bytes.slice().buffer;
        if (!indexedDb()) {
            memoryVersions.set(record.id, record);
            memoryBytes.set(record.id, payload);
        } else {
            await transaction('readwrite', async (versions, payloads) => {
                versions.put(record);
                payloads.put(payload, record.id);
            });
        }
        await prune([...records, record]);
        return record;
    },

    async list(): Promise<AutosaveVersionSummary[]> {
        return (await allRecords())
            .sort((a, b) => b.savedAt - a.savedAt)
            .map(({ digest: _digest, ...summary }) => summary);
    },

    async load(id: string): Promise<Uint8Array | null> {
        if (!indexedDb()) {
            const bytes = memoryBytes.get(id);
            return bytes ? new Uint8Array(bytes.slice(0)) : null;
        }
        const bytes = await transaction('readonly', (_versions, payloads) =>
            request(payloads.get(id) as IDBRequest<ArrayBuffer | undefined>)
        );
        return bytes ? new Uint8Array(bytes) : null;
    },

    async remove(id: string): Promise<void> {
        if (!indexedDb()) {
            memoryVersions.delete(id);
            memoryBytes.delete(id);
            return;
        }
        await transaction('readwrite', async (versions, bytes) => {
            versions.delete(id);
            bytes.delete(id);
        });
    },

    async clear(): Promise<void> {
        memoryVersions.clear();
        memoryBytes.clear();
        if (!indexedDb()) return;
        await transaction('readwrite', async (versions, bytes) => {
            versions.clear();
            bytes.clear();
        });
    },

    async totalSize(): Promise<number> {
        return (await allRecords()).reduce((total, record) => total + record.size, 0);
    },
};

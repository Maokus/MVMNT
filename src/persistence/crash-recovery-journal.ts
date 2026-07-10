import type { AudioCacheEntry, AudioCacheOriginalFile, AudioCacheWaveform } from '@audio/audioTypes';
import type { PersistentDocumentV1 } from './document-gateway';
import { AudioAssetStore, createAudioAssetId } from './audio-asset-store';
import { recordAudioMemoryDiagnostic } from '@state/audioMemoryDiagnosticsStore';

const DB_NAME = 'mvmnt-crash-recovery';
const STORE_NAME = 'journal';
const CURRENT_KEY = 'current';
const PREVIOUS_KEY = 'previous-good';
const JOURNAL_SCHEMA_VERSION = 1;
const CHECKPOINT_DEBOUNCE_MS = 3000;

interface IndexedDbLike {
    open(name: string, version?: number): IDBOpenDBRequest;
}

export interface CrashRecoveryAudioSourceSnapshot {
    sourceId: string;
    durationTicks: number;
    sampleRate: number;
    channels: number;
    durationSeconds: number;
    durationSamples: number;
    originalFile?: AudioCacheOriginalFile;
    waveform?: Pick<AudioCacheWaveform, 'version' | 'sampleStep'> & { valueCount?: number };
}

export interface CrashRecoveryJournalSnapshot {
    schemaVersion: number;
    revision: number;
    timestamp: number;
    reason: string;
    document: PersistentDocumentV1;
    audioSources: Record<string, CrashRecoveryAudioSourceSnapshot>;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let currentSnapshot: CrashRecoveryJournalSnapshot | null = null;
let previousSnapshot: CrashRecoveryJournalSnapshot | null = null;
let revision = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeTimeline: (() => void) | null = null;
let unsubscribeScene: (() => void) | null = null;
let unsubscribeMetadata: (() => void) | null = null;

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
            dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onerror = () => reject(request.error ?? new Error('Failed to open recovery journal'));
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
        tx.onerror = () => reject(tx.error ?? new Error('Recovery journal transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Recovery journal transaction aborted'));
    });
    return result;
}

function serializeSnapshot(snapshot: CrashRecoveryJournalSnapshot): string {
    return JSON.stringify(snapshot);
}

function parseSnapshot(value: unknown): CrashRecoveryJournalSnapshot | null {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== 'object') return null;
        if (parsed.schemaVersion !== JOURNAL_SCHEMA_VERSION) return null;
        if (!parsed.document || !parsed.audioSources) return null;
        return parsed as CrashRecoveryJournalSnapshot;
    } catch {
        return null;
    }
}

async function ensureOriginalFileReference(sourceId: string, original?: AudioCacheOriginalFile): Promise<AudioCacheOriginalFile | undefined> {
    if (!original) return undefined;
    if (original.assetId) {
        return { ...original, bytes: original.storage === 'memory' ? original.bytes : undefined };
    }
    if (!original.bytes) {
        return { ...original, storage: 'missing' };
    }
    const assetId = createAudioAssetId('audio-journal');
    const storage = await AudioAssetStore.put(assetId, original.bytes);
    return {
        name: original.name,
        mimeType: original.mimeType,
        byteLength: original.byteLength || original.bytes.byteLength,
        hash: original.hash,
        assetId,
        storage,
        bytes: storage === 'memory' ? original.bytes : undefined,
    };
}

async function buildAudioSourceSnapshots(): Promise<Record<string, CrashRecoveryAudioSourceSnapshot>> {
    const audioSources: Record<string, CrashRecoveryAudioSourceSnapshot> = {};
    const { useTimelineStore } = await import('@state/timelineStore');
    const audioCache = useTimelineStore.getState().audioCache;
    for (const [sourceId, entry] of Object.entries(audioCache)) {
        const originalFile = await ensureOriginalFileReference(sourceId, entry.originalFile);
        audioSources[sourceId] = {
            sourceId,
            durationTicks: entry.durationTicks,
            sampleRate: entry.sampleRate,
            channels: entry.channels,
            durationSeconds: entry.durationSeconds,
            durationSamples: entry.durationSamples,
            originalFile,
            waveform: entry.waveform
                ? {
                      version: entry.waveform.version,
                      sampleStep: entry.waveform.sampleStep,
                      valueCount: entry.waveform.channelPeaks?.length,
                  }
                : undefined,
        };
    }
    return audioSources;
}

async function buildSnapshot(reason: string): Promise<CrashRecoveryJournalSnapshot> {
    const { DocumentGateway } = await import('./document-gateway');
    const document = DocumentGateway.build();
    const lightDocument: PersistentDocumentV1 = {
        ...document,
        audioFeatureCaches: undefined,
        audioFeatureCacheStatus: document.audioFeatureCacheStatus,
    };
    revision += 1;
    return {
        schemaVersion: JOURNAL_SCHEMA_VERSION,
        revision,
        timestamp: Date.now(),
        reason,
        document: lightDocument,
        audioSources: await buildAudioSourceSnapshots(),
    };
}

async function writeSnapshot(snapshot: CrashRecoveryJournalSnapshot): Promise<void> {
    previousSnapshot = currentSnapshot;
    currentSnapshot = snapshot;
    if (!getIndexedDB()) return;
    await runTransaction('readwrite', (store) => {
        if (previousSnapshot) {
            store.put(serializeSnapshot(previousSnapshot), PREVIOUS_KEY);
        }
        store.put(serializeSnapshot(snapshot), CURRENT_KEY);
    });
}

export async function checkpointCrashRecoveryJournal(reason = 'change'): Promise<void> {
    try {
        const snapshot = await buildSnapshot(reason);
        await writeSnapshot(snapshot);
    } catch (error) {
        recordAudioMemoryDiagnostic({
            severity: 'warning',
            stage: 'recovery-journal-write-failed',
            message: `Failed to write recovery journal: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

export function scheduleCrashRecoveryCheckpoint(reason = 'change'): void {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void checkpointCrashRecoveryJournal(reason);
    }, CHECKPOINT_DEBOUNCE_MS);
}

export function startCrashRecoveryJournaling(): void {
    if (unsubscribeTimeline || unsubscribeScene || unsubscribeMetadata) return;
    void (async () => {
        const [{ useTimelineStore }, { useSceneStore }, { useSceneMetadataStore }] = await Promise.all([
            import('@state/timelineStore'),
            import('@state/sceneStore'),
            import('@state/sceneMetadataStore'),
        ]);
        if (unsubscribeTimeline || unsubscribeScene || unsubscribeMetadata) return;
        unsubscribeTimeline = useTimelineStore.subscribe((state, previous) => {
        if (
            state.tracks !== previous.tracks ||
            state.tracksOrder !== previous.tracksOrder ||
            state.midiCache !== previous.midiCache ||
            state.audioCache !== previous.audioCache ||
            state.playbackRange !== previous.playbackRange ||
            state.audioFeatureCacheStatus !== previous.audioFeatureCacheStatus
        ) {
            scheduleCrashRecoveryCheckpoint('timeline-change');
        }
        });
        unsubscribeScene = useSceneStore.subscribe((state, previous) => {
        if (state.runtimeMeta?.lastMutatedAt !== previous.runtimeMeta?.lastMutatedAt) {
            scheduleCrashRecoveryCheckpoint('scene-change');
        }
        });
        unsubscribeMetadata = useSceneMetadataStore.subscribe((state, previous) => {
        if (state.metadata.modifiedAt !== previous.metadata.modifiedAt) {
            scheduleCrashRecoveryCheckpoint('metadata-change');
        }
        });
    })();
}

export async function loadCrashRecoveryJournal(): Promise<CrashRecoveryJournalSnapshot | null> {
    if (currentSnapshot) return currentSnapshot;
    if (!getIndexedDB()) return null;
    try {
        const snapshot = await runTransaction('readonly', async (store) => {
            const value = await new Promise<unknown>((resolve, reject) => {
                const request = store.get(CURRENT_KEY);
                request.onerror = () => reject(request.error ?? new Error('Recovery journal load failed'));
                request.onsuccess = () => resolve(request.result);
            });
            return parseSnapshot(value);
        });
        currentSnapshot = snapshot;
        if (snapshot) {
            revision = Math.max(revision, snapshot.revision);
        }
        return snapshot;
    } catch {
        return null;
    }
}

export async function clearCrashRecoveryJournal(): Promise<void> {
    currentSnapshot = null;
    previousSnapshot = null;
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    if (!getIndexedDB()) return;
    try {
        await runTransaction('readwrite', (store) => {
            store.delete(CURRENT_KEY);
            store.delete(PREVIOUS_KEY);
        });
    } catch {
        /* ignore */
    }
}

export async function recoverFromCrashRecoveryJournal(snapshot: CrashRecoveryJournalSnapshot): Promise<void> {
    const [{ DocumentGateway }, { useTimelineStore }] = await Promise.all([
        import('./document-gateway'),
        import('@state/timelineStore'),
    ]);
    DocumentGateway.apply(snapshot.document);
    const nextAudioCache: Record<string, AudioCacheEntry> = {};
    for (const [sourceId, source] of Object.entries(snapshot.audioSources)) {
        nextAudioCache[sourceId] = {
            durationTicks: source.durationTicks,
            sampleRate: source.sampleRate,
            channels: source.channels,
            durationSeconds: source.durationSeconds,
            durationSamples: source.durationSamples,
            originalFile: source.originalFile,
            waveform: source.waveform
                ? {
                      version: 1,
                      channelPeaks: new Float32Array(0),
                      sampleStep: source.waveform.sampleStep,
                  }
                : undefined,
            decodedState: source.originalFile?.assetId || source.originalFile?.bytes ? 'evicted' : 'failed',
            decodedFailureReason: source.originalFile?.assetId || source.originalFile?.bytes ? undefined : 'original asset unavailable',
        };
    }
    useTimelineStore.setState((state) => ({
        ...state,
        audioCache: nextAudioCache,
    }));
}

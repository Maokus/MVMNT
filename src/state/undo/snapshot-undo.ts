import { serializeStable } from '@persistence/stable-stringify';
import { useTimelineStore } from '@state/timelineStore';
import { DocumentGateway } from '@persistence/document-gateway';
import { useSceneStore } from '@state/sceneStore';
import { ensureMacroSync } from '@state/scene/macroSyncService';

export interface UndoController {
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    reset(): void;
}

class DisabledUndoController implements UndoController {
    // retained name for minimal churn but functionality active
    canUndo() {
        return false;
    }
    canRedo() {
        return false;
    }
    undo() {
        /* no-op until initialized */
    }
    redo() {
        /* no-op until initialized */
    }
    reset() {
        /* no-op */
    }
}

interface SnapshotEntry {
    stateJSON: string;
    size: number; // bytes (UTF-16 length * 2 approximate) simplified as string length
    timestamp: number;
}

class SnapshotUndoController extends DisabledUndoController {
    private ring: SnapshotEntry[] = [];
    private index: number = -1; // points to current snapshot
    private maxDepth: number;
    private maxBytes: number;
    private debounceMs: number;
    private pendingTimer: any = null;
    private lastJSON: string | null = null;
    private unsub: (() => void) | null = null;
    private restoring: boolean = false; // guard to avoid capturing while applying undo
    // Removed complex suppression logic; rely on restoring flag + lastJSON update.

    constructor(opts: CreateSnapshotUndoOptions) {
        super();
        this.maxDepth = Math.min(Math.max(opts.maxDepth || 50, 1), 100);
        this.maxBytes = opts.maxBytes || 10 * 1024 * 1024; // 10MB approx
        this.debounceMs = opts.debounceMs || 50;
        try {
            console.debug('[Persistence] SnapshotUndoController init', {
                maxDepth: this.maxDepth,
                maxBytes: this.maxBytes,
                debounceMs: this.debounceMs,
            });
        } catch {}
        this.captureInitial();
        this.subscribe();
    }

    private buildSnapshot(): SnapshotEntry {
        // Use DocumentGateway
        const docWithEphemeral = DocumentGateway.build({ includeEphemeral: false });
        const json = serializeStable(docWithEphemeral);
        return { stateJSON: json, size: json.length * 2, timestamp: performance.now() };
    }

    private captureInitial() {
        const entry = this.buildSnapshot();
        this.ring = [entry];
        this.index = 0;
        this.lastJSON = entry.stateJSON;
    }

    private pushSnapshot(entry: SnapshotEntry) {
        console.log('[Undo] Captured snapshot', { index: this.index, size: entry.size });
        // Drop any redo branch (everything after current index)
        if (this.index < this.ring.length - 1) {
            this.ring.splice(this.index + 1);
        }
        this.ring.push(entry);
        if (this.ring.length > this.maxDepth) {
            this.ring.shift();
        }
        this.index = this.ring.length - 1;
        this.enforceMemoryCap();
    }

    private enforceMemoryCap() {
        let total = this.ring.reduce((acc, r) => acc + r.size, 0);
        while (total > this.maxBytes && this.ring.length > 1) {
            this.ring.shift();
            this.index = this.ring.length - 1;
            total = this.ring.reduce((acc, r) => acc + r.size, 0);
        }
    }

    private scheduleCapture() {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
        }
        this.pendingTimer = setTimeout(() => {
            this.pendingTimer = null;
            this.captureIfChanged();
        }, this.debounceMs);
    }

    private captureIfChanged() {
        if (this.restoring) return; // don't record snapshots while restoring
        const entry = this.buildSnapshot();
        if (entry.stateJSON === this.lastJSON) return; // skip duplicate
        this.lastJSON = entry.stateJSON;
        this.pushSnapshot(entry);
    }

    private subscribe() {
        // Subscribe to store changes
        this.unsub = useTimelineStore.subscribe((state: any, prev: any) => {
            // If we're in the middle of applying an undo/redo snapshot, suppress capturing.
            // Without this guard the state changes produced by DocumentGateway.apply() schedule a new
            // snapshot once the debounce fires (after restoring flag has been cleared). That results in
            // the undo operation itself being recorded as a fresh top-of-stack entry, making further
            // undo impossible (you remain at the newest snapshot after a single undo) and breaking redo.
            if (this.restoring) return;
            try {
                const tl = state?.timeline;
                const prevTl = prev?.timeline;
                let onlyEphemeralTimelineChange = false;
                if (tl && prevTl) {
                    const keysChanged: string[] = [];
                    for (const k of Object.keys({ ...tl, ...prevTl })) {
                        if ((tl as any)[k] !== (prevTl as any)[k]) keysChanged.push(k);
                    }
                    const nonEphemeral = keysChanged.filter((k) => k !== 'currentTick' && k !== 'playheadAuthority');
                    // If there were timeline changes but they were exclusively ephemeral AND no other top-level slice changed, skip.
                    if (nonEphemeral.length === 0) {
                        // Compare shallow identity of other top-level slices we serialize (tracks, tracksOrder, playbackRange, rowHeight, midiCache)
                        const slicesStable =
                            state.tracks === prev.tracks &&
                            state.tracksOrder === prev.tracksOrder &&
                            state.playbackRange === prev.playbackRange &&
                            state.playbackRangeUserDefined === prev.playbackRangeUserDefined &&
                            state.rowHeight === prev.rowHeight &&
                            state.midiCache === prev.midiCache;
                        if (slicesStable) {
                            onlyEphemeralTimelineChange = true;
                        }
                    }
                }
                if (onlyEphemeralTimelineChange) return; // skip scheduling capture for scrub-only changes
            } catch {
                /* ignore and fall through */
            }
            this.scheduleCapture();
        });
    }

    canUndo(): boolean {
        // We only need to ensure there is a previous snapshot.
        // Original implementation attempted to block undoing past the first populated scene
        // which prevented undo of the very first element addition (because the previous snapshot
        // was the empty scene). That made initial undo feel broken. Relaxing this so users can
        // always return to the initial empty snapshot.
        return this.index > 0;
    }
    canRedo(): boolean {
        return this.index < this.ring.length - 1;
    }
    undo(): void {
        if (!this.canUndo()) return;
        this.index--;
        this.applyCurrent();
    }
    redo(): void {
        if (!this.canRedo()) return;
        this.index++;
        this.applyCurrent();
    }
    reset(): void {
        this.ring = [];
        this.index = -1;
        this.lastJSON = null;
        this.captureInitial();
    }

    private applyCurrent() {
        const cur = this.ring[this.index];
        if (!cur) return;
        try {
            const obj = JSON.parse(cur.stateJSON);
            this.restoring = true;
            // Merge slices to preserve function properties on the store (replace=true would discard actions)
            // Apply through gateway (ephemeral contained in __ephemeral)
            DocumentGateway.apply(obj);
            // Update lastJSON to the restored snapshot so any immediate markDirty with identical state is ignored.
            this.lastJSON = cur.stateJSON;
            this.restoring = false;
        } catch (e) {
            console.error('[Undo] Failed to parse/apply snapshot', e);
        }
    }

    /** Exposed so instrumentation can detect active restore and avoid scheduling a follow-up snapshot. */
    isRestoring(): boolean {
        return this.restoring;
    }

    // (Suppression helpers removed)

    /** Force a snapshot capture on next tick (used by devtools/store instrumentation). */
    markDirty() {
        if (this.restoring) return; // ignore while restoring
        this.scheduleCapture();
    }

    dispose() {
        if (this.unsub) {
            this.unsub();
            this.unsub = null;
        }
        if (this.pendingTimer) clearTimeout(this.pendingTimer);
    }

    // ---------------------- Debug / Inspection API ----------------------
    /** Returns lightweight info about the undo stack for console inspection. */
    debugStack() {
        return {
            length: this.ring.length,
            index: this.index,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            entries: this.ring.map((e, i) => ({
                i,
                bytes: e.size,
                ageMs: +(performance.now() - e.timestamp).toFixed(1),
                // Show a hash-ish first 24 chars for quick diffing
                head: e.stateJSON.slice(0, 24),
            })),
        };
    }

    /** Dumps the full JSON of a specific snapshot index (default current) */
    dump(index: number = this.index) {
        const entry = this.ring[index];
        if (!entry) return null;
        try {
            return JSON.parse(entry.stateJSON);
        } catch {
            return entry.stateJSON; // fallback raw
        }
    }
}

export interface CreateSnapshotUndoOptions {
    maxDepth?: number;
    maxBytes?: number; // memory cap (~10MB default)
    debounceMs?: number; // capture debounce (50ms default)
}

export function createSnapshotUndoController(_store: unknown, opts: CreateSnapshotUndoOptions = {}): UndoController {
    const ctrl = new SnapshotUndoController(opts);
    // Expose globally for store instrumentation and devtools helpers
    try {
        (window as any).__mvmntUndo = ctrl;
        // Convenience helpers for quick debugging in devtools.
        if (!(window as any).getUndoStack) {
            (window as any).getUndoStack = () => ctrl.debugStack();
        }
        if (!(window as any).dumpUndo) {
            (window as any).dumpUndo = (i?: number) => ctrl.dump(i ?? (ctrl as any).index);
        }
    } catch {}
    return ctrl;
}

// Instrument scene store actions so undo snapshots capture mutations promptly.
export function instrumentSceneStoreForUndo() {
    ensureMacroSync();
    const undo: any = (window as any).__mvmntUndo;
    if (!undo || typeof undo.markDirty !== 'function') return;
    if ((useSceneStore as any).__mvmntUndoInstrumented) return;
    const api: any = useSceneStore.getState();
    const wrap = (name: string) => {
        const orig = api[name];
        if (typeof orig !== 'function') return;
        if (orig.__mvmntUndoWrapped) return;
        const wrapped = (...args: any[]) => {
            const result = orig(...args);
            try {
                if (typeof undo.isRestoring === 'function' && undo.isRestoring()) {
                    return result;
                }
                undo.markDirty();
            } catch {
                /* ignore */
            }
            return result;
        };
        wrapped.__mvmntUndoWrapped = true;
        api[name] = wrapped;
    };

    [
        'addElement',
        'moveElement',
        'duplicateElement',
        'removeElement',
        'updateElementId',
        'updateSettings',
        'updateBindings',
        'createMacro',
        'updateMacroValue',
        'deleteMacro',
        'clearScene',
        'importScene',
        'replaceMacros',
    ].forEach(wrap);

    (useSceneStore as any).__mvmntUndoInstrumented = true;
}

// Instrument timeline store actions so that meaningful mutations capture snapshots immediately
// rather than waiting solely on the debounced store subscription (improves granularity for undo).
export function instrumentTimelineStoreForUndo() {
    const undo: any = (window as any).__mvmntUndo;
    if (!undo || typeof undo.markDirty !== 'function') return;
    if ((useTimelineStore as any).__mvmntUndoInstrumented) return;
    const api: any = useTimelineStore.getState();
    const actionNames = [
        'addMidiTrack',
        'removeTrack',
        'removeTracks',
        'updateTrack',
        'setTrackOffsetTicks',
        'setTrackRegionTicks',
        'setTrackEnabled',
        'setTrackMute',
        'setTrackSolo',
        'setMasterTempoMap',
        'setGlobalBpm',
        'setBeatsPerBar',
        'reorderTracks',
        'setPlaybackRangeTicks',
        'setPlaybackRangeExplicitTicks',
        'setRowHeight',
        'ingestMidiToCache',
        'clearAllTracks',
    ];
    actionNames.forEach((name) => {
        const orig = api[name];
        if (typeof orig !== 'function') return;
        // Wrap only once
        if (orig.__mvmntUndoWrapped) return;
        const wrapped = (...args: any[]) => {
            const result = orig(...args);
            try {
                // If we're currently restoring an undo snapshot, skip scheduling a new snapshot.
                if (typeof undo.isRestoring === 'function' && undo.isRestoring()) {
                    return result;
                }
                try {
                    // Re-check restoring state in case a restore began after scheduling
                    if (typeof undo.isRestoring === 'function' && undo.isRestoring()) return;
                    undo.markDirty();
                } catch (e) {
                    console.error(e);
                }
            } catch (e) {
                console.error(e);
            }
            return result;
        };
        (wrapped as any).__mvmntUndoWrapped = true;
        api[name] = wrapped;
    });
    (useTimelineStore as any).__mvmntUndoInstrumented = true;
}

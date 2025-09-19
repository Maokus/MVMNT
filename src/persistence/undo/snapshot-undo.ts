import { SERIALIZATION_V1_ENABLED } from '../flags';
import { serializeStable } from '../stable-stringify';
import { useTimelineStore } from '../../state/timelineStore';
import { globalMacroManager } from '../../bindings/macro-manager';
import { DocumentGateway } from '../document-gateway';

function _getSceneBuilder(): any | null {
    try {
        const vis: any = (window as any).vis || (window as any).visualizer;
        if (vis && typeof vis.getSceneBuilder === 'function') return vis.getSceneBuilder();
        if (vis && vis.sceneBuilder) return vis.sceneBuilder;
    } catch {}
    return null;
}

export interface UndoController {
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    reset(): void;
}

class DisabledUndoController implements UndoController {
    canUndo() {
        return false;
    }
    canRedo() {
        return false;
    }
    undo() {
        /* no-op */
    }
    redo() {
        /* no-op */
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
        // Use DocumentGateway with ephemeral fields (for undo we want playhead + transport + view)
        const docWithEphemeral = DocumentGateway.build({ includeEphemeral: true });
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
        if (this.restoring) return; // don't record snapshots while restoring one
        const entry = this.buildSnapshot();
        if (entry.stateJSON === this.lastJSON) return; // skip duplicate
        this.lastJSON = entry.stateJSON;
        this.pushSnapshot(entry);
    }

    private subscribe() {
        // Subscribe to store changes
        this.unsub = useTimelineStore.subscribe(() => this.scheduleCapture());
    }

    canUndo(): boolean {
        if (this.index <= 0) return false;
        // Prevent undoing back to an initial empty scene once user has a populated scene
        try {
            const current = this.ring[this.index];
            const prev = this.ring[this.index - 1];
            if (current && prev) {
                const curObj = JSON.parse(current.stateJSON);
                const prevObj = JSON.parse(prev.stateJSON);
                const curHasScene = !!(curObj?.scene?.elements && curObj.scene.elements.length > 0);
                const prevHasScene = !!(prevObj?.scene?.elements && prevObj.scene.elements.length > 0);
                if (curHasScene && !prevHasScene) {
                    return false; // block undo past the first populated scene snapshot
                }
            }
        } catch {}
        return true;
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
            this.restoring = false;
        } catch (e) {
            console.error('[Undo] Failed to parse/apply snapshot', e);
        }
    }

    /** Force a snapshot capture on next tick (used by scene builder instrumentation). */
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
}

export interface CreateSnapshotUndoOptions {
    maxDepth?: number;
    maxBytes?: number; // memory cap (~10MB default)
    debounceMs?: number; // capture debounce (50ms default)
}

/**
 * Phase 0: returns disabled controller if flag off, else placeholder controller with no behavior.
 */
export function createSnapshotUndoController(_store: unknown, opts: CreateSnapshotUndoOptions = {}): UndoController {
    if (!SERIALIZATION_V1_ENABLED()) {
        return new DisabledUndoController();
    }
    const ctrl = new SnapshotUndoController(opts);
    // Expose globally for scene builder instrumentation
    try {
        (window as any).__mvmntUndo = ctrl;
    } catch {}
    return ctrl;
}

// Helper to instrument a scene builder so that element/macro mutations trigger undo snapshots.
export function instrumentSceneBuilderForUndo(sb: any) {
    if (!sb || sb.__mvmntUndoInstrumented) return;
    const undo: any = (window as any).__mvmntUndo;
    if (!undo || typeof undo.markDirty !== 'function') return;
    const wrap = (obj: any, method: string) => {
        if (typeof obj[method] !== 'function') return;
        const orig = obj[method].bind(obj);
        obj[method] = function (...args: any[]) {
            const r = orig(...args);
            try {
                undo.markDirty();
            } catch {}
            return r;
        };
    };
    [
        'addElement',
        'removeElement',
        'updateElementConfig',
        'moveElement',
        'duplicateElement',
        'clearElements',
        'loadScene',
        'updateSceneSettings',
    ].forEach((m) => wrap(sb, m));
    sb.__mvmntUndoInstrumented = true;
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
        const wrapped = async (...args: any[]) => {
            const result = await orig(...args);
            try {
                // Schedule markDirty after promise resolves (e.g., addMidiTrack async ingest)
                setTimeout(() => undo.markDirty(), 0);
            } catch {}
            return result;
        };
        (wrapped as any).__mvmntUndoWrapped = true;
        api[name] = wrapped;
    });
    (useTimelineStore as any).__mvmntUndoInstrumented = true;
}

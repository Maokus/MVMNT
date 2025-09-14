import { SERIALIZATION_V1_ENABLED } from '../flags';
import { serializeStable } from '../stable-stringify';
import { useTimelineStore } from '../../state/timelineStore';
import { globalMacroManager } from '../../bindings/macro-manager';

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
        // For Phase 1 we only capture the exported envelope's JSON to ensure deterministic replay.
        // We limit capture to timeline related slices (same as export) for now.
        const s = useTimelineStore.getState();
        // Capture scene + macros (best effort)
        let sceneElements: any[] = [];
        let sceneSettings: any = undefined;
        try {
            const sb = _getSceneBuilder();
            if (sb && typeof sb.serializeScene === 'function') {
                const serialized = sb.serializeScene();
                sceneElements = serialized?.elements ? [...serialized.elements] : [];
                sceneSettings = serialized?.sceneSettings ? { ...serialized.sceneSettings } : undefined;
            }
        } catch {}
        let macros: any = undefined;
        try {
            macros = globalMacroManager.exportMacros();
        } catch {}
        const snapshotObj = {
            timeline: s.timeline,
            tracks: s.tracks,
            tracksOrder: s.tracksOrder,
            transport: s.transport,
            selection: s.selection,
            timelineView: s.timelineView,
            playbackRange: s.playbackRange,
            playbackRangeUserDefined: s.playbackRangeUserDefined,
            rowHeight: s.rowHeight,
            midiCache: s.midiCache,
            scene: { elements: sceneElements, sceneSettings, macros },
        };
        const json = serializeStable(snapshotObj);
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
            useTimelineStore.setState(
                (prev: any) => ({
                    ...prev,
                    ...obj,
                }),
                false
            );
            // Restore scene + macros
            try {
                if (obj.scene) {
                    if (obj.scene.macros) {
                        try {
                            globalMacroManager.importMacros(obj.scene.macros);
                        } catch (e) {
                            console.error('[Undo][Scene] Macro import failed during undo', e);
                        }
                    }
                    const sb = _getSceneBuilder();
                    if (sb && obj.scene.elements) {
                        if (typeof sb.loadScene === 'function') {
                            const ok = sb.loadScene({
                                elements: obj.scene.elements,
                                sceneSettings: obj.scene.sceneSettings,
                                macros: obj.scene.macros,
                            });
                            if (!ok) console.error('[Undo][Scene] loadScene returned false during undo');
                        } else {
                            // Minimal fallback: clear + re-add
                            try {
                                sb.clearElements?.();
                            } catch {}
                            for (const el of obj.scene.elements) {
                                try {
                                    sb.addElementFromRegistry?.(el.type, el);
                                } catch (e) {
                                    console.error('[Undo][Scene] Failed adding element in fallback path', e, el);
                                }
                            }
                        }
                        // Try to invalidate render if visualizer exposed
                        try {
                            const vis: any = (window as any).vis;
                            vis?.invalidateRender?.();
                        } catch {}
                    }
                }
            } catch (e) {
                console.error('[Undo] Scene restoration error', e);
            } finally {
                this.restoring = false;
            }
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

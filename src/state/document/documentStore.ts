import create from 'zustand';
import { shallow } from 'zustand/shallow';
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { DocumentStateV1, HistoryEntry, PatchMeta, HistoryLogEvent } from './types';
import { useTimelineStore } from '../timelineStore';

enablePatches();

function isDevLikeEnv(): boolean {
    try {
        const nodeEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) || undefined;
        if (nodeEnv && nodeEnv !== 'production') return true;
        // Vitest globals
        if (typeof (globalThis as any).vitest !== 'undefined' || typeof (globalThis as any).vi !== 'undefined')
            return true;
    } catch {}
    return false;
}

function deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === 'object') {
        Object.freeze(obj as any);
        const props = Object.getOwnPropertyNames(obj as any);
        for (const p of props) {
            const v = (obj as any)[p];
            if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
        }
    }
    return obj;
}

// Dev/test guard to prevent accidental external mutation of snapshots
function createFrozenSnapshot<T>(obj: T): T {
    const clone = (() => {
        try {
            // @ts-ignore
            return structuredClone(obj);
        } catch {
            return JSON.parse(JSON.stringify(obj));
        }
    })();
    if (!isDevLikeEnv()) return clone;
    return deepFreeze(clone);
}

export type DocumentStoreState = {
    // Version bump triggers, since doc is private
    rev: number;
    // History convenience flags
    canUndo: boolean;
    canRedo: boolean;
    // Core document operations
    commit: (updater: (draft: DocumentStateV1) => void, meta?: PatchMeta) => void;
    undo: () => void;
    redo: () => void;
    replace: (next: DocumentStateV1, meta?: PatchMeta) => void;
    // Grouping API: treat multiple commits as a single history entry
    beginGroup: (label?: string) => void;
    endGroup: () => void;
    // Optional: configure history cap
    setHistoryCap: (n: number) => void;
    // Optional: developer logging hook (no-op by default)
    setHistoryLogger: (fn: ((e: HistoryLogEvent<DocumentStateV1>) => void) | null) => void;
    // Read-only accessors
    getSnapshot: () => DocumentStateV1;
    selectTimeline: () => DocumentStateV1['timeline'];
    selectScene: () => DocumentStateV1['scene'];
};

function buildInitialDoc(): DocumentStateV1 {
    // Seed from the existing timeline store to avoid double sources of truth while migrating
    const tl = useTimelineStore.getState();
    const timeline = {
        timeline: tl.timeline,
        tracks: tl.tracks,
        tracksOrder: [...tl.tracksOrder],
        transport: tl.transport,
        selection: tl.selection,
        timelineView: tl.timelineView,
        playbackRange: tl.playbackRange,
        playbackRangeUserDefined: tl.playbackRangeUserDefined,
        rowHeight: tl.rowHeight,
        midiCache: tl.midiCache,
    };
    const scene = {
        elements: [],
        // P1: dual-write structures (populated lazily/migration). Use non-optional internally after migration.
        elementsById: {} as Record<string, any>,
        elementOrder: [] as string[],
        sceneSettings: undefined,
        macros: undefined,
    };
    return { timeline, scene };
}

// P1: Migration utility to ensure dual structures exist and are consistent with legacy array.
function migrateSceneStructure(doc: DocumentStateV1) {
    const scene: any = doc.scene;
    if (!scene.elementsById || typeof scene.elementsById !== 'object') scene.elementsById = {};
    if (!Array.isArray(scene.elementOrder)) scene.elementOrder = [];
    // If map/order empty but legacy elements has data, hydrate from legacy array
    if (
        scene.elementOrder.length === 0 &&
        Object.keys(scene.elementsById).length === 0 &&
        Array.isArray(scene.elements)
    ) {
        for (const el of scene.elements) {
            if (!el || !el.id) continue;
            scene.elementsById[el.id] = el;
            scene.elementOrder.push(el.id);
        }
    } else {
        // Otherwise ensure parity: any element missing in map gets added and order appended.
        if (Array.isArray(scene.elements)) {
            for (const el of scene.elements) {
                if (!el || !el.id) continue;
                if (!scene.elementsById[el.id]) {
                    scene.elementsById[el.id] = el;
                    if (!scene.elementOrder.includes(el.id)) scene.elementOrder.push(el.id);
                }
            }
        }
    }
    return doc;
}

export const useDocumentStore = create<DocumentStoreState>((set, get) => {
    // Private, mutable document and history stacks
    let doc: DocumentStateV1 = migrateSceneStructure(buildInitialDoc());
    let past: HistoryEntry<DocumentStateV1>[] = [];
    let future: HistoryEntry<DocumentStateV1>[] = [];
    let cap = 200;
    let logger: ((e: HistoryLogEvent<DocumentStateV1>) => void) | null = null;
    // Grouping state
    let grouping = false;
    let groupLabel: string | undefined;
    let groupPatches: Patch[] = [];
    let groupInverse: Patch[] = [];

    const bump = () => {
        const s = get();
        set({ rev: s.rev + 1, canUndo: past.length > 0, canRedo: future.length > 0 });
    };

    const log = (type: HistoryLogEvent['type'], meta?: PatchMeta) => {
        if (!logger) return;
        logger({
            type,
            meta,
            historyLength: past.length,
            redoLength: future.length,
            timestamp: Date.now(),
            groupActive: grouping,
            lastEntry: past[past.length - 1],
        });
    };

    // Expose simple dev-only inspectors on global for Phase P0 (will be formalized later)
    function exposeDevHelpers() {
        if (typeof window === 'undefined') return;
        const w: any = window as any;
        w.__undoDebug = w.__undoDebug || {};
        w.__undoDebug.dumpDoc = () => get().getSnapshot();
        w.__undoDebug.hist = () => ({ past: past.length, future: future.length, grouping, groupLabel });
        let benchmarked = false;
        w.__undoDebug.verify = () => {
            const problems: string[] = [];
            try {
                const snap = get().getSnapshot();
                const scene: any = snap.scene;
                const map = scene.elementsById || {};
                const order: string[] = scene.elementOrder || [];
                const keys = Object.keys(map);
                if (keys.length !== order.length) problems.push('length mismatch map vs order');
                for (const id of order) {
                    if (!map[id]) problems.push('order id missing in map: ' + id);
                }
                // ensure legacy array parity (# elements with ids match map size)
                if (Array.isArray(scene.elements)) {
                    const arrIds = scene.elements.map((e: any) => e && e.id).filter(Boolean);
                    const arrUnique = Array.from(new Set(arrIds));
                    if (arrUnique.length !== keys.length) problems.push('legacy array id count diverges from map size');
                }
                if (!benchmarked && isDevLikeEnv()) {
                    benchmarked = true;
                    try {
                        const sampleIds = order.slice(0, 100);
                        const t0 = performance.now();
                        let sum = 0;
                        for (let i = 0; i < 1000; i++) {
                            for (const id of sampleIds) {
                                const el = (map as any)[id];
                                if (el) sum += el?.x ? 1 : 0;
                            }
                        }
                        const dt = performance.now() - t0;
                        // eslint-disable-next-line no-console
                        console.log(
                            '[undoDebug.verify][benchmark] 100 id lookups x1000 loops in',
                            dt.toFixed(2),
                            'ms (sum=',
                            sum,
                            ')'
                        );
                    } catch {}
                }
            } catch (e: any) {
                problems.push('exception: ' + e?.message);
            }
            const ok = problems.length === 0;
            if (!ok) console.warn('[undoDebug.verify] problems', problems);
            else if (isDevLikeEnv()) console.log('[undoDebug.verify] ok');
            return ok;
        };
    }
    exposeDevHelpers();

    // Dev invariant check (P1): ensure map/order parity after any state mutation
    function devInvariantCheck() {
        if (!isDevLikeEnv()) return;
        try {
            const scene: any = doc.scene;
            if (!scene) return;
            const map = scene.elementsById || {};
            const order: string[] = scene.elementOrder || [];
            if (Object.keys(map).length !== order.length) {
                // eslint-disable-next-line no-console
                console.warn('[DocumentStore][invariant] elementsById length != elementOrder length');
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[DocumentStore][invariant] exception', e);
        }
    }

    const api: DocumentStoreState = {
        rev: 0,
        canUndo: false,
        canRedo: false,

        commit(updater, meta) {
            const [next, patches, inversePatches] = produceWithPatches(doc, updater);
            if (patches.length === 0) return; // no-op
            doc = migrateSceneStructure(next);
            if (grouping) {
                // Accumulate patches within the active group
                // Forward patches apply in order
                groupPatches.push(...(patches as Patch[]));
                // Inverse patches must be applied in reverse order when undoing the group
                groupInverse = [...(inversePatches as Patch[]), ...groupInverse];
                // Do not modify history yet, but future should be cleared on first group change
                future = [];
                bump();
                log('commit', meta);
                devInvariantCheck();
                return;
            }
            // push onto history and clear future
            past.push({
                patches: patches as Patch[],
                inversePatches: inversePatches as Patch[],
                meta,
                timestamp: Date.now(),
            });
            future = [];
            // enforce cap
            if (past.length > cap) {
                past = past.slice(past.length - cap);
                log('capTrim');
            }
            bump();
            log('commit', { ...(meta || {}), patchCount: (patches as Patch[]).length });
            devInvariantCheck();
        },

        undo() {
            console.log('undo called');
            console.log(past);
            console.log(future);
            if (past.length === 0) return;
            const entry = past[past.length - 1];
            past = past.slice(0, -1);
            doc = migrateSceneStructure(applyPatches(doc, entry.inversePatches as Patch[]));
            // Move entry to future for redo
            future.push(entry);
            bump();
            log('undo', { ...(entry.meta || {}), undoPatchCount: entry.inversePatches?.length });
            devInvariantCheck();
        },

        redo() {
            if (future.length === 0) return;
            const entry = future[future.length - 1];
            future = future.slice(0, -1);
            doc = migrateSceneStructure(applyPatches(doc, entry.patches as Patch[]));
            past.push(entry);
            bump();
            log('redo', { ...(entry.meta || {}), redoPatchCount: entry.patches?.length });
            devInvariantCheck();
        },

        replace(next, meta) {
            // Replace entire doc and clear history stacks
            try {
                // @ts-ignore
                doc = migrateSceneStructure(structuredClone(next));
            } catch {
                doc = migrateSceneStructure(JSON.parse(JSON.stringify(next)));
            }
            past = [];
            future = [];
            // Optionally record meta by pushing a marker entry? Spec says clear stacks; so skip.
            bump();
            log('replace', meta);
            devInvariantCheck();
        },

        beginGroup(label) {
            if (grouping) return; // nested grouping ignored for simplicity
            grouping = true;
            groupLabel = label;
            groupPatches = [];
            groupInverse = [];
            // Clear future to begin a new linear branch
            future = [];
            log('beginGroup', { label });
        },

        endGroup() {
            if (!grouping) return;
            grouping = false;
            if (groupPatches.length === 0) {
                // nothing changed during group
                groupLabel = undefined;
                log('endGroup');
                return;
            }
            past.push({
                patches: groupPatches,
                inversePatches: groupInverse,
                meta: { label: groupLabel ?? 'group' },
                timestamp: Date.now(),
            });
            groupPatches = [];
            groupInverse = [];
            groupLabel = undefined;
            if (past.length > cap) {
                past = past.slice(past.length - cap);
                log('capTrim');
            }
            bump();
            log('endGroup');
        },

        setHistoryCap(n: number) {
            cap = Math.max(0, Math.floor(n || 0));
            if (cap === 0) {
                past = [];
                future = [];
            } else if (past.length > cap) {
                past = past.slice(past.length - cap);
            }
            bump();
            log('capTrim');
        },

        setHistoryLogger(fn) {
            logger = fn;
        },

        getSnapshot() {
            return createFrozenSnapshot(doc);
        },

        selectTimeline() {
            return createFrozenSnapshot(doc).timeline;
        },

        selectScene() {
            return createFrozenSnapshot(doc).scene;
        },
    };

    return api;
});

export const useDocumentStoreShallow = <T>(selector: (s: DocumentStoreState) => T) =>
    useDocumentStore(selector, shallow);

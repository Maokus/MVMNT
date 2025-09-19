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
        sceneSettings: undefined,
        macros: undefined,
    };
    return { timeline, scene };
}

export const useDocumentStore = create<DocumentStoreState>((set, get) => {
    // Private, mutable document and history stacks
    let doc: DocumentStateV1 = buildInitialDoc();
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

    const api: DocumentStoreState = {
        rev: 0,
        canUndo: false,
        canRedo: false,

        commit(updater, meta) {
            const [next, patches, inversePatches] = produceWithPatches(doc, updater);
            if (patches.length === 0) return; // no-op
            doc = next;
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
            log('commit', meta);
        },

        undo() {
            console.log('undo called');
            console.log(past);
            console.log(future);
            if (past.length === 0) return;
            const entry = past[past.length - 1];
            past = past.slice(0, -1);
            doc = applyPatches(doc, entry.inversePatches as Patch[]);
            // Move entry to future for redo
            future.push(entry);
            bump();
            log('undo', entry.meta);
        },

        redo() {
            if (future.length === 0) return;
            const entry = future[future.length - 1];
            future = future.slice(0, -1);
            doc = applyPatches(doc, entry.patches as Patch[]);
            past.push(entry);
            bump();
            log('redo', entry.meta);
        },

        replace(next, meta) {
            // Replace entire doc and clear history stacks
            try {
                // @ts-ignore
                doc = structuredClone(next);
            } catch {
                doc = JSON.parse(JSON.stringify(next));
            }
            past = [];
            future = [];
            // Optionally record meta by pushing a marker entry? Spec says clear stacks; so skip.
            bump();
            log('replace', meta);
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

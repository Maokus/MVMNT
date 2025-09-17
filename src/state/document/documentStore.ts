import create from 'zustand';
import { shallow } from 'zustand/shallow';
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { DocumentStateV1, HistoryEntry, PatchMeta } from './types';
import { useTimelineStore } from '../timelineStore';

// Phase 2: Patch-based undo engine for document-only state with encapsulated doc.

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
    // Optional: configure history cap
    setHistoryCap: (n: number) => void;
    // Read-only accessors
    getSnapshot: () => DocumentStateV1;
    selectTimeline: () => DocumentStateV1['timeline'];
    selectScene: () => DocumentStateV1['scene'];
};

function buildInitialDoc(): DocumentStateV1 {
    // Seed from the existing timeline store to avoid double sources of truth in Phase 1/2
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

    const bump = () => {
        const s = get();
        set({ rev: s.rev + 1, canUndo: past.length > 0, canRedo: future.length > 0 });
    };

    const api: DocumentStoreState = {
        rev: 0,
        canUndo: false,
        canRedo: false,

        commit(updater, meta) {
            const [next, patches, inversePatches] = produceWithPatches(doc, updater);
            if (patches.length === 0) return; // no-op
            doc = next;
            // push onto history and clear future
            past.push({
                patches: patches as Patch[],
                inversePatches: inversePatches as Patch[],
                meta,
                timestamp: Date.now(),
            });
            future = [];
            // enforce cap
            if (past.length > cap) past = past.slice(past.length - cap);
            bump();
        },

        undo() {
            if (past.length === 0) return;
            const entry = past[past.length - 1];
            past = past.slice(0, -1);
            doc = applyPatches(doc, entry.inversePatches as Patch[]);
            // Move entry to future for redo
            future.push(entry);
            bump();
        },

        redo() {
            if (future.length === 0) return;
            const entry = future[future.length - 1];
            future = future.slice(0, -1);
            doc = applyPatches(doc, entry.patches as Patch[]);
            past.push(entry);
            bump();
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

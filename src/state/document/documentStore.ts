import create from 'zustand';
import { shallow } from 'zustand/shallow';
import type { DocumentStateV1 } from './types';
import { useTimelineStore } from '../timelineStore';

// Phase 1: Skeleton document store that mirrors current persisted shape.
// No history/patch engine yet; methods are minimal and no-op in spirit of not changing behavior.

export type DocumentStoreState = {
    // Public, readable shape in Phase 1 to unblock wiring; Phase 2 will encapsulate.
    doc: DocumentStateV1;
    // Replace entire document (used by importer later); here it just swaps state.
    replace: (next: DocumentStateV1) => void;
    // Convenience selectors — in Phase 1 we forward to the existing timeline store for live data.
    selectTimeline: () => DocumentStateV1['timeline'];
    selectScene: () => DocumentStateV1['scene'];
    // Snapshot returns a structured clone for read-only consumption patterns.
    getSnapshot: () => DocumentStateV1;
};

function buildInitialDoc(): DocumentStateV1 {
    // Seed from the existing timeline store to avoid double sources of truth in Phase 1
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

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
    doc: buildInitialDoc(),
    replace(next) {
        set({ doc: next });
    },
    selectTimeline() {
        return get().doc.timeline;
    },
    selectScene() {
        return get().doc.scene;
    },
    getSnapshot() {
        // structuredClone available in modern environments; fallback simple deep clone if needed
        try {
            // @ts-ignore
            return structuredClone(get().doc);
        } catch {
            const d = get().doc;
            return JSON.parse(JSON.stringify(d));
        }
    },
}));

export const useDocumentStoreShallow = <T>(selector: (s: DocumentStoreState) => T) =>
    useDocumentStore(selector, shallow);

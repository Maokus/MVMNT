import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';

export interface SelectedKeyframe {
    channelId: string;
    tick: number;
}

export type SelectionTarget = 'none' | 'elements' | 'tracks' | 'keyframes';

interface SelectionState {
    selectedElementIds: string[];
    selectedTrackIds: string[];
    selectedKeyframes: SelectedKeyframe[];
    activeTarget: SelectionTarget;
}

interface SelectionActions {
    /** Set elements as active selection domain. */
    selectElements(ids: string[]): void;
    /** Set tracks as active selection domain. */
    selectTracks(ids: string[]): void;
    /** Set keyframes as active selection domain. */
    selectKeyframes(keys: SelectedKeyframe[]): void;

    /** Low-level setters — update array without changing activeTarget. */
    setSelectedElementIds(ids: string[]): void;
    setSelectedTrackIds(ids: string[]): void;
    setSelectedKeyframes(keys: SelectedKeyframe[]): void;
    setActiveTarget(target: SelectionTarget): void;

    /**
     * Clear one domain (and reset activeTarget if it matched), or clear all when
     * no target is supplied.
     */
    clearSelection(target?: SelectionTarget): void;

    // Housekeeping callbacks (called by sceneStore on element remove/rename)
    removeElementFromSelection(elementId: string): void;
    renameElementInSelection(currentId: string, nextId: string): void;
    /** Remove all keyframes whose channelId starts with the given prefix. */
    removeChannelsFromSelection(elementId: string): void;

    // Derived selectors (callable from event handlers without hooks)
    getActiveCommandTarget(): SelectionTarget;
    /** Returns the element IDs relevant for the inspector panel. */
    getInspectorContext(): { elementIds: string[] };
    /**
     * When activeTarget === 'keyframes', returns the element IDs that own the
     * selected keyframe channels (derived from channelId format `elementId.prop`).
     */
    getSelectedElementContextForKeyframes(): string[];
}

export type SelectionStoreState = SelectionState & SelectionActions;

function deriveElementIdsFromKeyframes(keyframes: SelectedKeyframe[]): string[] {
    const ids = new Set<string>();
    for (const { channelId } of keyframes) {
        const dot = channelId.indexOf('.');
        if (dot > 0) ids.add(channelId.slice(0, dot));
    }
    return [...ids];
}

export const useSelectionStore = createWithEqualityFn<SelectionStoreState>(
    (set, get) => ({
        // ── State ──────────────────────────────────────────────────────────────
        selectedElementIds: [],
        selectedTrackIds: [],
        selectedKeyframes: [],
        activeTarget: 'none',

        // ── High-level domain selectors (set array + activeTarget atomically) ──
        selectElements(ids) {
            set({
                selectedElementIds: ids,
                selectedTrackIds: [],
                selectedKeyframes: [],
                activeTarget: ids.length ? 'elements' : 'none',
            });
        },
        selectTracks(ids) {
            set({
                selectedTrackIds: ids,
                selectedElementIds: [],
                selectedKeyframes: [],
                activeTarget: ids.length ? 'tracks' : 'none',
            });
        },
        selectKeyframes(keys) {
            set({
                selectedKeyframes: keys,
                // Preserve element selection for inspector context — elements are
                // derived from the keyframe channel IDs anyway.
                selectedTrackIds: [],
                activeTarget: keys.length ? 'keyframes' : 'none',
            });
        },

        // ── Low-level setters ───────────────────────────────────────────────
        setSelectedElementIds(ids) { set({ selectedElementIds: ids }); },
        setSelectedTrackIds(ids) { set({ selectedTrackIds: ids }); },
        setSelectedKeyframes(keys) { set({ selectedKeyframes: keys }); },
        setActiveTarget(target) { set({ activeTarget: target }); },

        // ── clearSelection ──────────────────────────────────────────────────
        clearSelection(target) {
            if (target === undefined) {
                set({ selectedElementIds: [], selectedTrackIds: [], selectedKeyframes: [], activeTarget: 'none' });
                return;
            }
            const { activeTarget } = get();
            const patch: Partial<SelectionState> = {};
            if (target === 'elements') patch.selectedElementIds = [];
            if (target === 'tracks') patch.selectedTrackIds = [];
            if (target === 'keyframes') patch.selectedKeyframes = [];
            if (activeTarget === target) patch.activeTarget = 'none';
            set(patch);
        },

        // ── Housekeeping ────────────────────────────────────────────────────
        removeElementFromSelection(elementId) {
            const { selectedElementIds, activeTarget } = get();
            const next = selectedElementIds.filter((id) => id !== elementId);
            set({
                selectedElementIds: next,
                activeTarget: activeTarget === 'elements' && !next.length ? 'none' : activeTarget,
            });
            // Also remove any keyframes owned by this element's channels
            get().removeChannelsFromSelection(elementId);
        },
        renameElementInSelection(currentId, nextId) {
            const { selectedElementIds, selectedKeyframes } = get();
            set({
                selectedElementIds: selectedElementIds.map((id) => (id === currentId ? nextId : id)),
                selectedKeyframes: selectedKeyframes.map((kf) => {
                    const prefix = currentId + '.';
                    if (!kf.channelId.startsWith(prefix)) return kf;
                    return { ...kf, channelId: nextId + kf.channelId.slice(currentId.length) };
                }),
            });
        },
        removeChannelsFromSelection(elementId) {
            const prefix = elementId + '.';
            const { selectedKeyframes, activeTarget } = get();
            const next = selectedKeyframes.filter((kf) => !kf.channelId.startsWith(prefix));
            set({
                selectedKeyframes: next,
                activeTarget: activeTarget === 'keyframes' && !next.length ? 'none' : activeTarget,
            });
        },

        // ── Derived selectors ───────────────────────────────────────────────
        getActiveCommandTarget() {
            return get().activeTarget;
        },
        getInspectorContext() {
            const { activeTarget, selectedElementIds, selectedKeyframes } = get();
            if (activeTarget === 'elements') return { elementIds: selectedElementIds };
            if (activeTarget === 'keyframes') return { elementIds: deriveElementIdsFromKeyframes(selectedKeyframes) };
            return { elementIds: [] };
        },
        getSelectedElementContextForKeyframes() {
            return deriveElementIdsFromKeyframes(get().selectedKeyframes);
        },
    }),
    shallow
);

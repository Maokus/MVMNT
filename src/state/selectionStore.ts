import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';

export interface SelectedKeyframe {
    channelId: string;
    tick: number;
}

export interface TimelineRangeSelection {
    startTick: number;
    endTick: number;
    trackIds: string[];
}

export interface TimelineInsertionSelection {
    tick: number;
    trackId: string;
}

export interface TimelineClipRef {
    trackId: string;
    clipId: string;
    kind?: 'midi' | 'audio';
}

export type ClipTimelineSelection =
    | { type: 'range'; range: TimelineRangeSelection }
    | { type: 'point'; point: TimelineInsertionSelection }
    | { type: 'clips'; clips: TimelineClipRef[] };

export type SelectionTarget = 'none' | 'elements' | 'tracks' | 'keyframes' | 'clipTimeline';

interface SelectionState {
    selectedElementIds: string[];
    selectedNodeIds: string[];
    activeNodeId: string | null;
    anchorNodeId: string | null;
    editingContainerId: string | null;
    expandedNodeIds: Record<string, boolean>;
    selectedTrackIds: string[];
    selectedKeyframes: SelectedKeyframe[];
    clipTimelineSelection: ClipTimelineSelection | null;
    activeTarget: SelectionTarget;
}

interface SelectionActions {
    /** Set elements as active selection domain. */
    selectElements(ids: string[]): void;
    selectSceneNodes(nodeIds: string[], elementIds: string[], activeNodeId?: string | null): void;
    toggleSceneNode(nodeId: string, elementId?: string): void;
    selectSceneNodeRange(siblingIds: string[], targetNodeId: string, elementIdsByNodeId: Record<string, string>): void;
    setEditingContainerId(nodeId: string | null): void;
    toggleNodeExpanded(nodeId: string): void;
    reconcileSceneNodes(validNodeIds: string[], rootId: string, elementIdsByNodeId: Record<string, string>): void;
    /** Set tracks as active selection domain. */
    selectTracks(ids: string[]): void;
    /** Set keyframes as active selection domain. */
    selectKeyframes(keys: SelectedKeyframe[]): void;
    /** Set clip-lane point/range selection as active selection domain. */
    selectClipTimeline(selection: ClipTimelineSelection | null): void;

    /** Low-level setters — update array without changing activeTarget. */
    setSelectedElementIds(ids: string[]): void;
    setSceneNodeInspectorContext(nodeId: string): void;
    setSelectedTrackIds(ids: string[]): void;
    setSelectedKeyframes(keys: SelectedKeyframe[]): void;
    setClipTimelineSelection(selection: ClipTimelineSelection | null): void;
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
        selectedNodeIds: [],
        activeNodeId: null,
        anchorNodeId: null,
        editingContainerId: null,
        expandedNodeIds: {},
        selectedTrackIds: [],
        selectedKeyframes: [],
        clipTimelineSelection: null,
        activeTarget: 'none',

        // ── High-level domain selectors (set array + activeTarget atomically) ──
        selectElements(ids) {
            set({
                selectedElementIds: ids,
                selectedNodeIds: [],
                activeNodeId: null,
                anchorNodeId: null,
                selectedTrackIds: [],
                selectedKeyframes: [],
                clipTimelineSelection: null,
                activeTarget: ids.length ? 'elements' : 'none',
            });
        },
        selectSceneNodes(nodeIds, elementIds, activeNodeId) {
            const uniqueNodes = [...new Set(nodeIds)];
            const uniqueElements = [...new Set(elementIds)];
            const active =
                activeNodeId && uniqueNodes.includes(activeNodeId) ? activeNodeId : (uniqueNodes.at(-1) ?? null);
            set({
                selectedNodeIds: uniqueNodes,
                selectedElementIds: uniqueElements,
                activeNodeId: active,
                anchorNodeId: active,
                selectedTrackIds: [],
                selectedKeyframes: [],
                clipTimelineSelection: null,
                activeTarget: uniqueNodes.length ? 'elements' : 'none',
            });
        },
        toggleSceneNode(nodeId, elementId) {
            const state = get();
            const included = state.selectedNodeIds.includes(nodeId);
            const selectedNodeIds = included
                ? state.selectedNodeIds.filter((id) => id !== nodeId)
                : [...state.selectedNodeIds, nodeId];
            const selectedElementIds = elementId
                ? included
                    ? state.selectedElementIds.filter((id) => id !== elementId)
                    : [...state.selectedElementIds, elementId]
                : state.selectedElementIds;
            set({
                selectedNodeIds,
                selectedElementIds,
                activeNodeId: included ? (selectedNodeIds.at(-1) ?? null) : nodeId,
                anchorNodeId: included ? state.anchorNodeId : nodeId,
                activeTarget: selectedNodeIds.length ? 'elements' : 'none',
            });
        },
        selectSceneNodeRange(siblingIds, targetNodeId, elementIdsByNodeId) {
            const state = get();
            const anchor =
                state.anchorNodeId && siblingIds.includes(state.anchorNodeId) ? state.anchorNodeId : targetNodeId;
            const start = siblingIds.indexOf(anchor);
            const end = siblingIds.indexOf(targetNodeId);
            if (start < 0 || end < 0) return;
            const selectedNodeIds = siblingIds.slice(Math.min(start, end), Math.max(start, end) + 1);
            set({
                selectedNodeIds,
                selectedElementIds: selectedNodeIds.map((id) => elementIdsByNodeId[id]).filter(Boolean),
                activeNodeId: targetNodeId,
                anchorNodeId: anchor,
                activeTarget: 'elements',
            });
        },
        setEditingContainerId(nodeId) {
            set({ editingContainerId: nodeId });
        },
        toggleNodeExpanded(nodeId) {
            set((state) => ({
                expandedNodeIds: { ...state.expandedNodeIds, [nodeId]: state.expandedNodeIds[nodeId] === false },
            }));
        },
        reconcileSceneNodes(validNodeIds, rootId, elementIdsByNodeId) {
            const state = get();
            const valid = new Set(validNodeIds);
            const selectedNodeIds = state.selectedNodeIds.filter((id) => valid.has(id));
            const activeNodeId =
                state.activeNodeId && valid.has(state.activeNodeId)
                    ? state.activeNodeId
                    : (selectedNodeIds.at(-1) ?? null);
            set({
                selectedNodeIds,
                selectedElementIds: selectedNodeIds.map((id) => elementIdsByNodeId[id]).filter(Boolean),
                activeNodeId,
                anchorNodeId: state.anchorNodeId && valid.has(state.anchorNodeId) ? state.anchorNodeId : activeNodeId,
                editingContainerId:
                    state.editingContainerId && valid.has(state.editingContainerId) ? state.editingContainerId : rootId,
                activeTarget:
                    state.activeTarget === 'elements' && !selectedNodeIds.length ? 'none' : state.activeTarget,
            });
        },
        selectTracks(ids) {
            set({
                selectedTrackIds: ids,
                selectedElementIds: [],
                selectedNodeIds: [],
                activeNodeId: null,
                anchorNodeId: null,
                selectedKeyframes: [],
                clipTimelineSelection: null,
                activeTarget: ids.length ? 'tracks' : 'none',
            });
        },
        selectKeyframes(keys) {
            set({
                selectedKeyframes: keys,
                // Preserve element selection for inspector context — elements are
                // derived from the keyframe channel IDs anyway.
                selectedTrackIds: [],
                clipTimelineSelection: null,
                activeTarget: keys.length ? 'keyframes' : 'none',
            });
        },
        selectClipTimeline(selection) {
            set({
                clipTimelineSelection: selection,
                selectedElementIds: [],
                selectedNodeIds: [],
                activeNodeId: null,
                anchorNodeId: null,
                selectedTrackIds: [],
                selectedKeyframes: [],
                activeTarget: selection ? 'clipTimeline' : 'none',
            });
        },

        // ── Low-level setters ───────────────────────────────────────────────
        setSelectedElementIds(ids) {
            set({ selectedElementIds: ids });
        },
        setSceneNodeInspectorContext(nodeId) {
            set({ selectedNodeIds: [nodeId], selectedElementIds: [], activeNodeId: nodeId, anchorNodeId: nodeId });
        },
        setSelectedTrackIds(ids) {
            set({ selectedTrackIds: ids });
        },
        setSelectedKeyframes(keys) {
            set({ selectedKeyframes: keys });
        },
        setClipTimelineSelection(selection) {
            set({ clipTimelineSelection: selection });
        },
        setActiveTarget(target) {
            set({ activeTarget: target });
        },

        // ── clearSelection ──────────────────────────────────────────────────
        clearSelection(target) {
            if (target === undefined) {
                set({
                    selectedElementIds: [],
                    selectedNodeIds: [],
                    activeNodeId: null,
                    anchorNodeId: null,
                    selectedTrackIds: [],
                    selectedKeyframes: [],
                    clipTimelineSelection: null,
                    activeTarget: 'none',
                });
                return;
            }
            const { activeTarget } = get();
            const patch: Partial<SelectionState> = {};
            if (target === 'elements') {
                patch.selectedElementIds = [];
                patch.selectedNodeIds = [];
                patch.activeNodeId = null;
                patch.anchorNodeId = null;
            }
            if (target === 'tracks') patch.selectedTrackIds = [];
            if (target === 'keyframes') patch.selectedKeyframes = [];
            if (target === 'clipTimeline') patch.clipTimelineSelection = null;
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

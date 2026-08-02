import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import type { PropertyTarget } from '@automation/types';
import type { SceneGraphState, SceneNode } from '@state/scene-graph';

let resolveChannelTarget: (channelId: string) => PropertyTarget | undefined = () => undefined;
let resolveNodeIdForElement: (elementId: string) => string | undefined = () => undefined;
let resolveElementIdForNode: (nodeId: string) => string | undefined = () => undefined;
let resolveSceneGraph: () => SceneGraphState | undefined = () => undefined;

export function setSelectionChannelTargetResolver(resolver: (channelId: string) => PropertyTarget | undefined): void {
    resolveChannelTarget = resolver;
}

export function setSelectionSceneResolvers(resolvers: {
    nodeIdForElement: (elementId: string) => string | undefined;
    elementIdForNode: (nodeId: string) => string | undefined;
    graph: () => SceneGraphState;
}): void {
    resolveNodeIdForElement = resolvers.nodeIdForElement;
    resolveElementIdForNode = resolvers.elementIdForNode;
    resolveSceneGraph = resolvers.graph;
}

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
    selectedNodeIds: string[];
    activeNodeId: string | null;
    anchorNodeId: string | null;
    editingContainerId: string | null;
    expandedNodeIds: Record<string, boolean>;
    selectionPivot: { x: number; y: number } | null;
    selectedTrackIds: string[];
    selectedKeyframes: SelectedKeyframe[];
    clipTimelineSelection: ClipTimelineSelection | null;
    activeTarget: SelectionTarget;
}

interface SelectionActions {
    /** Set elements as active selection domain. */
    selectElements(ids: string[]): void;
    selectSceneNodes(nodeIds: string[], activeNodeId?: string | null): void;
    toggleSceneNode(nodeId: string): void;
    selectSceneNodeRange(siblingIds: string[], targetNodeId: string): void;
    setEditingContainerId(nodeId: string | null): void;
    toggleNodeExpanded(nodeId: string): void;
    setSelectionPivot(pivot: { x: number; y: number } | null): void;
    reconcileSceneNodes(graph: SceneGraphState, previousGraph?: SceneGraphState): void;
    /** Set tracks as active selection domain. */
    selectTracks(ids: string[]): void;
    /** Set keyframes as active selection domain. */
    selectKeyframes(keys: SelectedKeyframe[]): void;
    /** Set clip-lane point/range selection as active selection domain. */
    selectClipTimeline(selection: ClipTimelineSelection | null): void;

    /** Low-level setters — update array without changing activeTarget. */
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
    /** Remove all selected keyframes whose channels are owned by an element. */
    removeChannelsFromSelection(elementId: string): void;

    // Derived selectors (callable from event handlers without hooks)
    getActiveCommandTarget(): SelectionTarget;
    getSelectedElementIds(): string[];
    /** Returns the element IDs relevant for the inspector panel. */
    getInspectorContext(): { elementIds: string[] };
    /**
     * When activeTarget === 'keyframes', returns the element IDs that own the
     * selected keyframe channels (derived from their structured targets).
     */
    getSelectedElementContextForKeyframes(): string[];
}

export type SelectionStoreState = SelectionState & SelectionActions;

function elementIdsForNodes(nodeIds: readonly string[]): string[] {
    return nodeIds.map(resolveElementIdForNode).filter((id): id is string => Boolean(id));
}

function normalizeNodeIds(nodeIds: readonly string[], graph: SceneGraphState): string[] {
    const unique = [...new Set(nodeIds)].filter((id) => id !== graph.rootId && Boolean(graph.nodesById[id]));
    const selected = new Set(unique);
    return unique.filter((id) => {
        let parentId = graph.nodesById[id]?.parentId;
        while (parentId) {
            if (selected.has(parentId)) return false;
            parentId = graph.nodesById[parentId]?.parentId ?? null;
        }
        return true;
    });
}

function normalizeAgainstCurrentGraph(nodeIds: readonly string[]): string[] {
    const unique = [...new Set(nodeIds)];
    const graph = resolveSceneGraph();
    return graph && unique.some((id) => Boolean(graph.nodesById[id])) ? normalizeNodeIds(unique, graph) : unique;
}

function nearestSurvivingSelectionNode(
    nodeId: string,
    previousGraph: SceneGraphState,
    graph: SceneGraphState
): string | null {
    const valid = new Set(Object.keys(graph.nodesById));
    let cursor: string | null = nodeId;
    while (cursor) {
        const previousNode: SceneNode | undefined = previousGraph.nodesById[cursor];
        const parentId: string | null = previousNode?.parentId ?? null;
        if (!parentId) break;
        const previousParent = previousGraph.nodesById[parentId];
        if (previousParent && 'children' in previousParent) {
            const index = previousParent.children.indexOf(cursor);
            for (let distance = 1; distance < previousParent.children.length; distance += 1) {
                const after = previousParent.children[index + distance];
                if (after && valid.has(after)) return after;
                const before = previousParent.children[index - distance];
                if (before && valid.has(before)) return before;
            }
        }
        if (parentId !== graph.rootId && valid.has(parentId)) return parentId;
        cursor = parentId;
    }
    return null;
}

function nearestSurvivingContainer(nodeId: string, previousGraph: SceneGraphState, graph: SceneGraphState): string {
    let cursor = previousGraph.nodesById[nodeId]?.parentId ?? null;
    while (cursor) {
        const candidate = graph.nodesById[cursor];
        if (candidate && 'children' in candidate) return cursor;
        cursor = previousGraph.nodesById[cursor]?.parentId ?? null;
    }
    return graph.rootId;
}

function deriveElementIdsFromKeyframes(keyframes: SelectedKeyframe[]): string[] {
    const ids = new Set<string>();
    for (const { channelId } of keyframes) {
        const target = resolveChannelTarget(channelId);
        if (target?.owner.kind === 'element') ids.add(target.owner.id);
    }
    return [...ids];
}

export const useSelectionStore = createWithEqualityFn<SelectionStoreState>(
    (set, get) => ({
        // ── State ──────────────────────────────────────────────────────────────
        selectedNodeIds: [],
        activeNodeId: null,
        anchorNodeId: null,
        editingContainerId: null,
        expandedNodeIds: {},
        selectionPivot: null,
        selectedTrackIds: [],
        selectedKeyframes: [],
        clipTimelineSelection: null,
        activeTarget: 'none',

        // ── High-level domain selectors (set array + activeTarget atomically) ──
        selectElements(ids) {
            const resolved = [...new Set(ids.map(resolveNodeIdForElement).filter(Boolean))] as string[];
            const selectedNodeIds = normalizeAgainstCurrentGraph(resolved);
            set({
                selectedNodeIds,
                activeNodeId: selectedNodeIds.at(-1) ?? null,
                anchorNodeId: selectedNodeIds.at(-1) ?? null,
                selectedTrackIds: [],
                selectedKeyframes: [],
                clipTimelineSelection: null,
                activeTarget: selectedNodeIds.length ? 'elements' : 'none',
                selectionPivot: null,
            });
        },
        selectSceneNodes(nodeIds, activeNodeId) {
            const uniqueNodes = normalizeAgainstCurrentGraph(nodeIds);
            const active =
                activeNodeId && uniqueNodes.includes(activeNodeId) ? activeNodeId : (uniqueNodes.at(-1) ?? null);
            set({
                selectedNodeIds: uniqueNodes,
                activeNodeId: active,
                anchorNodeId: active,
                selectedTrackIds: [],
                selectedKeyframes: [],
                clipTimelineSelection: null,
                activeTarget: uniqueNodes.length ? 'elements' : 'none',
                selectionPivot: null,
            });
        },
        toggleSceneNode(nodeId) {
            const state = get();
            const included = state.selectedNodeIds.includes(nodeId);
            const selectedNodeIds = included
                ? state.selectedNodeIds.filter((id) => id !== nodeId)
                : [...state.selectedNodeIds, nodeId];
            const normalized = normalizeAgainstCurrentGraph(selectedNodeIds);
            const preferredActive = included ? normalized.at(-1) : nodeId;
            set({
                selectedNodeIds: normalized,
                activeNodeId:
                    preferredActive && normalized.includes(preferredActive)
                        ? preferredActive
                        : (normalized.at(-1) ?? null),
                anchorNodeId: included ? state.anchorNodeId : nodeId,
                activeTarget: normalized.length ? 'elements' : 'none',
                selectionPivot: null,
            });
        },
        selectSceneNodeRange(siblingIds, targetNodeId) {
            const state = get();
            const anchor =
                state.anchorNodeId && siblingIds.includes(state.anchorNodeId) ? state.anchorNodeId : targetNodeId;
            const start = siblingIds.indexOf(anchor);
            const end = siblingIds.indexOf(targetNodeId);
            if (start < 0 || end < 0) return;
            const selectedNodeIds = siblingIds.slice(Math.min(start, end), Math.max(start, end) + 1);
            const normalized = normalizeAgainstCurrentGraph(selectedNodeIds);
            set({
                selectedNodeIds: normalized,
                activeNodeId: targetNodeId,
                anchorNodeId: anchor,
                activeTarget: 'elements',
                selectionPivot: null,
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
        setSelectionPivot(selectionPivot) {
            set({ selectionPivot });
        },
        reconcileSceneNodes(graph, previousGraph) {
            const state = get();
            const valid = new Set(Object.keys(graph.nodesById));
            let selectedNodeIds = normalizeNodeIds(
                state.selectedNodeIds.filter((id) => valid.has(id)),
                graph
            );
            if (!selectedNodeIds.length && previousGraph && state.activeNodeId) {
                const fallback = nearestSurvivingSelectionNode(state.activeNodeId, previousGraph, graph);
                if (fallback) selectedNodeIds = [fallback];
            }
            const activeNodeId =
                state.activeNodeId && valid.has(state.activeNodeId)
                    ? state.activeNodeId
                    : (selectedNodeIds.at(-1) ?? null);
            set({
                selectedNodeIds,
                activeNodeId,
                anchorNodeId: state.anchorNodeId && valid.has(state.anchorNodeId) ? state.anchorNodeId : activeNodeId,
                editingContainerId:
                    state.editingContainerId && valid.has(state.editingContainerId)
                        ? state.editingContainerId
                        : state.editingContainerId && previousGraph
                          ? nearestSurvivingContainer(state.editingContainerId, previousGraph, graph)
                          : graph.rootId,
                activeTarget:
                    state.activeTarget === 'elements' && !selectedNodeIds.length ? 'none' : state.activeTarget,
            });
        },
        selectTracks(ids) {
            set({
                selectedTrackIds: ids,
                selectedNodeIds: [],
                activeNodeId: null,
                anchorNodeId: null,
                selectedKeyframes: [],
                clipTimelineSelection: null,
                activeTarget: ids.length ? 'tracks' : 'none',
                selectionPivot: null,
            });
        },
        selectKeyframes(keys) {
            set({
                selectedKeyframes: keys,
                // Preserve element selection for inspector context — elements are
                // derived from the selected channels' structured targets.
                selectedTrackIds: [],
                clipTimelineSelection: null,
                activeTarget: keys.length ? 'keyframes' : 'none',
            });
        },
        selectClipTimeline(selection) {
            set({
                clipTimelineSelection: selection,
                selectedNodeIds: [],
                activeNodeId: null,
                anchorNodeId: null,
                selectedTrackIds: [],
                selectedKeyframes: [],
                activeTarget: selection ? 'clipTimeline' : 'none',
                selectionPivot: null,
            });
        },

        // ── Low-level setters ───────────────────────────────────────────────
        setSceneNodeInspectorContext(nodeId) {
            set({ selectedNodeIds: [nodeId], activeNodeId: nodeId, anchorNodeId: nodeId, selectionPivot: null });
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
                    selectedNodeIds: [],
                    activeNodeId: null,
                    anchorNodeId: null,
                    selectedTrackIds: [],
                    selectedKeyframes: [],
                    clipTimelineSelection: null,
                    activeTarget: 'none',
                    selectionPivot: null,
                });
                return;
            }
            const { activeTarget } = get();
            const patch: Partial<SelectionState> = {};
            if (target === 'elements') {
                patch.selectedNodeIds = [];
                patch.activeNodeId = null;
                patch.anchorNodeId = null;
                patch.selectionPivot = null;
            }
            if (target === 'tracks') patch.selectedTrackIds = [];
            if (target === 'keyframes') patch.selectedKeyframes = [];
            if (target === 'clipTimeline') patch.clipTimelineSelection = null;
            if (activeTarget === target) patch.activeTarget = 'none';
            set(patch);
        },

        // ── Housekeeping ────────────────────────────────────────────────────
        removeElementFromSelection(elementId) {
            const nodeId = resolveNodeIdForElement(elementId);
            if (nodeId) {
                const state = get();
                const next = state.selectedNodeIds.filter((id) => id !== nodeId);
                set({
                    selectedNodeIds: next,
                    activeTarget: state.activeTarget === 'elements' && !next.length ? 'none' : state.activeTarget,
                    selectionPivot: null,
                });
            }
            // Also remove any keyframes owned by this element's channels
            get().removeChannelsFromSelection(elementId);
        },
        renameElementInSelection(currentId, nextId) {
            void currentId;
            void nextId;
        },
        removeChannelsFromSelection(elementId) {
            const { selectedKeyframes, activeTarget } = get();
            const next = selectedKeyframes.filter((kf) => {
                const owner = resolveChannelTarget(kf.channelId)?.owner;
                return owner?.kind !== 'element' || owner.id !== elementId;
            });
            set({
                selectedKeyframes: next,
                activeTarget: activeTarget === 'keyframes' && !next.length ? 'none' : activeTarget,
            });
        },

        // ── Derived selectors ───────────────────────────────────────────────
        getActiveCommandTarget() {
            return get().activeTarget;
        },
        getSelectedElementIds() {
            return elementIdsForNodes(get().selectedNodeIds);
        },
        getInspectorContext() {
            const { activeTarget, selectedNodeIds, selectedKeyframes } = get();
            if (activeTarget === 'elements') return { elementIds: elementIdsForNodes(selectedNodeIds) };
            if (activeTarget === 'keyframes') return { elementIds: deriveElementIdsFromKeyframes(selectedKeyframes) };
            return { elementIds: [] };
        },
        getSelectedElementContextForKeyframes() {
            return deriveElementIdsFromKeyframes(get().selectedKeyframes);
        },
    }),
    shallow
);

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useVisualizer } from './VisualizerContext';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { useSceneStore, type BindingState, type ElementBindings } from '@state/sceneStore';
import {
    useSceneElements,
    useSceneSelection as useSceneSelectionStore,
    useSceneElementRecord,
    dispatchSceneCommand,
} from '@state/scene';
import type { SceneCommand, SceneCommandOptions } from '@state/scene';
import { deriveElementOrder } from '@state/scene-graph';
import { shallow } from 'zustand/shallow';
import {
    channelForTarget,
    elementPropertyTarget,
    findKeyframeAtTick,
    createKeyframe,
    DEFAULT_SEGMENT_INTERPOLATION,
    type AutomationValueType,
} from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { createDuplicateElementId } from './duplicateElementName';
import {
    SCENE_ROOT_ID,
    createDuplicateMappings,
    isNodeAncestor,
    isNodeEffectivelyLocked,
    normalizeNodeSelection,
    translationMatrix,
} from '@state/scene-graph';

export interface TrackInputDef {
    key: string;
    label: string;
    allowedTrackTypes?: Array<'midi' | 'audio'>;
    allowMultiple?: boolean;
}

export interface TrackInputPopupData {
    elementId: string;
    trackInputs: TrackInputDef[];
}

interface SceneSelectionState {
    selectedElementId: string | null;
    selectedNodeIds: string[];
    activeNodeId: string | null;
    editingContainerId: string;
    selectedElement: SelectedElementView | null;
    selectedElementSchema: any;
    propertyPanelRefresh: number; // increments to force property panel value refresh without full element identity change
    visualizer: any;
    elements: any[];
    trackInputPopup: TrackInputPopupData | null;
}

interface SceneSelectionActions {
    selectElement: (elementId: string | null) => void;
    selectNode: (nodeId: string, options?: { toggle?: boolean; range?: boolean; siblingIds?: string[] }) => void;
    groupSelectedNodes: () => void;
    ungroupSelectedNodes: () => void;
    duplicateSelectedNodes: () => void;
    deleteSelectedNodes: () => void;
    reorderSelectedNodes: (parentId: string, targetIndex: number) => void;
    reparentSelectedNodes: (newParentId: string, targetIndex: number) => void;
    enterGroup: (nodeId: string) => void;
    exitGroup: () => void;
    clearSelection: () => void;
    updateElementConfig: (
        elementId: string,
        changes: { [key: string]: any },
        options?: Omit<SceneCommandOptions, 'source'>
    ) => void;
    addElement: (elementType: string, initialConfig?: Record<string, unknown>) => void;
    incrementPropertyPanelRefresh: () => void;
    toggleElementVisibility: (elementId: string) => void;
    moveElement: (elementId: string, newIndex: number) => void;
    duplicateElement: (elementId: string) => void;
    deleteElement: (elementId: string) => void;
    updateElementId: (oldId: string, newId: string) => boolean;
    dismissTrackInputPopup: () => void;
}

interface SceneSelectionContextType extends SceneSelectionState, SceneSelectionActions {}

const SceneSelectionContext = createContext<SceneSelectionContextType | undefined>(undefined);

interface SelectedElementView {
    id: string;
    type: string;
    bindings: ElementBindings;
}

type OffsetBindingKey = 'offsetX' | 'offsetY';
type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

const ARROW_KEY_TO_OFFSET: Record<ArrowKey, { bindingKey: OffsetBindingKey; delta: number }> = {
    ArrowLeft: { bindingKey: 'offsetX', delta: -1 },
    ArrowRight: { bindingKey: 'offsetX', delta: 1 },
    ArrowUp: { bindingKey: 'offsetY', delta: -1 },
    ArrowDown: { bindingKey: 'offsetY', delta: 1 },
};

function readNumericBinding(binding: BindingState | undefined): number | null {
    if (!binding) return null;
    if (binding.type === 'constant') {
        return typeof binding.value === 'number' ? binding.value : null;
    }
    return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.isContentEditable) return true;
    const tag = element.tagName;
    if (!tag) return false;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    const role = element.getAttribute('role');
    return role === 'textbox' || role === 'combobox' || Boolean(element.closest('[role="tree"]'));
}

/** Infer AutomationValueType from a raw value for auto-key channel creation (canvas drag path). */
function inferValueTypeForAutoKey(value: unknown): AutomationValueType | null {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return null;
}

interface SceneSelectionProviderProps {
    children: React.ReactNode;
}

export function SceneSelectionProvider({ children }: SceneSelectionProviderProps) {
    const { visualizer } = useVisualizer() as any;
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [propertyPanelRefresh, setPropertyPanelRefresh] = useState(0);
    const [trackInputPopup, setTrackInputPopup] = useState<TrackInputPopupData | null>(null);

    const storeSelection = useSceneSelectionStore();
    const storeElements = useSceneElements();
    const graph = useSceneStore((state) => state.graph);
    const previousGraphRef = useRef(graph);
    const elementIdByNodeId = useSceneStore((state) => state.elementIdByNodeId, shallow);
    const selectedNodeIds = storeSelection.nodeIds;
    const activeNodeId = storeSelection.activeNodeId;
    const selectionPivot = useSelectionStore((state) => state.selectionPivot);
    const editingContainerId = storeSelection.editingContainerId ?? graph.rootId;
    const selectedElementId = activeNodeId ? (elementIdByNodeId[activeNodeId] ?? null) : storeSelection.primaryId;

    const selectedRecord = useSceneElementRecord(selectedElementId);
    const selectedBindings = useSceneStore(
        useCallback(
            (state) => (selectedElementId ? (state.bindings.byElement[selectedElementId] ?? {}) : {}),
            [selectedElementId]
        ),
        shallow
    );

    const selectedElement = useMemo<SelectedElementView | null>(() => {
        if (!selectedRecord) return null;
        return {
            id: selectedRecord.id,
            type: selectedRecord.type,
            bindings: selectedBindings,
        };
    }, [selectedRecord, selectedBindings]);

    const selectionSnapshotRef = useRef<{ elementId: string | null; bindings: ElementBindings }>({
        elementId: selectedElementId,
        bindings: selectedBindings,
    });

    useEffect(() => {
        selectionSnapshotRef.current = {
            elementId: selectedElementId,
            bindings: selectedBindings,
        };
    }, [selectedElementId, selectedBindings]);

    const updatePropertiesHeader = useCallback((element: any) => {
        const propertiesHeader = document.getElementById('propertiesHeader');
        if (propertiesHeader) {
            if (element) {
                const truncatedId = element.id.length > 15 ? element.id.substring(0, 12) + '...' : element.id;
                propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
                propertiesHeader.title = `Properties | ${element.id}`;
            } else {
                propertiesHeader.textContent = '⚙️ Properties';
                propertiesHeader.title = '';
            }
        }
    }, []);

    // (Moved below selectElement definition to avoid temporal dead zone)

    const selectNode = useCallback(
        (nodeId: string, options?: { toggle?: boolean; range?: boolean; siblingIds?: string[] }) => {
            const state = useSceneStore.getState();
            const normalized = normalizeNodeSelection(state.graph, [nodeId])[0];
            if (!normalized || isNodeEffectivelyLocked(state.graph, normalized)) return;
            const selection = useSelectionStore.getState();
            if (options?.range && options.siblingIds) {
                selection.selectSceneNodeRange(options.siblingIds, normalized);
            } else if (options?.toggle) {
                const current = selection.selectedNodeIds;
                const conflicting = current.filter(
                    (id) =>
                        id !== normalized &&
                        (isNodeAncestor(state.graph, id, normalized) || isNodeAncestor(state.graph, normalized, id))
                );
                if (conflicting.length) {
                    const next = current.filter((id) => !conflicting.includes(id) && id !== normalized);
                    selection.selectSceneNodes([...next, normalized], normalized);
                } else {
                    selection.toggleSceneNode(normalized);
                }
            } else {
                selection.selectSceneNodes([normalized], normalized);
            }
        },
        []
    );

    const selectElement = useCallback((elementId: string | null) => {
        if (!elementId) {
            useSelectionStore.getState().selectSceneNodes([], null);
            return;
        }
        const state = useSceneStore.getState();
        const nodeId = state.nodeIdByElementId[elementId];
        if (!nodeId || nodeId === state.graph.rootId) return;
        useSelectionStore.getState().selectSceneNodes([nodeId], nodeId);
    }, []);

    useEffect(() => {
        const selection = useSelectionStore.getState();
        selection.reconcileSceneNodes(graph, previousGraphRef.current);
        previousGraphRef.current = graph;
        const selected = useSelectionStore.getState().selectedNodeIds;
        const unlocked = selected.filter((id) => !isNodeEffectivelyLocked(graph, id));
        if (unlocked.length !== selected.length) {
            selection.selectSceneNodes(unlocked, unlocked.at(-1) ?? null);
        }
    }, [graph]);

    useEffect(() => {
        if (selectedElement) {
            const schema = sceneElementRegistry.getSchema(selectedElement.type);
            setSelectedElementSchema(schema ?? null);
            updatePropertiesHeader({ id: selectedElement.id });
        } else {
            setSelectedElementSchema(null);
            updatePropertiesHeader(null);
        }
    }, [selectedElement, updatePropertiesHeader]);

    const runtimeMeta = useSceneStore(
        useCallback(
            (state) => ({
                lastMutatedAt: state.runtimeMeta.lastMutatedAt,
                lastHydratedAt: state.runtimeMeta.lastHydratedAt,
            }),
            []
        ),
        shallow
    );
    const lastRuntimeMetaRef = useRef<typeof runtimeMeta | null>(runtimeMeta);

    useEffect(() => {
        const previous = lastRuntimeMetaRef.current;
        const hasPrevious = !!previous;
        const changed =
            !previous ||
            previous.lastMutatedAt !== runtimeMeta.lastMutatedAt ||
            previous.lastHydratedAt !== runtimeMeta.lastHydratedAt;
        if (changed && hasPrevious) {
            setPropertyPanelRefresh((prev) => prev + 1);
        }
        if (!previous || changed) {
            lastRuntimeMetaRef.current = runtimeMeta;
        }
    }, [runtimeMeta]);

    // Sync selection state down into the visualizer interaction state (single source of truth = React)
    useEffect(() => {
        if (!visualizer || typeof visualizer.setInteractionState !== 'function') return;
        // Only update if out of sync to avoid redundant invalidations
        const current = visualizer._interactionState?.selectedElementId;
        if (current !== selectedElementId) {
            visualizer.setInteractionState({ selectedElementId: selectedElementId || null });
        }
        visualizer.setInteractionState({ selectedNodeIds, selectionPivot });
        // When selection cleared, also clear dragging state if it references the previous element
        if (!selectedElementId && visualizer._interactionState?.draggingElementId) {
            visualizer.setInteractionState({ draggingElementId: null });
        }
    }, [visualizer, selectedElementId, selectedNodeIds, selectionPivot]);

    const clearSelection = useCallback(() => {
        selectElement(null);
    }, [selectElement]);

    const runSceneCommand = useCallback(
        (command: SceneCommand, source: string, options?: Omit<SceneCommandOptions, 'source'>) => {
            const result = dispatchSceneCommand(command, { source, ...options });
            if (!result.success) {
                console.warn(`[SceneSelectionContext] Command failed (${source})`, {
                    command,
                    error: result.error,
                });
                return false;
            }
            return true;
        },
        []
    );

    const updateElementConfig = useCallback(
        (elementId: string, changes: { [key: string]: any }, options?: Omit<SceneCommandOptions, 'source'>) => {
            if (!elementId) return;

            // For each property being changed, check if it has automation AND autoKeying is on.
            // If so, dispatch addKeyframe instead of overwriting the binding.
            const automation = useSceneStore.getState().automation;
            const currentTick = useTimelineStore.getState().timeline.currentTick;
            const autoKeying = useTimelineStore.getState().transport.autoKeying;
            const automatedKeys: string[] = [];
            const nonAutomatedChanges: Record<string, any> = {};

            for (const [key, value] of Object.entries(changes)) {
                const target = elementPropertyTarget(elementId, key);
                const channel = channelForTarget(automation, target);
                const chId = channel?.id;
                if (autoKeying && channel && chId) {
                    // Auto key ON + channel already exists: add a keyframe at current tick.
                    automatedKeys.push(key);
                    const existingKf = findKeyframeAtTick(channel.keyframes, currentTick);
                    const segmentInterpolation = existingKf?.segmentInterpolation ?? DEFAULT_SEGMENT_INTERPOLATION;
                    const leftHandleType = existingKf?.leftHandleType ?? ('auto_clamped' as const);
                    const rightHandleType = existingKf?.rightHandleType ?? ('auto_clamped' as const);
                    dispatchSceneCommand(
                        {
                            type: 'addKeyframe',
                            channelId: chId,
                            keyframe: {
                                tick: currentTick,
                                value,
                                segmentInterpolation: { ...segmentInterpolation },
                                leftHandleType,
                                rightHandleType,
                            },
                        },
                        {
                            source: 'SceneSelectionContext.updateElementConfig',
                            ...(options ?? {}),
                        }
                    );
                } else if (autoKeying && !channel) {
                    // Auto key ON + no channel yet: create automation channel with initial keyframe.
                    const valueType = inferValueTypeForAutoKey(value);
                    if (valueType) {
                        automatedKeys.push(key);
                        dispatchSceneCommand(
                            {
                                type: 'enablePropertyAutomation',
                                target: elementPropertyTarget(elementId, key),
                                valueType,
                                initialKeyframes: [createKeyframe(currentTick, value)],
                            },
                            {
                                source: 'SceneSelectionContext.updateElementConfig',
                                ...(options ?? {}),
                            }
                        );
                    } else {
                        nonAutomatedChanges[key] = value;
                    }
                } else if (!autoKeying && channel && chId) {
                    // Auto key OFF + channel exists: temporarily delink (Blender-style).
                    // Store an override so the new value shows immediately, but the keyframed
                    // binding is untouched — scrubbing the playhead clears the override.
                    useSceneStore.getState().setPropertyOverride(chId, value);
                } else {
                    nonAutomatedChanges[key] = value;
                }
            }

            // Dispatch updateElementConfig only for non-automated properties
            if (Object.keys(nonAutomatedChanges).length > 0) {
                const ok = runSceneCommand(
                    { type: 'updateElementConfig', elementId, patch: nonAutomatedChanges },
                    'SceneSelectionContext.updateElementConfig',
                    options
                );
                if (!ok) return;
            }

            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, visualizer]
    );

    const generateUniqueElementId = useCallback((elementType: string): string => {
        const schema = sceneElementRegistry.getSchema(elementType);
        const baseName = (schema as any)?.name?.trim() || elementType;
        const store = useSceneStore.getState();
        let n = 1;
        while (store.elements[`${baseName} ${n}`]) {
            n++;
        }
        return `${baseName} ${n}`;
    }, []);

    const addElement = useCallback(
        (elementType: string, initialConfig?: Record<string, unknown>) => {
            const uniqueId = generateUniqueElementId(elementType);
            const selectedId = useSelectionStore.getState().getSelectedElementIds()[0] ?? null;
            const currentOrder = deriveElementOrder(useSceneStore.getState().graph);
            const selectedIndex = selectedId != null ? currentOrder.indexOf(selectedId) : -1;
            const targetIndex = selectedIndex >= 0 ? selectedIndex + 1 : undefined;
            const created = runSceneCommand(
                { type: 'addElement', elementType, elementId: uniqueId, config: initialConfig, targetIndex },
                'SceneSelectionContext.addElement'
            );
            if (!created) return;

            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
            selectElement(uniqueId);

            // Check if the new element has track input properties
            const schema = sceneElementRegistry.getSchema(elementType) as any;
            if (schema) {
                const trackInputs: TrackInputDef[] = [];
                for (const group of schema.tabs?.flatMap((t: any) => t.groups) ?? []) {
                    for (const propDef of group.properties ?? []) {
                        if (propDef.type === 'timelineTrackRef') {
                            trackInputs.push({
                                key: propDef.key,
                                label: propDef.label,
                                allowedTrackTypes: propDef.allowedTrackTypes,
                                allowMultiple: propDef.allowMultiple,
                            });
                        }
                    }
                }
                if (trackInputs.length > 0) {
                    setTrackInputPopup({ elementId: uniqueId, trackInputs });
                }
            }
        },
        [generateUniqueElementId, runSceneCommand, visualizer, selectElement]
    );

    const incrementPropertyPanelRefresh = useCallback(() => {
        setPropertyPanelRefresh((prev) => prev + 1);
    }, []);

    // Actions migrated from hook
    const toggleElementVisibility = useCallback(
        (elementId: string) => {
            const store = useSceneStore.getState();
            const binding = store.bindings.byElement[elementId]?.visible;
            const currentVisible = binding && binding.type === 'constant' ? Boolean(binding.value) : true;
            const ok = runSceneCommand(
                { type: 'updateElementConfig', elementId, patch: { visible: !currentVisible } },
                'SceneSelectionContext.toggleElementVisibility'
            );
            if (!ok) return;
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            if (selectedElementId === elementId) selectElement(elementId);
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, visualizer, selectedElementId, selectElement]
    );

    const moveElement = useCallback(
        (elementId: string, newIndex: number) => {
            const ok = runSceneCommand(
                { type: 'moveElement', elementId, targetIndex: newIndex },
                'SceneSelectionContext.moveElement'
            );
            if (!ok) return;
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, visualizer]
    );

    const duplicateElement = useCallback(
        (elementId: string) => {
            const store = useSceneStore.getState();
            if (!store.elements[elementId]) return;
            const duplicateId = createDuplicateElementId(elementId, Object.keys(store.elements));
            const ok = runSceneCommand(
                { type: 'duplicateElement', sourceId: elementId, newId: duplicateId },
                'SceneSelectionContext.duplicateElement'
            );
            if (!ok) return;
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
            selectElement(duplicateId);
        },
        [runSceneCommand, visualizer, selectElement]
    );

    const deleteElement = useCallback(
        (elementId: string) => {
            const ok = runSceneCommand({ type: 'removeElement', elementId }, 'SceneSelectionContext.deleteElement');
            if (!ok) return;
            if (selectedElementId === elementId) selectElement(null);
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, selectedElementId, selectElement, visualizer]
    );

    const groupSelectedNodes = useCallback(() => {
        const scene = useSceneStore.getState();
        const nodeIds = normalizeNodeSelection(scene.graph, useSelectionStore.getState().selectedNodeIds);
        if (!nodeIds.length) return;
        let suffix = 1;
        let groupId = `group:${suffix}`;
        while (scene.graph.nodesById[groupId]) groupId = `group:${++suffix}`;
        const ok = runSceneCommand(
            { type: 'groupNodes', nodeIds, groupId, name: `Group ${suffix}` },
            'SceneSelectionContext.groupNodes'
        );
        if (!ok) return;
        useSelectionStore.getState().selectSceneNodes([groupId], groupId);
        visualizer?.invalidateRender?.();
    }, [runSceneCommand, visualizer]);

    const ungroupSelectedNodes = useCallback(() => {
        const scene = useSceneStore.getState();
        const selected = normalizeNodeSelection(scene.graph, useSelectionStore.getState().selectedNodeIds);
        const groupId =
            selected.length === 1 && scene.graph.nodesById[selected[0]]?.kind === 'group' ? selected[0] : null;
        if (!groupId) return;
        const group = scene.graph.nodesById[groupId];
        if (group.kind !== 'group') return;
        const children = [...group.children];
        const ok = runSceneCommand({ type: 'ungroupNode', nodeId: groupId }, 'SceneSelectionContext.ungroupNode');
        if (!ok) return;
        const current = useSceneStore.getState();
        useSelectionStore.getState().selectSceneNodes(children, children.at(-1) ?? null);
        visualizer?.invalidateRender?.();
    }, [runSceneCommand, visualizer]);

    const duplicateSelectedNodes = useCallback(() => {
        const scene = useSceneStore.getState();
        const nodeIds = normalizeNodeSelection(scene.graph, useSelectionStore.getState().selectedNodeIds);
        if (!nodeIds.length) return;
        const mappings = createDuplicateMappings(scene.graph, Object.keys(scene.elements), nodeIds);
        const ok = runSceneCommand(
            { type: 'duplicateSubtrees', nodeIds, mappings },
            'SceneSelectionContext.duplicateSubtrees'
        );
        if (!ok) return;
        const created = nodeIds.map((id) => mappings.nodeIdMap[id]).filter(Boolean);
        useSelectionStore.getState().selectSceneNodes(created, created.at(-1) ?? null);
        visualizer?.invalidateRender?.();
    }, [runSceneCommand, visualizer]);

    const deleteSelectedNodes = useCallback(() => {
        const scene = useSceneStore.getState();
        const nodeIds = normalizeNodeSelection(scene.graph, useSelectionStore.getState().selectedNodeIds);
        if (!nodeIds.length) return;
        const parentId = scene.graph.nodesById[nodeIds[0]]?.parentId ?? scene.graph.rootId;
        const ok = runSceneCommand({ type: 'deleteSubtrees', nodeIds }, 'SceneSelectionContext.deleteSubtrees');
        if (!ok) return;
        useSelectionStore.getState().selectSceneNodes([], null);
        useSelectionStore
            .getState()
            .setEditingContainerId(useSceneStore.getState().graph.nodesById[parentId] ? parentId : SCENE_ROOT_ID);
        visualizer?.invalidateRender?.();
    }, [runSceneCommand, visualizer]);

    const reorderSelectedNodes = useCallback(
        (parentId: string, targetIndex: number) => {
            const nodeIds = useSelectionStore.getState().selectedNodeIds;
            if (!nodeIds.length) return;
            if (
                runSceneCommand(
                    { type: 'reorderNodes', parentId, nodeIds, targetIndex },
                    'SceneSelectionContext.reorderNodes'
                )
            ) {
                visualizer?.invalidateRender?.();
            }
        },
        [runSceneCommand, visualizer]
    );

    const reparentSelectedNodes = useCallback(
        (newParentId: string, targetIndex: number) => {
            const nodeIds = normalizeNodeSelection(
                useSceneStore.getState().graph,
                useSelectionStore.getState().selectedNodeIds
            );
            if (!nodeIds.length) return;
            if (
                runSceneCommand(
                    { type: 'reparentNodes', nodeIds, newParentId, targetIndex },
                    'SceneSelectionContext.reparentNodes'
                )
            ) {
                visualizer?.invalidateRender?.();
            }
        },
        [runSceneCommand, visualizer]
    );

    const enterGroup = useCallback((nodeId: string) => {
        const graph = useSceneStore.getState().graph;
        if (graph.nodesById[nodeId]?.kind !== 'group' || isNodeEffectivelyLocked(graph, nodeId)) return;
        useSelectionStore.getState().setEditingContainerId(nodeId);
        useSelectionStore.getState().selectSceneNodes([], null);
    }, []);

    const exitGroup = useCallback(() => {
        const scene = useSceneStore.getState();
        const current = useSelectionStore.getState().editingContainerId ?? scene.graph.rootId;
        useSelectionStore
            .getState()
            .setEditingContainerId(scene.graph.nodesById[current]?.parentId ?? scene.graph.rootId);
    }, []);

    const updateElementId = useCallback(
        (oldId: string, newId: string): boolean => {
            const store = useSceneStore.getState();
            if (store.elements[newId] && newId !== oldId) {
                alert(`Element with ID "${newId}" already exists. Please choose a different ID.`);
                return false;
            }
            const ok = runSceneCommand(
                { type: 'updateElementId', currentId: oldId, nextId: newId },
                'SceneSelectionContext.updateElementId'
            );
            if (!ok) {
                alert('Failed to update element ID. Please try again.');
                return false;
            }
            if (selectedElementId === oldId) selectElement(newId);
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
            return true;
        },
        [runSceneCommand, visualizer, selectedElementId, selectElement]
    );

    const dismissTrackInputPopup = useCallback(() => {
        setTrackInputPopup(null);
    }, []);

    const contextValue: SceneSelectionContextType = {
        selectedElementId,
        selectedNodeIds,
        activeNodeId,
        editingContainerId,
        selectedElement,
        selectedElementSchema,
        propertyPanelRefresh,
        visualizer,
        elements: storeElements,
        trackInputPopup,
        selectElement,
        selectNode,
        groupSelectedNodes,
        ungroupSelectedNodes,
        duplicateSelectedNodes,
        deleteSelectedNodes,
        reorderSelectedNodes,
        reparentSelectedNodes,
        enterGroup,
        exitGroup,
        clearSelection,
        updateElementConfig,
        addElement,
        incrementPropertyPanelRefresh,
        toggleElementVisibility,
        moveElement,
        duplicateElement,
        deleteElement,
        updateElementId,
        dismissTrackInputPopup,
    };

    useEffect(() => {
        const handleArrowKey = (event: KeyboardEvent) => {
            if (event.altKey || isEditableTarget(event.target)) return;
            const selected = useSelectionStore.getState().selectedNodeIds;
            if ((event.key === 'Backspace' || event.key === 'Delete') && selected.length) {
                event.preventDefault();
                deleteSelectedNodes();
                return;
            }
            if (event.key === 'Escape' && selected.length) {
                event.preventDefault();
                useSelectionStore.getState().selectSceneNodes([], null);
                return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g' && selected.length) {
                event.preventDefault();
                if (event.shiftKey) ungroupSelectedNodes();
                else groupSelectedNodes();
                return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selected.length) {
                event.preventDefault();
                duplicateSelectedNodes();
                return;
            }
            if (event.metaKey || event.ctrlKey) return;
            const mapping = ARROW_KEY_TO_OFFSET[event.key as ArrowKey];
            if (!mapping) return;

            const nodeIds = useSelectionStore.getState().selectedNodeIds;
            if (nodeIds.length) {
                event.preventDefault();
                const amount = event.shiftKey ? 10 : 1;
                const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
                const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
                runSceneCommand(
                    { type: 'transformNodes', nodeIds, worldDelta: translationMatrix(dx, dy) },
                    'SceneSelectionContext.nudgeNodes',
                    { mergeKey: `keyboard-node-nudge:${nodeIds.join(',')}` }
                );
                visualizer?.invalidateRender?.();
                return;
            }

            const { elementId, bindings } = selectionSnapshotRef.current;
            if (!elementId) return;

            const targetBinding = bindings?.[mapping.bindingKey];
            if (targetBinding && targetBinding.type !== 'constant') return;

            event.preventDefault();
            const currentValue = readNumericBinding(targetBinding) ?? 0;
            const nextValue = currentValue + mapping.delta;

            updateElementConfig(
                elementId,
                { [mapping.bindingKey]: { type: 'constant', value: nextValue } },
                { mergeKey: `keyboard-offset:${elementId}:${mapping.bindingKey}` }
            );
        };

        window.addEventListener('keydown', handleArrowKey, { capture: true });
        return () => window.removeEventListener('keydown', handleArrowKey, { capture: true } as any);
    }, [
        deleteSelectedNodes,
        duplicateSelectedNodes,
        groupSelectedNodes,
        runSceneCommand,
        ungroupSelectedNodes,
        updateElementConfig,
        visualizer,
    ]);

    return <SceneSelectionContext.Provider value={contextValue}>{children}</SceneSelectionContext.Provider>;
}

export const useSceneSelection = () => {
    const context = useContext(SceneSelectionContext);
    if (context === undefined) {
        throw new Error('useSceneSelection must be used within a SceneSelectionProvider');
    }
    return context;
};

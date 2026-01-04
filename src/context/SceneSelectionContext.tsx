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
import { shallow } from 'zustand/shallow';

interface SceneSelectionState {
    selectedElementId: string | null;
    selectedElement: SelectedElementView | null;
    selectedElementSchema: any;
    propertyPanelRefresh: number; // increments to force property panel value refresh without full element identity change
    visualizer: any;
    elements: any[];
}

interface SceneSelectionActions {
    selectElement: (elementId: string | null) => void;
    clearSelection: () => void;
    updateElementConfig: (
        elementId: string,
        changes: { [key: string]: any },
        options?: Omit<SceneCommandOptions, 'source'>,
    ) => void;
    addElement: (elementType: string) => void;
    incrementPropertyPanelRefresh: () => void;
    toggleElementVisibility: (elementId: string) => void;
    moveElement: (elementId: string, newIndex: number) => void;
    duplicateElement: (elementId: string) => void;
    deleteElement: (elementId: string) => void;
    updateElementId: (oldId: string, newId: string) => boolean;
}

interface SceneSelectionContextType extends SceneSelectionState, SceneSelectionActions { }

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
    return role === 'textbox' || role === 'combobox';
}

interface SceneSelectionProviderProps {
    children: React.ReactNode;
}

export function SceneSelectionProvider({ children }: SceneSelectionProviderProps) {
    const { visualizer } = useVisualizer() as any;
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [propertyPanelRefresh, setPropertyPanelRefresh] = useState(0);

    const storeSelection = useSceneSelectionStore();
    const storeElements = useSceneElements();
    const selectedElementId = storeSelection.primaryId;

    const selectedRecord = useSceneElementRecord(selectedElementId);
    const selectedBindings = useSceneStore(
        useCallback(
            (state) => (selectedElementId ? state.bindings.byElement[selectedElementId] ?? {} : {}),
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

    const selectionSnapshotRef = useRef<{ elementId: string | null; bindings: ElementBindings }>(
        { elementId: selectedElementId, bindings: selectedBindings }
    );

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

    const selectElement = useCallback((elementId: string | null) => {
        const normalized = elementId ?? null;
        useSceneStore.getState().setInteractionState({ selectedElementIds: normalized ? [normalized] : [] });
    }, []);

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
        // When selection cleared, also clear dragging state if it references the previous element
        if (!selectedElementId && visualizer._interactionState?.draggingElementId) {
            visualizer.setInteractionState({ draggingElementId: null });
        }
    }, [visualizer, selectedElementId]);

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
            const ok = runSceneCommand(
                { type: 'updateElementConfig', elementId, patch: changes },
                'SceneSelectionContext.updateElementConfig',
                options,
            );
            if (!ok) return;
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, visualizer]
    );

    const generateUniqueElementId = useCallback((elementType: string): string => {
        const base = `${elementType}_${Math.random().toString(36).slice(2, 8)}`;
        const store = useSceneStore.getState();
        let candidate = base;
        let attempt = 1;
        while (store.elements[candidate]) {
            candidate = `${base}_${attempt++}`;
        }
        return candidate;
    }, []);

    const addElement = useCallback(
        (elementType: string) => {
            const uniqueId = generateUniqueElementId(elementType);
            const created = runSceneCommand(
                { type: 'addElement', elementType, elementId: uniqueId },
                'SceneSelectionContext.addElement'
            );
            if (!created) return;

            const store = useSceneStore.getState();
            const maxZ = store.order.reduce((acc, id) => {
                const binding = store.bindings.byElement[id]?.zIndex;
                const z = readNumericBinding(binding);
                return z !== null && z > acc ? z : acc;
            }, Number.NEGATIVE_INFINITY);
            const nextZ = Number.isFinite(maxZ) ? maxZ + 1 : 0;

            runSceneCommand(
                { type: 'updateElementConfig', elementId: uniqueId, patch: { zIndex: nextZ } },
                'SceneSelectionContext.addElement:zIndex'
            );

            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
            selectElement(uniqueId);
        },
        [generateUniqueElementId, runSceneCommand, visualizer, selectElement]
    );

    const incrementPropertyPanelRefresh = useCallback(() => {
        setPropertyPanelRefresh(prev => prev + 1);
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
            const baseId = elementId.replace(/_copy_\d+$/, '');
            let duplicateId = `${baseId}_copy`;
            let counter = 1;
            while (store.elements[duplicateId]) {
                duplicateId = `${baseId}_copy_${counter++}`;
            }
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
            if (!window.confirm(`Delete element "${elementId}"?`)) return;
            const ok = runSceneCommand(
                { type: 'removeElement', elementId },
                'SceneSelectionContext.deleteElement'
            );
            if (!ok) return;
            if (selectedElementId === elementId) selectElement(null);
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, selectedElementId, selectElement, visualizer]
    );

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

    const contextValue: SceneSelectionContextType = {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        propertyPanelRefresh,
        visualizer,
        elements: storeElements,
        selectElement,
        clearSelection,
        updateElementConfig,
        addElement,
        incrementPropertyPanelRefresh,
        toggleElementVisibility,
        moveElement,
        duplicateElement,
        deleteElement,
        updateElementId,
    };

    useEffect(() => {
        const handleArrowKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const mapping = ARROW_KEY_TO_OFFSET[event.key as ArrowKey];
            if (!mapping) return;
            if (isEditableTarget(event.target)) return;

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
    }, [updateElementConfig]);

    return (
        <SceneSelectionContext.Provider value={contextValue}>
            {children}
        </SceneSelectionContext.Provider>
    );
}

export const useSceneSelection = () => {
    const context = useContext(SceneSelectionContext);
    if (context === undefined) {
        throw new Error('useSceneSelection must be used within a SceneSelectionProvider');
    }
    return context;
};

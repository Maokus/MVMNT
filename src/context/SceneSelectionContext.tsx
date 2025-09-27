import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useVisualizer } from './VisualizerContext';
import type { HybridSceneBuilder } from '@core/scene-builder';
import { useSceneStore, type BindingState } from '@state/sceneStore';
import { useSceneElements, useSceneSelection as useSceneSelectionStore, dispatchSceneCommand } from '@state/scene';
import type { SceneCommand } from '@state/scene';

interface SceneSelectionState {
    selectedElementId: string | null;
    selectedElement: any;
    selectedElementSchema: any;
    propertyPanelRefresh: number; // increments to force property panel value refresh without full element identity change
    visualizer: any;
    elements: any[];
    sceneBuilder: HybridSceneBuilder | null;
}

interface SceneSelectionActions {
    selectElement: (elementId: string | null) => void;
    clearSelection: () => void;
    updateElementConfig: (elementId: string, changes: { [key: string]: any }) => void;
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

function readNumericBinding(binding: BindingState | undefined): number | null {
    if (!binding) return null;
    if (binding.type === 'constant') {
        return typeof binding.value === 'number' ? binding.value : null;
    }
    return null;
}

interface SceneSelectionProviderProps {
    children: React.ReactNode;
}

export function SceneSelectionProvider({ children }: SceneSelectionProviderProps) {
    const { visualizer } = useVisualizer() as any;
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [propertyPanelRefresh, setPropertyPanelRefresh] = useState(0);

    const storeSelection = useSceneSelectionStore();
    const storeElements = useSceneElements();
    const selectedElementId = storeSelection.primaryId;

    // New state moved from useSceneElementPanel
    const [sceneBuilder, setSceneBuilder] = useState<HybridSceneBuilder | null>(null);
    const builderRef = useRef<HybridSceneBuilder | null>(null);

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

    // Initialize scene builder (moved from hook)
    useEffect(() => {
        if (!visualizer) {
            setSceneBuilder(null);
            builderRef.current = null;
            return;
        }
        try {
            if (typeof visualizer.getSceneBuilder !== 'function') {
                setSceneBuilder(null);
                builderRef.current = null;
                return;
            }
            const builder = visualizer.getSceneBuilder();
            setSceneBuilder(builder ?? null);
            builderRef.current = builder ?? null;
            if (builder) {
                console.log('Scene builder initialized in SceneSelectionContext:', builder);
            }
        } catch (e: any) {
            console.error('Error initializing scene builder:', e);
            setSceneBuilder(null);
            builderRef.current = null;
        }
    }, [visualizer]);

    // (Moved below selectElement definition to avoid temporal dead zone)

    const selectElement = useCallback((elementId: string | null) => {
        const normalized = elementId ?? null;
        useSceneStore.getState().setInteractionState({ selectedElementIds: normalized ? [normalized] : [] });
    }, []);

    useEffect(() => {
        if (!sceneBuilder) {
            setSelectedElement(null);
            setSelectedElementSchema(null);
            updatePropertiesHeader(null);
            return;
        }

        if (selectedElementId) {
            const element = sceneBuilder.getElement(selectedElementId);
            const schema = sceneBuilder.sceneElementRegistry?.getSchema(element?.type);
            setSelectedElement(element ?? null);
            setSelectedElementSchema(schema ?? null);
            updatePropertiesHeader(element ?? null);
        } else {
            setSelectedElement(null);
            setSelectedElementSchema(null);
            updatePropertiesHeader(null);
        }
    }, [sceneBuilder, selectedElementId, updatePropertiesHeader]);

    // Listen for external scene-refresh events (e.g., load/save/clear/new scene actions)
    useEffect(() => {
        const handler = () => {
            if (selectedElementId && !builderRef.current?.getElement(selectedElementId)) {
                selectElement(null);
            }
            setPropertyPanelRefresh((prev) => prev + 1);
        };
        window.addEventListener('scene-refresh', handler);
        return () => window.removeEventListener('scene-refresh', handler);
    }, [selectedElementId, selectElement]);

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
        (command: SceneCommand, source: string) => {
            const builder = builderRef.current;
            const result = builder
                ? dispatchSceneCommand(builder, command, { source })
                : dispatchSceneCommand(command, { source });
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
        (elementId: string, changes: { [key: string]: any }) => {
            if (!elementId) return;
            const ok = runSceneCommand(
                { type: 'updateElementConfig', elementId, patch: changes },
                'SceneSelectionContext.updateElementConfig'
            );
            if (!ok) return;
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            if (builderRef.current && selectedElementId === elementId) {
                try {
                    const updated = builderRef.current.getElement(elementId);
                    if (updated) setSelectedElement(updated);
                } catch {}
            }
            setPropertyPanelRefresh((prev) => prev + 1);
        },
        [runSceneCommand, visualizer, selectedElementId]
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

    // Scene Builder integration log (existing effect kept minimal)
    useEffect(() => {
        if (sceneBuilder) {
            console.log('Scene builder integrated with React context');
        }
    }, [sceneBuilder]);

    const contextValue: SceneSelectionContextType = {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        propertyPanelRefresh,
        visualizer,
        elements: storeElements,
        sceneBuilder,
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

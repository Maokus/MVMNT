import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useVisualizer } from './VisualizerContext';
import { HybridSceneBuilder } from '@core/scene-builder';
import { useSceneStore } from '@state/sceneStore';
import { useSceneElements, useSceneSelection as useSceneSelectionStore, dispatchSceneCommand } from '@state/scene';
import { enableSceneStoreUI, flags } from '../config/featureFlags';

interface SceneSelectionState {
    selectedElementId: string | null;
    selectedElement: any;
    selectedElementSchema: any;
    refreshTrigger: number;
    propertyPanelRefresh: number; // increments to force property panel value refresh without full element identity change
    visualizer: any;
    elements: any[]; // Sorted list for display (highest z-index first)
    sceneBuilder: any;
    error: string | null;
}

interface SceneSelectionActions {
    selectElement: (elementId: string | null) => void;
    clearSelection: () => void;
    updateElementConfig: (elementId: string, changes: { [key: string]: any }) => void;
    addElement: (elementType: string) => void;
    incrementRefreshTrigger: () => void;
    incrementPropertyPanelRefresh: () => void;
    toggleElementVisibility: (elementId: string) => void;
    moveElement: (elementId: string, newIndex: number) => void;
    duplicateElement: (elementId: string) => void;
    deleteElement: (elementId: string) => void;
    updateElementId: (oldId: string, newId: string) => boolean;
    refreshElements: () => void;
}

interface SceneSelectionContextType extends SceneSelectionState, SceneSelectionActions { }

const SceneSelectionContext = createContext<SceneSelectionContextType | undefined>(undefined);

interface SceneSelectionProviderProps {
    children: React.ReactNode;
    sceneRefreshTrigger?: number;
}

export function SceneSelectionProvider({ children, sceneRefreshTrigger }: SceneSelectionProviderProps) {
    const { visualizer } = useVisualizer() as any;
    const [legacySelectedElementId, setLegacySelectedElementId] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [propertyPanelRefresh, setPropertyPanelRefresh] = useState(0);

    const storeSelection = useSceneSelectionStore();
    const storeElements = useSceneElements();
    const selectedElementId = enableSceneStoreUI ? storeSelection.primaryId : legacySelectedElementId;

    useEffect(() => {
        if (!enableSceneStoreUI) return;
        const normalized = storeSelection.primaryId ?? null;
        setLegacySelectedElementId(prev => (prev === normalized ? prev : normalized));
    }, [storeSelection.primaryId]);

    // New state moved from useSceneElementPanel
    const [elements, setElements] = useState<any[]>([]);
    const [sceneBuilder, setSceneBuilder] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

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

    // Refresh elements list with consistent sorting
    const refreshElements = useCallback(() => {
        if (!sceneBuilder) return;
        try {
            if (enableSceneStoreUI && storeElements.length > 0) {
                const ordered = storeElements
                    .map((entry) => sceneBuilder.getElement(entry.id))
                    .filter((el): el is any => Boolean(el));
                setElements(ordered);
                setError(null);
                return;
            }

            const elementsList = sceneBuilder.elements || [];
            const sortedForDisplay = [...elementsList].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
            setElements(sortedForDisplay);
            setError(null);
        } catch (e: any) {
            console.error('Error refreshing elements:', e);
            setError('Failed to refresh elements: ' + (e instanceof Error ? e.message : String(e)));
        }
    }, [sceneBuilder, storeElements]);

    // Initialize scene builder (moved from hook)
    useEffect(() => {
        if (!visualizer) {
            setSceneBuilder(null);
            return;
        }
        try {
            setError(null);
            if (typeof visualizer.getSceneBuilder !== 'function') {
                setError('Visualizer does not expose getSceneBuilder');
                setSceneBuilder(null);
                return;
            }
            const builder = visualizer.getSceneBuilder();
            if (!builder) {
                setSceneBuilder(null);
                return;
            }
            setSceneBuilder(builder);
            console.log('Scene builder initialized in SceneSelectionContext:', builder);
            console.log(flags);
        } catch (e: any) {
            console.error('Error initializing scene builder:', e);
            setError('Failed to initialize scene builder: ' + (e instanceof Error ? e.message : String(e)));
        }
    }, [visualizer]);

    // Refresh when builder or triggers change
    useEffect(() => {
        if (sceneBuilder) refreshElements();
    }, [sceneBuilder, refreshTrigger, refreshElements]);

    // (Moved below selectElement definition to avoid temporal dead zone)

    const selectElement = useCallback((elementId: string | null) => {
        const normalized = elementId ?? null;
        setLegacySelectedElementId(normalized);
        if (enableSceneStoreUI) {
            useSceneStore.getState().setInteractionState({ selectedElementIds: normalized ? [normalized] : [] });
        }
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
            refreshElements();
            if (selectedElementId && !sceneBuilder?.getElement(selectedElementId)) {
                selectElement(null);
            }
        };
        window.addEventListener('scene-refresh', handler);
        return () => window.removeEventListener('scene-refresh', handler);
    }, [refreshElements, selectedElementId, sceneBuilder, selectElement]);

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

    const updateElementConfig = useCallback((elementId: string, changes: { [key: string]: any }) => {
        if (!elementId || !sceneBuilder) return;
        const result = dispatchSceneCommand(
            sceneBuilder,
            { type: 'updateElementConfig', elementId, patch: changes },
            { source: 'SceneSelectionContext.updateElementConfig' }
        );
        if (!result.success) {
            console.warn('Failed to update element config', { elementId, changes, error: result.error });
            return;
        }
        if (visualizer?.invalidateRender) visualizer.invalidateRender();
        if (selectedElementId === elementId) {
            const updated = sceneBuilder.getElement(elementId);
            if (updated) setSelectedElement(updated);
        }
        if ('zIndex' in changes || 'visible' in changes) refreshElements();
        setRefreshTrigger((prev) => prev + 1);
    }, [sceneBuilder, visualizer, selectedElementId, refreshElements]);

    const addElement = useCallback((elementType: string) => {
        if (!sceneBuilder) return;
        const uniqueId = `${elementType}_${Date.now()}`;
        const result = dispatchSceneCommand(
            sceneBuilder,
            { type: 'addElement', elementType, elementId: uniqueId },
            { source: 'SceneSelectionContext.addElement' }
        );
        if (!result.success) {
            console.warn('Failed to add element', { elementType, error: result.error });
            return;
        }
        const allElements = (sceneBuilder as HybridSceneBuilder).getAllElements();
        let maxZ = Number.NEGATIVE_INFINITY;
        for (const el of allElements || []) {
            if (!el || el.id === uniqueId) continue;
            let z: any = el.zIndex;
            if (z && typeof z === 'object' && 'type' in z && (z as any).type === 'constant' && 'value' in z) {
                z = (z as any).value;
            }
            if (typeof z !== 'number' || !isFinite(z)) z = 0;
            if (z > maxZ) maxZ = z;
        }
        const initialZ = isFinite(maxZ) ? maxZ + 1 : 0;
        dispatchSceneCommand(
            sceneBuilder,
            { type: 'updateElementConfig', elementId: uniqueId, patch: { zIndex: initialZ } },
            { source: 'SceneSelectionContext.addElement:zIndex' }
        );
        if (visualizer?.invalidateRender) visualizer.invalidateRender();
        refreshElements();
        setRefreshTrigger((prev) => prev + 1);
        selectElement(uniqueId);
    }, [sceneBuilder, visualizer, refreshElements, selectElement]);

    const incrementRefreshTrigger = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    const incrementPropertyPanelRefresh = useCallback(() => {
        setPropertyPanelRefresh(prev => prev + 1);
    }, []);

    // Actions migrated from hook
    const toggleElementVisibility = useCallback((elementId: string) => {
        if (!sceneBuilder) return;
        const currentConfig = sceneBuilder.getElementConfig?.(elementId);
        if (!currentConfig) return;
        const newVisibility = !currentConfig.visible;
        const result = dispatchSceneCommand(
            sceneBuilder,
            { type: 'updateElementConfig', elementId, patch: { visible: newVisibility } },
            { source: 'SceneSelectionContext.toggleElementVisibility' }
        );
        if (!result.success) {
            console.warn('Failed to toggle visibility', { elementId, error: result.error });
            return;
        }
        refreshElements();
        if (visualizer?.invalidateRender) visualizer.invalidateRender();
        if (selectedElementId === elementId) selectElement(elementId);
    }, [sceneBuilder, visualizer, refreshElements, selectedElementId, selectElement]);

    const moveElement = useCallback((elementId: string, newIndex: number) => {
        if (!sceneBuilder) return;
        const element = sceneBuilder.getElement(elementId);
        if (!element) return;
        const fullList: any[] = (sceneBuilder.elements || []).slice();
        // Build enriched list with normalized zIndex WITHOUT mutating underlying getter-only properties
        const enriched = fullList.map((el, i) => {
            let z = el.zIndex; // use getter
            if (z && typeof z === 'object' && 'type' in z && (z as any).type === 'constant' && 'value' in z) {
                z = (z as any).value;
            }
            if (typeof z !== 'number' || !isFinite(z)) z = 0;
            return { el, i, normZ: z };
        });
        enriched.sort((a, b) => {
            const dz = (b.normZ || 0) - (a.normZ || 0);
            return dz !== 0 ? dz : a.i - b.i;
        });
        const displayList = enriched.map(e => e.el);
        const currentIndex = displayList.findIndex(el => el.id === elementId);
        if (currentIndex === -1) return;
        const clampedNewIndex = Math.max(0, Math.min(newIndex, displayList.length - 1));
        if (clampedNewIndex === currentIndex) return;
        const movingUp = clampedNewIndex < currentIndex;
        const targetNeighbor = displayList[clampedNewIndex];
        if (!targetNeighbor) return;
        const oldZ = element.zIndex || 0;
        let desiredZ: number;
        if (movingUp) desiredZ = (targetNeighbor.zIndex || 0) + 1; else desiredZ = (targetNeighbor.zIndex || 0) - 1;
        if (desiredZ === oldZ) return;
        const taken = new Map<number, any>();
        for (const el of fullList) {
            let z = el.zIndex;
            if (typeof z !== 'number' || !isFinite(z)) z = 0;
            if (el.id !== elementId) taken.set(z || 0, el);
        }
        const direction = movingUp ? 1 : -1;
        let finalZ = desiredZ;
        const chain: any[] = [];
        while (taken.has(finalZ)) {
            const blocking = taken.get(finalZ);
            chain.push(blocking);
            finalZ += direction;
            if (chain.length > fullList.length + 5) break;
        }
        // Guard: if desiredZ already occupied by an element with same id (shouldn't happen) skip
        const primaryUpdate = dispatchSceneCommand(
            sceneBuilder,
            { type: 'updateElementConfig', elementId, patch: { zIndex: desiredZ } },
            { source: 'SceneSelectionContext.moveElement' }
        );
        if (!primaryUpdate.success) {
            console.warn('Failed to move element (primary zIndex update failed)', {
                elementId,
                desiredZ,
                error: primaryUpdate.error,
            });
            return;
        }
        let nextZ = desiredZ + direction;
        for (const blocker of chain) {
            let blockerZ = blocker.zIndex;
            if (blockerZ && typeof blockerZ === 'object' && 'type' in blockerZ && (blockerZ as any).type === 'constant') {
                blockerZ = (blockerZ as any).value;
            }
            if (blocker.id && blockerZ !== nextZ) {
                const blockerResult = dispatchSceneCommand(
                    sceneBuilder,
                    { type: 'updateElementConfig', elementId: blocker.id, patch: { zIndex: nextZ } },
                    { source: 'SceneSelectionContext.moveElement:chain' }
                );
                if (!blockerResult.success) {
                    console.warn('Failed to shift blocker zIndex', {
                        blockerId: blocker.id,
                        nextZ,
                        error: blockerResult.error,
                    });
                }
            }
            nextZ += direction;
        }
        if (visualizer?.invalidateRender) visualizer.invalidateRender();
        refreshElements();
        selectElement(null);
    }, [sceneBuilder, visualizer, refreshElements, selectElement,]);

    const duplicateElement = useCallback((elementId: string) => {
        if (!sceneBuilder) return;
        const element = sceneBuilder.getElement(elementId);
        if (!element) return;
        const baseId = element.id.replace(/_copy_\d+$/, '');
        let duplicateId = `${baseId}_copy`;
        let counter = 1;
        while (sceneBuilder.getElement(duplicateId)) {
            duplicateId = `${baseId}_copy_${counter}`;
            counter++;
        }
        const result = dispatchSceneCommand(
            sceneBuilder,
            { type: 'duplicateElement', sourceId: elementId, newId: duplicateId },
            { source: 'SceneSelectionContext.duplicateElement' }
        );
        if (!result.success) {
            console.warn('Failed to duplicate element', { elementId, error: result.error });
            return;
        }
        refreshElements();
        if (visualizer?.invalidateRender) visualizer.invalidateRender();
        selectElement(duplicateId);
    }, [sceneBuilder, visualizer, refreshElements, selectElement]);

    const deleteElement = useCallback((elementId: string) => {
        if (!sceneBuilder) return;
        if (window.confirm(`Delete element "${elementId}"?`)) {
            const result = dispatchSceneCommand(
                sceneBuilder,
                { type: 'removeElement', elementId },
                { source: 'SceneSelectionContext.deleteElement' }
            );
            if (!result.success) {
                console.warn('Failed to delete element', { elementId, error: result.error });
                return;
            }
            if (selectedElementId === elementId) selectElement(null);
            refreshElements();
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
        }
    }, [sceneBuilder, visualizer, refreshElements, selectedElementId, selectElement]);

    const updateElementId = useCallback((oldId: string, newId: string): boolean => {
        if (!sceneBuilder) return false;
        const existingElement = sceneBuilder.getElement(newId);
        if (existingElement && existingElement.id !== oldId) {
            alert(`Element with ID "${newId}" already exists. Please choose a different ID.`);
            return false;
        }
        const result = dispatchSceneCommand(
            sceneBuilder,
            { type: 'updateElementId', currentId: oldId, nextId: newId },
            { source: 'SceneSelectionContext.updateElementId' }
        );
        if (!result.success) {
            alert('Failed to update element ID. Please try again.');
            console.warn('Failed to update element ID', { oldId, newId, error: result.error });
            return false;
        }
        if (selectedElementId === oldId) selectElement(newId);
        refreshElements();
        if (visualizer?.invalidateRender) visualizer.invalidateRender();
        return true;
    }, [sceneBuilder, refreshElements, visualizer, selectedElementId, selectElement]);

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
        refreshTrigger: refreshTrigger + (sceneRefreshTrigger || 0),
        propertyPanelRefresh,
        visualizer,
        elements,
        sceneBuilder,
        error,
        selectElement,
        clearSelection,
        updateElementConfig,
        addElement,
        incrementRefreshTrigger,
        incrementPropertyPanelRefresh,
        toggleElementVisibility,
        moveElement,
        duplicateElement,
        deleteElement,
        updateElementId,
        refreshElements
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

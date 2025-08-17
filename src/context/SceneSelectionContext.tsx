import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useVisualizer } from './VisualizerContext';

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
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [propertyPanelRefresh, setPropertyPanelRefresh] = useState(0);

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
            const elementsList = sceneBuilder.elements || [];
            const sortedForDisplay = [...elementsList].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
            setElements(sortedForDisplay);
            setError(null);
        } catch (e: any) {
            console.error('Error refreshing elements:', e);
            setError('Failed to refresh elements: ' + (e instanceof Error ? e.message : String(e)));
        }
    }, [sceneBuilder]);

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
        setSelectedElementId(elementId);
        if (elementId && sceneBuilder) {
            const element = sceneBuilder.getElement(elementId);
            const schema = sceneBuilder.sceneElementRegistry?.getSchema(element?.type);
            setSelectedElement(element);
            setSelectedElementSchema(schema);
            updatePropertiesHeader(element);
        } else {
            setSelectedElement(null);
            setSelectedElementSchema(null);
            updatePropertiesHeader(null);
        }
    }, [sceneBuilder, updatePropertiesHeader]);

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
        if (typeof sceneBuilder.updateElementConfig === 'function') {
            const success = sceneBuilder.updateElementConfig(elementId, changes);
            if (success) {
                if (visualizer?.invalidateRender) visualizer.invalidateRender();
                if (selectedElementId === elementId) {
                    const updated = sceneBuilder.getElement(elementId);
                    if (updated) setSelectedElement(updated);
                }
                // If changes might affect ordering (zIndex/visibility), refresh
                if ('zIndex' in changes || 'visible' in changes) refreshElements();
                setRefreshTrigger(prev => prev + 1);
            }
        }
    }, [sceneBuilder, visualizer, selectedElementId, refreshElements]);

    const addElement = useCallback((elementType: string) => {
        if (!sceneBuilder) return;
        const uniqueId = `${elementType}_${Date.now()}`;
        const success = sceneBuilder.addElement?.(elementType, uniqueId);
        if (success) {
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            refreshElements();
            setRefreshTrigger(prev => prev + 1);
            selectElement(uniqueId);
        }
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
        if (currentConfig) {
            const newVisibility = !currentConfig.visible;
            if (typeof sceneBuilder.updateElementConfig === 'function') {
                const success = sceneBuilder.updateElementConfig(elementId, { visible: newVisibility });
                if (success) {
                    refreshElements();
                    if (visualizer?.invalidateRender) visualizer.invalidateRender();
                    if (selectedElementId === elementId) selectElement(elementId); // refresh panel
                }
            } else {
                const element = sceneBuilder.getElement(elementId);
                if (element) {
                    element.visible = newVisibility;
                    refreshElements();
                    if (visualizer?.invalidateRender) visualizer.invalidateRender();
                    if (selectedElementId === elementId) selectElement(elementId);
                }
            }
        }
    }, [sceneBuilder, visualizer, refreshElements, selectedElementId, selectElement]);

    const moveElement = useCallback((elementId: string, newIndex: number) => {
        if (!sceneBuilder) return;
        const element = sceneBuilder.getElement(elementId);
        if (!element) return;
        const fullList: any[] = (sceneBuilder.elements || []).slice();
        // Normalize zIndex values defensively
        fullList.forEach(el => {
            let z = el.zIndex;
            if (z && typeof z === 'object' && 'type' in z && (z as any).type === 'constant' && 'value' in z) {
                z = (z as any).value; // unwrap accidental binding object presence
            }
            if (typeof z !== 'number' || !isFinite(z)) z = 0;
            el.zIndex = z;
        });
        const enriched = fullList.map((el, i) => ({ el, i }));
        enriched.sort((a, b) => {
            const dz = (b.el.zIndex || 0) - (a.el.zIndex || 0);
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
        for (const el of fullList) { if (el.id !== elementId) taken.set(el.zIndex || 0, el); }
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
        element.setZIndex(desiredZ);
        let nextZ = desiredZ + direction;
        for (const blocker of chain) {
            if (blocker.zIndex !== nextZ) blocker.setZIndex(nextZ);
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
        const success = sceneBuilder.duplicateElement?.(elementId, duplicateId);
        if (success) {
            refreshElements();
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            selectElement(duplicateId);
        }
    }, [sceneBuilder, visualizer, refreshElements, selectElement]);

    const deleteElement = useCallback((elementId: string) => {
        if (!sceneBuilder) return;
        if (window.confirm(`Delete element "${elementId}"?`)) {
            sceneBuilder.removeElement?.(elementId);
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
        const success = sceneBuilder.updateElementId?.(oldId, newId);
        if (success) {
            if (selectedElementId === oldId) setSelectedElementId(newId);
            refreshElements();
            if (visualizer?.invalidateRender) visualizer.invalidateRender();
            return true;
        } else {
            alert('Failed to update element ID. Please try again.');
            return false;
        }
    }, [sceneBuilder, refreshElements, visualizer, selectedElementId]);

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

import { useState, useEffect, useCallback } from 'react';

interface UseSceneElementPanelProps {
    visualizer: any;
    onElementSelect?: (elementId: string | null) => void;
    onElementAdd?: (elementType: string, elementId: string) => void;
    onElementDelete?: (elementId: string) => void;
    onElementConfigChange?: (elementId: string, changes: { [key: string]: any }) => void;
    onElementIdChange?: (oldId: string, newId: string) => void;
    refreshTrigger?: number;
}

interface SceneElementPanelState {
    selectedElementId: string | null;
    elements: any[];
    sceneBuilder: any;
    error: string | null;
}

interface SceneElementPanelActions {
    handleElementSelect: (elementId: string | null) => void;
    handleToggleVisibility: (elementId: string) => void;
    handleMoveElement: (elementId: string, newIndex: number) => void;
    handleDuplicateElement: (elementId: string) => void;
    handleDeleteElement: (elementId: string) => void;
    handleUpdateElementId: (oldId: string, newId: string) => boolean;
    refreshElements: () => void;
}

export const useSceneElementPanel = ({
    visualizer,
    onElementSelect,
    onElementAdd,
    onElementDelete,
    onElementConfigChange,
    onElementIdChange,
    refreshTrigger,
}: UseSceneElementPanelProps): SceneElementPanelState & SceneElementPanelActions => {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [elements, setElements] = useState<any[]>([]);
    const [sceneBuilder, setSceneBuilder] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Refresh elements from scene builder
    const refreshElements = useCallback(() => {
        if (!sceneBuilder) return;

        try {
            const elementsList = sceneBuilder.elements || [];
            // Sort for display: highest zIndex first (top-most visually at top of list)
            const sortedForDisplay = [...elementsList].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
            setElements(sortedForDisplay);
            setError(null);
        } catch (error) {
            console.error('Error refreshing elements:', error);
            setError('Failed to refresh elements: ' + (error instanceof Error ? error.message : String(error)));
        }
    }, [sceneBuilder]);

    // Initialize scene builder
    useEffect(() => {
        // Wait until visualizer is ready; don't error on initial mount
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
                // Keep loading state without flagging an error; may become available shortly
                setSceneBuilder(null);
                return;
            }

            setSceneBuilder(builder);
            console.log('Scene builder initialized for React component:', builder);
        } catch (error) {
            console.error('Error initializing scene builder:', error);
            setError('Failed to initialize scene builder: ' + (error instanceof Error ? error.message : String(error)));
        }
    }, [visualizer]);

    // Refresh elements when scene builder changes or refresh trigger changes
    useEffect(() => {
        if (sceneBuilder) {
            refreshElements();
        }
    }, [refreshTrigger, sceneBuilder, refreshElements]);

    // Handle element selection
    const handleElementSelect = useCallback(
        (elementId: string | null) => {
            setSelectedElementId(elementId);
            onElementSelect?.(elementId);
        },
        [onElementSelect]
    );

    // Handle element visibility toggle
    const handleToggleVisibility = useCallback(
        (elementId: string) => {
            if (!sceneBuilder) return;

            // Get current element config to determine current visibility
            const currentConfig = sceneBuilder.getElementConfig?.(elementId);
            if (currentConfig) {
                const newVisibility = !currentConfig.visible;

                // Use the scene builder's updateElementConfig method if available
                if (typeof sceneBuilder.updateElementConfig === 'function') {
                    const success = sceneBuilder.updateElementConfig(elementId, { visible: newVisibility });

                    if (success) {
                        refreshElements();

                        if (visualizer?.invalidateRender) {
                            visualizer.invalidateRender();
                        }

                        // Trigger element config change event with visibility update
                        onElementConfigChange?.(elementId, { visible: newVisibility });
                    }
                } else {
                    // Fallback to direct element access for older scene builders
                    const element = sceneBuilder.getElement(elementId);
                    if (element) {
                        element.visible = newVisibility;
                        refreshElements();

                        if (visualizer?.invalidateRender) {
                            visualizer.invalidateRender();
                        }

                        onElementConfigChange?.(elementId, { visible: newVisibility });
                    }
                }
            }
        },
        [sceneBuilder, refreshElements, visualizer, onElementConfigChange]
    );

    // Handle element move (reorder)
    const handleMoveElement = useCallback(
        (elementId: string, newIndex: number) => {
            if (!sceneBuilder) return;
            const element = sceneBuilder.getElement(elementId);
            if (!element) return;

            // Build a fresh sorted view independent of current state to be robust if input unsorted / duplicates
            const fullList: any[] = (sceneBuilder.elements || []).slice();
            // Normalize undefined zIndex to 0
            fullList.forEach((el) => {
                if (el.zIndex === undefined || el.zIndex === null) el.zIndex = 0;
            });
            // Sort DESC (top-most first) but keep stable order for equal zIndex using index tie-breaker
            const enriched = fullList.map((el, i) => ({ el, i }));
            enriched.sort((a, b) => {
                const dz = (b.el.zIndex || 0) - (a.el.zIndex || 0);
                return dz !== 0 ? dz : a.i - b.i; // stable
            });
            const displayList = enriched.map((e) => e.el);

            const currentIndex = displayList.findIndex((el) => el.id === elementId);
            if (currentIndex === -1) return;

            const clampedNewIndex = Math.max(0, Math.min(newIndex, displayList.length - 1));
            if (clampedNewIndex === currentIndex) return;

            const movingUp = clampedNewIndex < currentIndex; // Up arrow => appear earlier in list => higher z

            // We want final ordering such that element occupies clampedNewIndex in the displayList produced by sorting DESC by z.
            // Strategy: identify neighbor it must cross and set minimal z change that places it just above/below neighbor while resolving duplicates locally.
            const targetNeighbor = displayList[clampedNewIndex];
            if (!targetNeighbor) return;

            const oldZ = element.zIndex || 0;
            let desiredZ: number;
            if (movingUp) {
                // Need to be strictly above the neighbor's z
                desiredZ = (targetNeighbor.zIndex || 0) + 1;
            } else {
                // Need to be strictly below the neighbor's z
                desiredZ = (targetNeighbor.zIndex || 0) - 1;
            }

            if (desiredZ === oldZ) {
                // Already meets requirement (unlikely), nothing to do
                return;
            }

            // Collision resolution minimal adjustments: We only shift a chain in the direction of movement until a gap found.
            const taken = new Map<number, any>();
            for (const el of fullList) {
                if (el.id !== elementId) {
                    taken.set(el.zIndex || 0, el);
                }
            }

            const direction = movingUp ? 1 : -1;
            let finalZ = desiredZ;
            const chain: any[] = [];
            while (taken.has(finalZ)) {
                // Push the blocking element further in the same direction (record for later update)
                const blocking = taken.get(finalZ);
                chain.push(blocking);
                finalZ += direction; // keep searching
                // Safety guard against extreme loops
                if (chain.length > fullList.length + 5) break;
            }

            // Apply z-index updates: set moving element to desiredZ (not finalZ) or we risk large jumps? Requirement: integer above/below neighbor then push chain.
            // So we set element to desiredZ, then reassign each blocking element sequentially further by 1.
            element.setZIndex(desiredZ);
            let nextZ = desiredZ + direction;
            for (const blocker of chain) {
                if (blocker.zIndex !== nextZ) blocker.setZIndex(nextZ);
                nextZ += direction;
            }

            if (visualizer?.invalidateRender) {
                visualizer.invalidateRender();
            }
            refreshElements();
        },
        [sceneBuilder, refreshElements, visualizer]
    );

    // Handle element duplication
    const handleDuplicateElement = useCallback(
        (elementId: string) => {
            if (!sceneBuilder) return;

            const element = sceneBuilder.getElement(elementId);
            if (!element) return;

            // Generate a unique ID for the duplicated element
            const baseId = element.id.replace(/_copy_\d+$/, ''); // Remove any existing _copy_N suffix
            let duplicateId = `${baseId}_copy`;
            let counter = 1;

            // Ensure the ID is unique
            while (sceneBuilder.getElement(duplicateId)) {
                duplicateId = `${baseId}_copy_${counter}`;
                counter++;
            }

            // Create duplicate element
            const success = sceneBuilder.duplicateElement(elementId, duplicateId);
            if (success) {
                refreshElements();

                if (visualizer?.invalidateRender) {
                    visualizer.invalidateRender();
                }

                // Optionally select the duplicated element
                handleElementSelect(duplicateId);

                onElementAdd?.(element.type, duplicateId);
            }
        },
        [sceneBuilder, refreshElements, visualizer, handleElementSelect, onElementAdd]
    );

    // Handle element deletion
    const handleDeleteElement = useCallback(
        (elementId: string) => {
            if (!sceneBuilder) return;

            if (window.confirm(`Delete element "${elementId}"?`)) {
                sceneBuilder.removeElement(elementId);

                if (selectedElementId === elementId) {
                    handleElementSelect(null);
                }

                refreshElements();

                if (visualizer?.invalidateRender) {
                    visualizer.invalidateRender();
                }

                onElementDelete?.(elementId);
            }
        },
        [sceneBuilder, selectedElementId, handleElementSelect, refreshElements, visualizer, onElementDelete]
    );

    // Handle element ID update
    const handleUpdateElementId = useCallback(
        (oldId: string, newId: string): boolean => {
            if (!sceneBuilder) return false;

            // Check if new ID already exists
            const existingElement = sceneBuilder.getElement(newId);
            if (existingElement && existingElement.id !== oldId) {
                alert(`Element with ID "${newId}" already exists. Please choose a different ID.`);
                return false;
            }

            const success = sceneBuilder.updateElementId(oldId, newId);
            if (success) {
                if (selectedElementId === oldId) {
                    setSelectedElementId(newId);
                }

                refreshElements();

                if (visualizer?.invalidateRender) {
                    visualizer.invalidateRender();
                }

                onElementIdChange?.(oldId, newId);
                return true;
            } else {
                alert('Failed to update element ID. Please try again.');
                return false;
            }
        },
        [sceneBuilder, selectedElementId, refreshElements, visualizer, onElementIdChange]
    );

    return {
        selectedElementId,
        elements,
        sceneBuilder,
        error,
        handleElementSelect,
        handleToggleVisibility,
        handleMoveElement,
        handleDuplicateElement,
        handleDeleteElement,
        handleUpdateElementId,
        refreshElements,
    };
};

import { useState, useEffect, useCallback } from 'react';

interface UseSceneEditorProps {
    visualizer: any;
    onElementSelect?: (elementId: string | null) => void;
    onElementAdd?: (elementType: string, elementId: string) => void;
    onElementDelete?: (elementId: string) => void;
    onElementConfigChange?: (elementId: string, changes: { [key: string]: any }) => void;
    onElementIdChange?: (oldId: string, newId: string) => void;
    refreshTrigger?: number;
}

interface SceneEditorState {
    selectedElementId: string | null;
    elements: any[];
    sceneBuilder: any;
    error: string | null;
}

interface SceneEditorActions {
    handleElementSelect: (elementId: string | null) => void;
    handleToggleVisibility: (elementId: string) => void;
    handleMoveElement: (elementId: string, newIndex: number) => void;
    handleDuplicateElement: (elementId: string) => void;
    handleDeleteElement: (elementId: string) => void;
    handleUpdateElementId: (oldId: string, newId: string) => boolean;
    refreshElements: () => void;
}

export const useSceneEditor = ({
    visualizer,
    onElementSelect,
    onElementAdd,
    onElementDelete,
    onElementConfigChange,
    onElementIdChange,
    refreshTrigger
}: UseSceneEditorProps): SceneEditorState & SceneEditorActions => {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [elements, setElements] = useState<any[]>([]);
    const [sceneBuilder, setSceneBuilder] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Refresh elements from scene builder
    const refreshElements = useCallback(() => {
        if (!sceneBuilder) return;

        try {
            const elementsList = sceneBuilder.elements || [];
            console.log('Refreshing elements:', elementsList.length, 'elements found');
            setElements([...elementsList]);
            setError(null);
        } catch (error) {
            console.error('Error refreshing elements:', error);
            setError('Failed to refresh elements: ' + (error instanceof Error ? error.message : String(error)));
        }
    }, [sceneBuilder]);

    // Initialize scene builder
    useEffect(() => {
        try {
            setError(null);

            if (!visualizer?.getSceneBuilder) {
                throw new Error('Visualizer is not available or does not have getSceneBuilder method');
            }

            const builder = visualizer.getSceneBuilder();
            if (!builder) {
                throw new Error('Scene builder is not available');
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
    const handleElementSelect = useCallback((elementId: string | null) => {
        setSelectedElementId(elementId);
        onElementSelect?.(elementId);
    }, [onElementSelect]);

    // Handle element visibility toggle
    const handleToggleVisibility = useCallback((elementId: string) => {
        if (!sceneBuilder) return;

        const element = sceneBuilder.getElement(elementId);
        if (element) {
            element.visible = !element.visible;
            refreshElements();

            if (visualizer?.invalidateRender) {
                visualizer.invalidateRender();
            }

            // Trigger element config change event with visibility update
            onElementConfigChange?.(elementId, { visible: element.visible });
        }
    }, [sceneBuilder, refreshElements, visualizer, onElementConfigChange]);

    // Handle element move (reorder)
    const handleMoveElement = useCallback((elementId: string, newIndex: number) => {
        if (!sceneBuilder) return;

        const element = sceneBuilder.getElement(elementId);
        if (!element) return;

        const currentIndex = elements.findIndex(el => el.id === elementId);
        if (currentIndex === -1) return;

        // Remove element from current position
        const updatedElements = [...elements];
        const [movedElement] = updatedElements.splice(currentIndex, 1);

        // Insert at new position
        const targetIndex = Math.max(0, Math.min(newIndex, updatedElements.length));
        updatedElements.splice(targetIndex, 0, movedElement);

        // Update the scene builder's elements array
        if (sceneBuilder.elements) {
            sceneBuilder.elements.splice(0, sceneBuilder.elements.length, ...updatedElements);
        }

        // Refresh elements and trigger re-render
        refreshElements();

        if (visualizer?.invalidateRender) {
            visualizer.invalidateRender();
        }
    }, [sceneBuilder, elements, refreshElements, visualizer]);

    // Handle element duplication
    const handleDuplicateElement = useCallback((elementId: string) => {
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
    }, [sceneBuilder, refreshElements, visualizer, handleElementSelect, onElementAdd]);

    // Handle element deletion
    const handleDeleteElement = useCallback((elementId: string) => {
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
    }, [sceneBuilder, selectedElementId, handleElementSelect, refreshElements, visualizer, onElementDelete]);

    // Handle element ID update
    const handleUpdateElementId = useCallback((oldId: string, newId: string): boolean => {
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
    }, [sceneBuilder, selectedElementId, refreshElements, visualizer, onElementIdChange]);

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
        refreshElements
    };
};

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConfigEditor } from './config-editor';
import { ElementList, ElementDropdown } from './scene-editor';

interface SceneEditorProps {
    visualizer: any;
    onElementSelect?: (elementId: string | null) => void;
    onElementAdd?: (elementType: string, elementId: string) => void;
    onElementDelete?: (elementId: string) => void;
    onElementConfigChange?: (elementId: string, changes: { [key: string]: any }) => void;
    onElementIdChange?: (oldId: string, newId: string) => void;
}

const SceneEditor: React.FC<SceneEditorProps> = ({
    visualizer,
    onElementSelect,
    onElementAdd,
    onElementDelete,
    onElementConfigChange,
    onElementIdChange,
}) => {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [elements, setElements] = useState<any[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [sceneBuilder, setSceneBuilder] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initialize scene builder
    useEffect(() => {
        try {
            if (!visualizer) {
                throw new Error('Visualizer instance is required');
            }

            if (!visualizer.getSceneBuilder) {
                throw new Error('getSceneBuilder method not found on visualizer');
            }

            const builder = visualizer.getSceneBuilder();
            if (!builder) {
                throw new Error('Failed to get scene builder from visualizer');
            }

            if (!builder.getAllElements) {
                throw new Error('Scene builder missing getAllElements method');
            }

            setSceneBuilder(builder);
            setError(null);
        } catch (err) {
            console.error('Error initializing scene builder:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    }, [visualizer]);

    // Refresh elements list
    const refreshElements = useCallback(() => {
        if (!sceneBuilder) return;

        try {
            const allElements = sceneBuilder.getAllElements();
            setElements(allElements || []);
        } catch (err) {
            console.error('Error refreshing elements:', err);
            setElements([]);
        }
    }, [sceneBuilder]);

    // Initial load and refresh elements when scene builder is ready
    useEffect(() => {
        if (sceneBuilder) {
            refreshElements();
        }
    }, [sceneBuilder, refreshElements]);

    // Handle element selection
    const handleElementSelect = useCallback((elementId: string | null) => {
        setSelectedElementId(elementId);
        onElementSelect?.(elementId);
    }, [onElementSelect]);

    // Handle adding new element
    const handleAddElement = useCallback((elementType: string) => {
        if (!sceneBuilder) return;

        const uniqueId = `${elementType}_${Date.now()}`;
        const success = sceneBuilder.addElement(elementType, uniqueId);

        if (success) {
            refreshElements();
            handleElementSelect(uniqueId);

            if (visualizer?.render) {
                visualizer.render();
            }

            onElementAdd?.(elementType, uniqueId);
        }

        setShowDropdown(false);
    }, [sceneBuilder, refreshElements, handleElementSelect, visualizer, onElementAdd]);

    // Handle element visibility toggle
    const handleToggleVisibility = useCallback((elementId: string) => {
        if (!sceneBuilder) return;

        const element = sceneBuilder.getElement(elementId);
        if (element) {
            element.visible = !element.visible;
            refreshElements();

            if (visualizer?.render) {
                visualizer.render();
            }
        }
    }, [sceneBuilder, refreshElements, visualizer]);

    // Handle element movement
    const handleMoveElement = useCallback((elementId: string, newIndex: number) => {
        if (!sceneBuilder) return;

        const allElements = sceneBuilder.getAllElements();
        if (newIndex >= 0 && newIndex < allElements.length) {
            sceneBuilder.moveElement(elementId, newIndex);
            refreshElements();
        }
    }, [sceneBuilder, refreshElements]);

    // Handle element duplication
    const handleDuplicateElement = useCallback((elementId: string) => {
        if (!sceneBuilder) return;

        const element = sceneBuilder.getElement(elementId);
        if (element) {
            const uniqueId = `${elementId}_copy_${Date.now()}`;
            const success = sceneBuilder.addElement(element.type, uniqueId, element.config);

            if (success) {
                refreshElements();
                handleElementSelect(uniqueId);
            }
        }
    }, [sceneBuilder, refreshElements, handleElementSelect]);

    // Handle element deletion
    const handleDeleteElement = useCallback((elementId: string) => {
        if (!sceneBuilder) return;

        if (window.confirm(`Delete element "${elementId}"?`)) {
            sceneBuilder.removeElement(elementId);

            if (selectedElementId === elementId) {
                handleElementSelect(null);
            }

            refreshElements();

            if (visualizer?.render) {
                visualizer.render();
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

            if (visualizer?.render) {
                visualizer.render();
            }

            onElementIdChange?.(oldId, newId);
            return true;
        } else {
            alert('Failed to update element ID. Please try again.');
            return false;
        }
    }, [sceneBuilder, selectedElementId, refreshElements, visualizer, onElementIdChange]);

    // Handle element config changes
    const handleElementConfigChange = useCallback((elementId: string, configChanges: { [key: string]: any }) => {
        if (!sceneBuilder) return;

        sceneBuilder.updateElementConfig(elementId, configChanges);

        if (visualizer?.render) {
            visualizer.render();
        }

        onElementConfigChange?.(elementId, configChanges);
    }, [sceneBuilder, visualizer, onElementConfigChange]);

    // Handle clicks outside dropdown to close it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showDropdown]);

    // Get current selected element for config editor
    const selectedElement = selectedElementId && sceneBuilder
        ? sceneBuilder.getElement(selectedElementId)
        : null;

    const selectedElementSchema = selectedElement && sceneBuilder?.sceneElementRegistry
        ? sceneBuilder.sceneElementRegistry.getSchema(selectedElement.type)
        : null;

    if (error) {
        return (
            <div className="scene-editor">
                <div className="elements-panel">
                    <div className="element-list">
                        <div className="no-selection">Error: {error}</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!sceneBuilder) {
        return (
            <div className="scene-editor">
                <div className="elements-panel">
                    <div className="element-list">
                        <div className="no-selection">Loading...</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="scene-editor">
            <div className="elements-panel">
                <div className="element-list">
                    {elements.length === 0 ? (
                        <div className="no-selection">No elements in scene</div>
                    ) : (
                        <ElementList
                            elements={elements}
                            selectedElementId={selectedElementId}
                            onElementSelect={handleElementSelect}
                            onToggleVisibility={handleToggleVisibility}
                            onMoveElement={handleMoveElement}
                            onDuplicateElement={handleDuplicateElement}
                            onDeleteElement={handleDeleteElement}
                            onUpdateElementId={handleUpdateElementId}
                        />
                    )}
                </div>

                <div style={{ position: 'relative' }} ref={dropdownRef}>
                    <button
                        className="btn primary"
                        onClick={() => setShowDropdown(!showDropdown)}
                        title="Add element"
                    >
                        + Add Element
                    </button>

                    {showDropdown && (
                        <ElementDropdown
                            onAddElement={handleAddElement}
                            onClose={() => setShowDropdown(false)}
                        />
                    )}
                </div>
            </div>

            {selectedElement && selectedElementSchema && (
                <div className="element-config">
                    <ConfigEditor
                        element={selectedElement}
                        schema={selectedElementSchema}
                        onConfigChange={handleElementConfigChange}
                    />
                </div>
            )}
        </div>
    );
};

export default SceneEditor;

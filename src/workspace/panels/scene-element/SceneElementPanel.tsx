import React from 'react';
import ElementList from './ElementList';
import { useSceneSelection as useSceneSelectionContext } from '@context/SceneSelectionContext';
import { useSceneElements, useSceneSelection as useSceneSelectionStore } from '@state/scene';
import { enableSceneStoreUI } from '@config/featureFlags';

interface SceneEditorProps {
    refreshTrigger?: number; // Add refresh trigger
}

const SceneElementPanel: React.FC<SceneEditorProps> = ({ refreshTrigger }) => {
    const {
        selectedElementId: contextSelectedElementId,
        selectElement,
        elements: legacyElements,
        sceneBuilder,
        error,
        toggleElementVisibility,
        moveElement,
        duplicateElement,
        deleteElement,
        updateElementId,
        refreshElements
    } = useSceneSelectionContext();

    const selectionView = useSceneSelectionStore();
    const storeElements = useSceneElements();

    const selectedElementId = enableSceneStoreUI ? selectionView.primaryId : contextSelectedElementId;
    const elements = enableSceneStoreUI && storeElements.length > 0 ? storeElements : legacyElements;

    // If external refreshTrigger prop changes, force refresh
    React.useEffect(() => {
        if (refreshTrigger !== undefined) refreshElements();
    }, [refreshTrigger, refreshElements]);

    if (error) {
        return (
            <div className="scene-editor error">
                <div className="error-message">
                    <h4>⚠️ Scene Editor Error</h4>
                    <p>{error}</p>
                    <p>Make sure the visualizer is properly initialized.</p>
                </div>
            </div>
        );
    }

    if (!sceneBuilder) {
        return (
            <div className="scene-editor loading">
                <div className="loading-message">
                    <p>🔄 Initializing scene editor...</p>
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
                            onElementSelect={selectElement}
                            onToggleVisibility={toggleElementVisibility}
                            onMoveElement={moveElement}
                            onDuplicateElement={duplicateElement}
                            onDeleteElement={deleteElement}
                            onUpdateElementId={updateElementId}
                        />
                    )}
                </div>
                {/* Clear selection when clicking empty space */}
                <div
                    className="clear-selection-area"
                    onClick={() => selectElement(null)}
                    style={{
                        minHeight: '20px',
                        flex: 1,
                        cursor: 'default'
                    }}
                />
            </div>
        </div>
    );
};

export default SceneElementPanel;

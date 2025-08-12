import React from 'react';
import ElementList from './ElementList';
import { useSceneSelection } from '../../context/SceneSelectionContext';

interface SceneEditorProps {
    refreshTrigger?: number; // Add refresh trigger
}

const SceneElementPanel: React.FC<SceneEditorProps> = ({ refreshTrigger }) => {
    const {
        selectedElementId,
        selectElement,
        elements,
        sceneBuilder,
        error,
        toggleElementVisibility,
        moveElement,
        duplicateElement,
        deleteElement,
        updateElementId,
        refreshElements
    } = useSceneSelection();

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
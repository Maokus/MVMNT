import React from 'react';
import ElementList from './ElementList';
import { useSceneEditor } from '../../hooks/useSceneEditor';

interface SceneEditorProps {
    visualizer: any;
    onElementSelect?: (elementId: string | null) => void;
    onElementAdd?: (elementType: string, elementId: string) => void;
    onElementDelete?: (elementId: string) => void;
    onElementConfigChange?: (elementId: string, changes: { [key: string]: any }) => void;
    onElementIdChange?: (oldId: string, newId: string) => void;
    refreshTrigger?: number; // Add refresh trigger
}

const SceneEditor: React.FC<SceneEditorProps> = (props) => {
    const {
        selectedElementId,
        elements,
        sceneBuilder,
        error,
        handleElementSelect,
        handleToggleVisibility,
        handleMoveElement,
        handleDuplicateElement,
        handleDeleteElement,
        handleUpdateElementId
    } = useSceneEditor(props);

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
                            onElementSelect={handleElementSelect}
                            onToggleVisibility={handleToggleVisibility}
                            onMoveElement={handleMoveElement}
                            onDuplicateElement={handleDuplicateElement}
                            onDeleteElement={handleDeleteElement}
                            onUpdateElementId={handleUpdateElementId}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default SceneEditor;
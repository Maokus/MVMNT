import React from 'react';
import SceneNodeTree from './SceneNodeTree';
import { useSceneSelection as useSceneSelectionContext } from '@context/SceneSelectionContext';

const SceneElementPanel: React.FC = () => {
    const { selectElement, elements } = useSceneSelectionContext();

    return (
        <div className="scene-editor">
            <div className="elements-panel">
                <div className="element-list">
                    {elements.length === 0 ? (
                        <div className="no-selection">No elements in scene</div>
                    ) : (
                        <SceneNodeTree />
                    )}
                </div>
                {/* Clear selection when clicking empty space */}
                <div
                    className="clear-selection-area"
                    onClick={() => selectElement(null)}
                    style={{
                        minHeight: '20px',
                        flex: 1,
                        cursor: 'default',
                    }}
                />
            </div>
        </div>
    );
};

export default SceneElementPanel;

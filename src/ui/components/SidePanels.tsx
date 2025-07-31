import React, { useEffect, useState } from 'react';
import SceneEditor from './SceneEditor';
import { ConfigEditor } from './config-editor';
import MacroConfig from './MacroConfig';

interface SidePanelsProps {
    visualizer: any; // MIDIVisualizer type
}

const SidePanels: React.FC<SidePanelsProps> = ({ visualizer }) => {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);

    // Handle element selection from SceneEditor
    const handleElementSelect = (elementId: string | null) => {
        setSelectedElementId(elementId);

        if (elementId && visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                const element = sceneBuilder.getElement(elementId);
                const schema = sceneBuilder.sceneElementRegistry.getSchema(element?.type);

                setSelectedElement(element);
                setSelectedElementSchema(schema);

                // Update properties header
                const propertiesHeader = document.getElementById('propertiesHeader');
                if (propertiesHeader && element) {
                    const truncatedId = element.id.length > 15 ? element.id.substring(0, 12) + '...' : element.id;
                    propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
                    propertiesHeader.title = `Properties | ${element.id}`;
                }
            }
        } else {
            setSelectedElement(null);
            setSelectedElementSchema(null);

            // Reset properties header
            const propertiesHeader = document.getElementById('propertiesHeader');
            if (propertiesHeader) {
                propertiesHeader.textContent = '⚙️ Properties';
                propertiesHeader.title = '';
            }
        }
    };

    // Handle element config changes
    const handleElementConfigChange = (elementId: string, configChanges: { [key: string]: any }) => {
        if (!visualizer) return;

        const sceneBuilder = visualizer.getSceneBuilder();
        if (sceneBuilder) {
            sceneBuilder.updateElementConfig(elementId, configChanges);

            // Refresh visualization
            if (visualizer.render) {
                visualizer.render();
            }
        }
    };

    // Scene Builder integration
    useEffect(() => {
        if (visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                // Scene builder is available - no additional setup needed
                console.log('Scene builder integrated with React components');
            }
        }
    }, [visualizer]);

    return (
        <div className="side-panels">
            {/* Layer Panel */}
            <div className="layer-panel">
                <div className="panel-header">
                    <h3>📚 Layers</h3>
                </div>
                <div className="scene-editor-container">
                    {visualizer && (
                        <SceneEditor
                            visualizer={visualizer}
                            onElementSelect={handleElementSelect}
                            onElementConfigChange={handleElementConfigChange}
                        />
                    )}
                </div>
            </div>

            {/* Properties Panel */}
            <div className="properties-panel">
                <div className="panel-header">
                    <h3 id="propertiesHeader">⚙️ Properties</h3>
                </div>
                <div className="properties-content">
                    {/* Global settings (shown when nothing is selected) */}
                    {!selectedElementId && (
                        <div className="global-settings" id="globalSettings">
                            <div className="settings-grid">
                                {/* Global Macros Section */}
                                <div className="setting-group">
                                    <MacroConfig sceneBuilder={visualizer?.getSceneBuilder()} />
                                </div>

                                <div className="setting-group">
                                    <h4>Export Settings</h4>
                                    <label htmlFor="resolutionSelect">Resolution:</label>
                                    <select id="resolutionSelect">
                                        <option value="1500">1500x1500px (Default)</option>
                                        <option value="1080">1080x1080px (Instagram)</option>
                                        <option value="720">720x720px (Smaller)</option>
                                        <option value="2160">2160x2160px (4K)</option>
                                    </select>

                                    <label htmlFor="fpsInput">Frame Rate (FPS):</label>
                                    <input type="number" id="fpsInput" min="24" max="60" defaultValue="30" />

                                    <label>
                                        <input type="checkbox" id="fullDurationExport" defaultChecked />
                                        Export full duration
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Element configuration (shown when an element is selected) */}
                    {selectedElementId && selectedElement && selectedElementSchema && (
                        <div className="element-config" id="elementConfig">
                            <ConfigEditor
                                element={selectedElement}
                                schema={{
                                    ...selectedElementSchema,
                                    properties: Object.fromEntries(
                                        Object.entries(selectedElementSchema.properties || {}).filter(
                                            ([key]) => key !== 'id' && key !== 'visible'
                                        )
                                    )
                                }}
                                onConfigChange={handleElementConfigChange}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SidePanels;

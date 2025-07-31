import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { SceneEditorUI } from '../scene-editor-ui.js';
// @ts-ignore
import { MacroConfigUI } from '../macro-config-ui.js';

interface SidePanelsProps {
    visualizer: any; // MIDIVisualizer type
}

const SidePanels: React.FC<SidePanelsProps> = ({ visualizer }) => {
    const sceneEditorRef = useRef<HTMLDivElement>(null);
    const macroConfigRef = useRef<HTMLDivElement>(null);
    const propertiesContentRef = useRef<HTMLDivElement>(null);
    const elementDropdownRef = useRef<HTMLDivElement>(null);
    const [sceneEditor, setSceneEditor] = useState<any>(null);
    const [macroConfigUI, setMacroConfigUI] = useState<any>(null);

    useEffect(() => {
        if (visualizer && sceneEditorRef.current && !sceneEditor) {
            try {
                // Initialize scene editor with container and visualizer
                const editor = new SceneEditorUI(sceneEditorRef.current, visualizer);
                setSceneEditor(editor);

                // Expose to global scope for inline onclick handlers
                (window as any).sceneEditorUI = editor;

                console.log('SceneEditorUI initialized successfully');
            } catch (error) {
                console.error('Failed to initialize SceneEditorUI:', error);
            }
        }
    }, [visualizer, sceneEditor]);

    // Cleanup global reference when component unmounts
    useEffect(() => {
        return () => {
            if ((window as any).sceneEditorUI) {
                (window as any).sceneEditorUI = null;
            }
        };
    }, []);

    useEffect(() => {
        if (macroConfigRef.current && !macroConfigUI) {
            try {
                // Initialize macro config UI with container
                const macroUI = new MacroConfigUI(macroConfigRef.current);
                setMacroConfigUI(macroUI);
                console.log('MacroConfigUI initialized successfully');
            } catch (error) {
                console.error('Failed to initialize MacroConfigUI:', error);
            }
        }
    }, [macroConfigUI]);

    const handleAddLayer = () => {
        const dropdown = elementDropdownRef.current;
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
    };

    return (
        <div className="side-panels">
            {/* Layer Panel */}
            <div className="layer-panel">
                <div className="panel-header">
                    <h3>📚 Layers</h3>
                    <button className="btn btn-add" id="addLayerBtn" onClick={handleAddLayer}>
                        Add ▾
                    </button>
                    <div className="element-dropdown" id="elementDropdown" ref={elementDropdownRef} style={{ display: 'none' }}>
                        {/* Element types will be populated by sceneEditor */}
                        <button id="addElementBtn" style={{ display: 'none' }}>Add Element</button>
                    </div>
                </div>
                <div className="scene-editor-container" ref={sceneEditorRef}>
                    {/* Scene elements will be injected here by SceneEditorUI */}
                    <div className="scene-editor">
                        <div className="elements-panel">
                            <div className="element-list" id="elementList">
                                {/* Elements will be populated here */}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Properties Panel */}
            <div className="properties-panel">
                <div className="panel-header">
                    <h3 id="propertiesHeader">⚙️ Properties</h3>
                </div>
                <div className="properties-content" ref={propertiesContentRef}>
                    {/* Global settings (shown when nothing is selected) */}
                    <div className="global-settings" id="globalSettings">
                        <div className="settings-grid">
                            {/* Global Macros Section */}
                            <div className="setting-group">
                                <div className="macro-config-container" ref={macroConfigRef}>
                                    {/* Macro configuration UI will be injected here */}
                                </div>
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

                    {/* Element configuration will be injected here when an element is selected */}
                    <div className="element-config" id="elementConfig" style={{ display: 'none' }}>
                        {/* Dynamic element configuration will appear here */}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SidePanels;

import React, { useEffect, useState, useRef } from 'react';
import SceneEditor from './scene-element-panel/SceneEditor';
import { ConfigEditor } from './properties-panel';
import MacroConfig from './MacroConfig';
import { ElementDropdown } from './scene-element-panel';
import { useSidePanels } from '../hooks/useSidePanels';

interface SidePanelsProps {
    visualizer: any; // MIDIVisualizer type
    sceneRefreshTrigger?: number; // Trigger refresh when this changes
    onExport: (exportSettings: { fps: number; resolution: number; fullDuration: boolean }) => void;
    exportStatus: string;
    canExport: boolean;
}

const SidePanels: React.FC<SidePanelsProps> = ({ visualizer, sceneRefreshTrigger, onExport, exportStatus, canExport }) => {
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);
    const sidePanelsRef = useRef<HTMLDivElement>(null);
    const addElementDropdownRef = useRef<HTMLDivElement>(null);

    // Use the SidePanels hook to get state and actions
    const {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        refreshTrigger,
        exportSettings,
        handleElementSelect,
        handleElementConfigChange,
        handleAddElement,
        setSelectedElementId,
        setSelectedElement,
        setSelectedElementSchema,
        updateExportSetting
    } = useSidePanels({ visualizer, sceneRefreshTrigger });

    // Handle clicks outside of side panels to clear selection and show global settings
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Close add element dropdown if clicked outside
            if (addElementDropdownRef.current && !addElementDropdownRef.current.contains(event.target as Node)) {
                setShowAddElementDropdown(false);
            }

            // Clear selection if clicked outside the side panels
            if (sidePanelsRef.current && !sidePanelsRef.current.contains(event.target as Node)) {
                if (selectedElementId) {
                    console.log('Clicked outside side panels, clearing selection');
                    setSelectedElementId(null);
                    setSelectedElement(null);
                    setSelectedElementSchema(null);

                    // Reset properties header
                    const propertiesHeader = document.getElementById('propertiesHeader');
                    if (propertiesHeader) {
                        propertiesHeader.textContent = '⚙️ Properties';
                        propertiesHeader.title = '';
                    }
                }
            }
        };

        const handleKeyPress = (event: KeyboardEvent) => {
            // Clear selection on Escape key
            if (event.key === 'Escape' && selectedElementId) {
                console.log('Escape key pressed, clearing selection');
                setSelectedElementId(null);
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

        // Add event listeners to document
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyPress);

        // Cleanup event listeners on unmount
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [selectedElementId, showAddElementDropdown, setSelectedElement, setSelectedElementId, setSelectedElementSchema]); // Dependency on selectedElementId and showAddElementDropdown to re-create listener when selection changes

    // Wrapper to handle adding element and closing dropdown
    const handleAddElementAndCloseDropdown = (elementType: string) => {
        handleAddElement(elementType);
        setShowAddElementDropdown(false);
    };

    return (
        <div className="side-panels" ref={sidePanelsRef}>
            {/* Layer Panel */}
            <div className="layer-panel">
                <div className="panel-header">
                    <h3>📚 Layers</h3>
                    <div style={{ position: 'relative' }} ref={addElementDropdownRef}>
                        <button
                            className="btn primary"
                            onClick={() => setShowAddElementDropdown(!showAddElementDropdown)}
                            title="Add element"
                            style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                marginLeft: 'auto'
                            }}
                        >
                            + Add
                        </button>

                        {showAddElementDropdown && (
                            <ElementDropdown
                                onAddElement={handleAddElementAndCloseDropdown}
                                onClose={() => setShowAddElementDropdown(false)}
                            />
                        )}
                    </div>
                </div>
                <div className="scene-editor-container">
                    {visualizer && (
                        <SceneEditor
                            visualizer={visualizer}
                            onElementSelect={handleElementSelect}
                            onElementConfigChange={handleElementConfigChange}
                            refreshTrigger={refreshTrigger + (sceneRefreshTrigger || 0)}
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
                                    <select
                                        id="resolutionSelect"
                                        value={exportSettings.resolution}
                                        onChange={(e) => updateExportSetting('resolution', parseInt(e.target.value))}
                                    >
                                        <option value="1500">1500x1500px (Default)</option>
                                        <option value="1080">1080x1080px (Instagram)</option>
                                        <option value="720">720x720px (Smaller)</option>
                                        <option value="2160">2160x2160px (4K)</option>
                                    </select>

                                    <label htmlFor="fpsInput">Frame Rate (FPS):</label>
                                    <input
                                        type="number"
                                        id="fpsInput"
                                        min="24"
                                        max="60"
                                        value={exportSettings.fps}
                                        onChange={(e) => updateExportSetting('fps', parseInt(e.target.value))}
                                    />

                                    <label>
                                        <input
                                            type="checkbox"
                                            id="fullDurationExport"
                                            checked={exportSettings.fullDuration}
                                            onChange={(e) => updateExportSetting('fullDuration', e.target.checked)}
                                        />
                                        Export full duration
                                    </label>

                                    <div className="export-actions" style={{ marginTop: '16px' }}>
                                        <button
                                            className="btn-export"
                                            onClick={() => onExport(exportSettings)}
                                            disabled={!canExport}
                                            style={{
                                                width: '100%',
                                                padding: '8px 16px',
                                                fontSize: '14px',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            📸 Export PNG Sequence
                                        </button>
                                        <span style={{
                                            fontSize: '12px',
                                            color: '#666',
                                            marginTop: '8px',
                                            display: 'block',
                                            textAlign: 'center'
                                        }}>
                                            {exportStatus}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Element configuration (shown when an element is selected) */}
                    {selectedElementId && selectedElement && selectedElementSchema && (
                        <div className="element-config" id="elementConfig">
                            <ConfigEditor
                                key={selectedElementId}
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

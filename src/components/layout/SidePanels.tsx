import React, { useEffect, useState, useRef } from 'react';
import SceneEditor from './scene-element-panel/SceneEditor';
import { PropertiesPanel } from './properties-panel';
import { ElementDropdown } from './scene-element-panel';
import { useSidePanels } from '../hooks/useSidePanels';

interface SidePanelsProps {
    visualizer: any; // MIDIVisualizer type
    sceneRefreshTrigger?: number; // Trigger refresh when this changes
    onExport: (exportSettings: { fps: number; resolution: number; fullDuration: boolean }) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: { fps: number; resolution: number; fullDuration: boolean };
    onExportSettingsChange: (settings: { fps: number; resolution: number; fullDuration: boolean }) => void;
    debugSettings: { showAnchorPoints: boolean };
    onDebugSettingsChange: (settings: { showAnchorPoints: boolean }) => void;
}

const SidePanels: React.FC<SidePanelsProps> = ({
    visualizer,
    sceneRefreshTrigger,
    onExport,
    exportStatus,
    canExport,
    exportSettings,
    onExportSettingsChange,
    debugSettings,
    onDebugSettingsChange
}) => {
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);
    const sidePanelsRef = useRef<HTMLDivElement>(null);
    const addElementDropdownRef = useRef<HTMLDivElement>(null);

    // Use the SidePanels hook to get state and actions (excluding export settings which are managed externally)
    const {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        refreshTrigger,
        handleElementSelect,
        handleElementConfigChange,
        handleAddElement,
        setSelectedElementId,
        setSelectedElement,
        setSelectedElementSchema
    } = useSidePanels({ visualizer, sceneRefreshTrigger });

    // Create a local function to handle debug setting updates
    const updateDebugSetting = (key: 'showAnchorPoints', value: any) => {
        const newSettings = {
            ...debugSettings,
            [key]: value
        };
        onDebugSettingsChange(newSettings);
    };

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

                    {/* Properties panel (shows global props when no element selected, element props when selected) */}
                    <div className="properties-config" id="propertiesConfig">
                        <PropertiesPanel
                            key={selectedElementId || 'global'}
                            element={selectedElement}
                            schema={selectedElementSchema ? {
                                ...selectedElementSchema,
                                properties: Object.fromEntries(
                                    Object.entries(selectedElementSchema.properties || {}).filter(
                                        ([key]) => key !== 'id' && key !== 'visible'
                                    )
                                )
                            } : undefined}
                            onConfigChange={handleElementConfigChange}
                            visualizer={visualizer}
                            onExport={onExport}
                            exportStatus={exportStatus}
                            canExport={canExport}
                            exportSettings={exportSettings}
                            onExportSettingsChange={onExportSettingsChange}
                        />
                    </div>
                    {/* Debug settings (shown when nothing is selected) */}
                    {!selectedElementId && (
                        <div className="debug-settings" id="debugSettings">
                            <div className="settings-grid">
                                <div className="setting-group">
                                    <h4>Debug Settings</h4>
                                    <label>
                                        <input
                                            type="checkbox"
                                            id="showAnchorPoints"
                                            checked={debugSettings.showAnchorPoints}
                                            onChange={(e) => updateDebugSetting('showAnchorPoints', e.target.checked)}
                                        />
                                        Show Anchor Points
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SidePanels;

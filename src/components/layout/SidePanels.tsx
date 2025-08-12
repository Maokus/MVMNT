import React, { useEffect, useState, useRef } from 'react';
import SceneElementPanel from './scene-element-panel/SceneElementPanel';
import { PropertiesPanel } from './properties-panel';
import { ElementDropdown } from './scene-element-panel';
import { SceneSelectionProvider, useSceneSelection } from '../context/SceneSelectionContext';
import { useVisualizer } from '../context/VisualizerContext';

interface SidePanelsProps {
    visualizer: any; // MIDIVisualizer type
    sceneRefreshTrigger?: number; // Trigger refresh when this changes
    onExport: (exportSettings: any) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: any;
    onExportSettingsChange: (settings: any) => void;
    debugSettings: { showAnchorPoints: boolean };
    onDebugSettingsChange: (settings: { showAnchorPoints: boolean }) => void;
}

// Internal component that uses the context
const SidePanelsInternal: React.FC<Omit<SidePanelsProps, 'visualizer' | 'sceneRefreshTrigger'>> = (props) => {
    const ctx = useVisualizer();
    const onExport = props.onExport;
    const exportStatus = props.exportStatus;
    const canExport = props.canExport;
    const exportSettings = props.exportSettings || ctx.exportSettings;
    const onExportSettingsChange = props.onExportSettingsChange || ctx.setExportSettings;
    const debugSettings = props.debugSettings || ctx.debugSettings;
    const onDebugSettingsChange = props.onDebugSettingsChange || ctx.setDebugSettings;
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);
    const sidePanelsRef = useRef<HTMLDivElement>(null);
    const addElementDropdownRef = useRef<HTMLDivElement>(null);

    // Use the scene selection context
    const {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        refreshTrigger,
        clearSelection,
        updateElementConfig,
        addElement
    } = useSceneSelection();

    // Debug settings now handled in GlobalPropertiesPanel

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
                    clearSelection();
                }
            }
        };

        const handleKeyPress = (event: KeyboardEvent) => {
            // Clear selection on Escape key
            if (event.key === 'Escape' && selectedElementId) {
                console.log('Escape key pressed, clearing selection');
                clearSelection();
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
    }, [selectedElementId, showAddElementDropdown, clearSelection]);

    // Wrapper to handle adding element and closing dropdown
    const handleAddElementAndCloseDropdown = (elementType: string) => {
        addElement(elementType);
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
                    <SceneElementPanel refreshTrigger={refreshTrigger} />
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
                            schema={selectedElementSchema || undefined}
                            onConfigChange={updateElementConfig}
                            onExport={onExport}
                            exportStatus={exportStatus}
                            canExport={canExport}
                            exportSettings={exportSettings}
                            onExportSettingsChange={onExportSettingsChange}
                            debugSettings={debugSettings}
                            onDebugSettingsChange={onDebugSettingsChange}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main component wrapper that provides the context
const SidePanels: React.FC<SidePanelsProps> = (props) => {
    return (
        <SceneSelectionProvider
            visualizer={props.visualizer}
            sceneRefreshTrigger={props.sceneRefreshTrigger}
        >
            <SidePanelsInternal {...props} />
        </SceneSelectionProvider>
    );
};

export default SidePanels;

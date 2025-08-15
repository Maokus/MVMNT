import React, { useEffect, useState, useRef } from 'react';
import SceneElementPanel from '../../components/layout/scene-element-panel/SceneElementPanel';
import { PropertiesPanel } from '../../components/layout/properties-panel';
import { ElementDropdown } from '../../components/layout/scene-element-panel';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useVisualizer } from '@context/VisualizerContext';

interface SidePanelsProps {
    sceneRefreshTrigger?: number;
}

// Internal component that uses the context
const SidePanelsInternal: React.FC = () => {
    const { exportSettings, debugSettings, exportSequence, exportStatus, visualizer, setExportSettings, setDebugSettings, canvasRef } = useVisualizer() as any;
    const canExport = !!(visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0);
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);
    const sidePanelsRef = useRef<HTMLDivElement>(null);
    const addElementDropdownRef = useRef<HTMLDivElement>(null);

    // Use the scene selection context
    const {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        refreshTrigger,
        propertyPanelRefresh,
        clearSelection,
        updateElementConfig,
        addElement,
        deleteElement
    } = useSceneSelection();

    // Debug settings now handled in GlobalPropertiesPanel

    // Handle clicks outside of side panels to clear selection and show global settings
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Close add element dropdown if clicked outside
            if (addElementDropdownRef.current && !addElementDropdownRef.current.contains(event.target as Node)) {
                setShowAddElementDropdown(false);
            }

            // Clear selection only if click is outside BOTH side panels and the canvas
            const clickedInsideSidePanels = sidePanelsRef.current?.contains(event.target as Node);
            const canvasEl: HTMLCanvasElement | null = canvasRef?.current || document.getElementById('canvas') as HTMLCanvasElement | null;
            const clickedInsideCanvas = !!(canvasEl && canvasEl.contains(event.target as Node));
            if (!clickedInsideSidePanels && !clickedInsideCanvas) {
                if (selectedElementId) {
                    console.log('Clicked outside side panels and canvas, clearing selection');
                    clearSelection();
                }
            }
        };

        const handleKeyPress = (event: KeyboardEvent) => {
            // Avoid interfering with typing inside inputs/textareas
            const target = event.target as HTMLElement | null;
            const isEditable = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            // Clear selection on Escape key
            if (event.key === 'Escape' && selectedElementId) {
                console.log('Escape key pressed, clearing selection');
                clearSelection();
                return;
            }
            // Delete selected element on Delete key
            if (!isEditable && selectedElementId && (event.key === 'Delete' || event.key === 'Backspace')) {
                deleteElement(selectedElementId);
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
    }, [selectedElementId, showAddElementDropdown, clearSelection, deleteElement, canvasRef]);

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
                    <h3>📚 Elements</h3>
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
                            key={(selectedElementId || 'global') + ':' + propertyPanelRefresh}
                            element={selectedElement}
                            schema={selectedElementSchema || undefined}
                            onConfigChange={updateElementConfig}
                            onExport={exportSequence}
                            exportStatus={exportStatus}
                            canExport={canExport}
                            exportSettings={exportSettings}
                            onExportSettingsChange={setExportSettings}
                            debugSettings={debugSettings}
                            onDebugSettingsChange={setDebugSettings}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main component (provider now lives higher in tree)
const SidePanels: React.FC<SidePanelsProps> = ({ sceneRefreshTrigger }) => {
    return <SidePanelsInternal />;
};

export default SidePanels;

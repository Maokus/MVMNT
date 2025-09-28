import React, { useEffect, useState, useRef } from 'react';
import { SceneElementPanel, ElementDropdown } from '@workspace/panels/scene-element';
import { PropertiesPanel } from '@workspace/panels/properties';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useVisualizer } from '@context/VisualizerContext';

interface SidePanelsProps {}

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
        <div
            className="flex-1 flex min-w-[320px] min-h-0 flex-col h-[50vh] md:flex-row md:h-[40vh] xl:flex-col xl:h-auto"
            ref={sidePanelsRef}
        >
            {/* Layer Panel */}
            <div className="flex-1 flex flex-col min-h-0 border-b max-h-[250px] bg-panel border-border md:border-b-0 md:border-r md:max-h-none xl:border-r-0 xl:border-b xl:max-h-[250px]">
                <div className="border-b px-4 py-2 shrink-0 flex justify-between items-center relative bg-menubar border-border">
                    <h3 className="text-[13px] font-semibold text-neutral-300 m-0">📚 Elements</h3>
                    <div style={{ position: 'relative' }} ref={addElementDropdownRef}>
                        <button
                            className="px-2 py-1 border rounded cursor-pointer text-[12px] font-medium transition inline-flex items-center justify-center bg-[#0e639c] border-[#1177bb] text-white hover:bg-[#1177bb] hover:border-[#1890d4] ml-auto"
                            onClick={() => setShowAddElementDropdown(!showAddElementDropdown)}
                            title="Add element"
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
                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    <SceneElementPanel />
                </div>
            </div>

            {/* Properties Panel */}
            <div className="flex-1 flex flex-col min-h-0 bg-panel">
                <div className="border-b px-4 py-2 shrink-0 flex justify-between items-center relative bg-menubar border-border">
                    <h3 id="propertiesHeader" className="text-[13px] font-semibold text-neutral-300 m-0">⚙️ Properties</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4">

                    {/* Properties panel (shows global props when no element selected, element props when selected) */}
                    <div className="properties-config" id="propertiesConfig">
                        <PropertiesPanel
                            element={selectedElement}
                            schema={selectedElementSchema || undefined}
                            refreshToken={propertyPanelRefresh}
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
const SidePanels: React.FC<SidePanelsProps> = () => {
    return <SidePanelsInternal />;
};

export default SidePanels;

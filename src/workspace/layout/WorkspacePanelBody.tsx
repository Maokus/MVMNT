import React, { useCallback, useState } from 'react';
import {
    FloatingFocusManager,
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import { SceneElementPanel, ElementDropdown } from '@workspace/panels/scene-element';
import { Button } from '@workspace/components/Button';
import { PropertiesPanel } from '@workspace/panels/properties';
import AssetManagerPanel from '@workspace/panels/asset-manager/AssetManagerPanel';
import MacroConfig from '@workspace/panels/properties/MacroConfig';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useVisualizer } from '@context/VisualizerContext';
import type { WorkspacePanelId } from '@state/workspacePanelsStore';

interface WorkspacePanelBodyProps {
    id: WorkspacePanelId;
}

export const WorkspacePanelBody: React.FC<WorkspacePanelBodyProps> = ({ id }) => {
    const {
        exportSettings,
        debugSettings,
        exportSequence,
        exportStatus,
        visualizer,
        setExportSettings,
        setDebugSettings,
    } = useVisualizer() as any;
    const canExport = !!(visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0);
    const { selectedElement, selectedElementSchema, propertyPanelRefresh, updateElementConfig, addElement } =
        useSceneSelection();

    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);

    const {
        refs: addElementRefs,
        floatingStyles: addElementFloatingStyles,
        context: addElementContext,
    } = useFloating({
        open: showAddElementDropdown,
        onOpenChange: setShowAddElementDropdown,
        placement: 'bottom-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    });
    const addElementDismiss = useDismiss(addElementContext, { outsidePressEvent: 'mousedown' });
    const addElementRole = useRole(addElementContext, { role: 'menu' });
    const { getReferenceProps: getAddElementReferenceProps, getFloatingProps: getAddElementFloatingProps } =
        useInteractions([addElementDismiss, addElementRole]);

    const handleAddElementAndCloseDropdown = useCallback(
        (elementType: string) => {
            addElement(elementType);
            setShowAddElementDropdown(false);
        },
        [addElement]
    );

    switch (id) {
        case 'assets':
            return <AssetManagerPanel />;
        case 'macros':
            return (
                <div className="flex-1 overflow-y-auto p-3">
                    <MacroConfig visualizer={visualizer} />
                </div>
            );
        case 'properties':
            return (
                <div className="flex-1 overflow-y-auto p-0 space-y-4">
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
            );
        case 'elements':
        default:
            return (
                <>
                    <div className="inspector-panel-header">
                        <h3 className="inspector-panel-header__title">Elements</h3>
                        <div className="relative">
                            <Button
                                variant="primary"
                                size="sm"
                                {...getAddElementReferenceProps({
                                    type: 'button',
                                    onClick: () => setShowAddElementDropdown((prev) => !prev),
                                    title: 'Add element',
                                })}
                                ref={addElementRefs.setReference}
                            >
                                + Add
                            </Button>
                            {showAddElementDropdown && (
                                <FloatingPortal>
                                    <FloatingFocusManager context={addElementContext} modal={false} initialFocus={-1}>
                                        <div
                                            {...getAddElementFloatingProps({})}
                                            ref={addElementRefs.setFloating}
                                            style={addElementFloatingStyles}
                                            className="z-[1000]"
                                        >
                                            <ElementDropdown
                                                className="mt-2"
                                                onAddElement={handleAddElementAndCloseDropdown}
                                                onClose={() => setShowAddElementDropdown(false)}
                                            />
                                        </div>
                                    </FloatingFocusManager>
                                </FloatingPortal>
                            )}
                        </div>
                    </div>
                    <div className="inspector-elements-scroll">
                        <SceneElementPanel />
                    </div>
                </>
            );
    }
};

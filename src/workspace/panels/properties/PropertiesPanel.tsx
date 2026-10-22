import React from 'react';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import { useSceneSelection } from '@context/SceneSelectionContext';
import type { ElementBindings } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { DebugSettings } from '@context/visualizer/types';
import { NodeTransformPanel } from './NodeTransformPanel';
import { activateCommandSurface } from '@context/commands/commandContext';

interface SelectedElementProps {
    id: string;
    type: string;
    bindings: ElementBindings;
}

interface PropertiesPanelProps {
    element?: SelectedElementProps | null;
    schema?: any;
    refreshToken?: number;
    onConfigChange: (
        elementId: string,
        changes: { [key: string]: any },
        options?: Omit<SceneCommandOptions, 'source'>
    ) => void;
    onExport: (exportSettings: any) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: any;
    onExportSettingsChange: (settings: any) => void;
    debugSettings: DebugSettings;
    onDebugSettingsChange: (settings: DebugSettings) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = (props) => {
    const { element, schema, onConfigChange, refreshToken = 0 } = props;
    const { selectedNodeIds } = useSceneSelection();
    // Selected elements get the inspector; otherwise the tab shows an empty state.
    if (selectedNodeIds.length) {
        return (
            <div
                className="node-properties-shell"
                data-command-surface="properties"
                onPointerDownCapture={() => activateCommandSurface('properties')}
                onFocusCapture={() => activateCommandSurface('properties')}
            >
                {selectedNodeIds.length === 1 && element && schema ? (
                    <ElementPropertiesPanel
                        elementId={element.id}
                        elementType={element.type}
                        schema={schema}
                        bindings={element.bindings}
                        onConfigChange={onConfigChange}
                        refreshToken={refreshToken}
                        includeNodeTransforms
                    />
                ) : (
                    <NodeTransformPanel />
                )}
            </div>
        );
    }

    return (
        <div
            className="node-properties-shell"
            data-command-surface="properties"
            onPointerDownCapture={() => activateCommandSurface('properties')}
            onFocusCapture={() => activateCommandSurface('properties')}
        >
            <div className="p-4 text-[12px] text-neutral-400">
                Select an element to edit its properties.
            </div>
        </div>
    );
};

export default PropertiesPanel;

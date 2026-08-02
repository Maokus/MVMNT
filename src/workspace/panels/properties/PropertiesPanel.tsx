import React, { useEffect, useState } from 'react';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import GlobalPropertiesPanel from './GlobalPropertiesPanel';
import { useSceneSelection } from '@context/SceneSelectionContext';
import type { ElementBindings } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { DebugSettings } from '@context/visualizer/types';
import { NodeTransformPanel } from './NodeTransformPanel';

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
    const { visualizer, selectedNodeIds } = useSceneSelection();
    const [inspectorTab, setInspectorTab] = useState<'transform' | 'content'>('transform');

    useEffect(() => setInspectorTab('transform'), [selectedNodeIds.join(',')]);

    // Show ElementPropertiesPanel when an element is selected, otherwise show GlobalPropertiesPanel
    if (selectedNodeIds.length) {
        return (
            <div className="node-properties-shell">
                {element && schema ? (
                    <div className="ae-tab-strip node-inspector-tabs" role="tablist" aria-label="Inspector layer">
                        <button
                            className={`ae-tab${inspectorTab === 'transform' ? ' ae-tab--active' : ''}`}
                            role="tab"
                            aria-selected={inspectorTab === 'transform'}
                            onClick={() => setInspectorTab('transform')}
                        >
                            Transform
                        </button>
                        <button
                            className={`ae-tab${inspectorTab === 'content' ? ' ae-tab--active' : ''}`}
                            role="tab"
                            aria-selected={inspectorTab === 'content'}
                            onClick={() => setInspectorTab('content')}
                        >
                            Content
                        </button>
                    </div>
                ) : null}
                {inspectorTab === 'transform' || !element || !schema ? <NodeTransformPanel /> : null}
                {inspectorTab === 'content' && element && schema ? (
                    <ElementPropertiesPanel
                        elementId={element.id}
                        elementType={element.type}
                        schema={schema}
                        bindings={element.bindings}
                        onConfigChange={onConfigChange}
                        refreshToken={refreshToken}
                    />
                ) : null}
            </div>
        );
    }

    return (
        <GlobalPropertiesPanel
            visualizer={visualizer}
            refreshToken={refreshToken}
            onExport={props.onExport}
            exportStatus={props.exportStatus}
            canExport={props.canExport}
            exportSettings={props.exportSettings}
            onExportSettingsChange={props.onExportSettingsChange}
            debugSettings={props.debugSettings}
            onDebugSettingsChange={props.onDebugSettingsChange}
        />
    );
};

export default PropertiesPanel;

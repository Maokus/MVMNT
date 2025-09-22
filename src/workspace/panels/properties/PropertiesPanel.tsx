import React from 'react';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import GlobalPropertiesPanel from './GlobalPropertiesPanel';
import { useSceneSelection } from '@context/SceneSelectionContext';

interface PropertiesPanelProps {
    element?: any;
    schema?: any;
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
    onExport: (exportSettings: any) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: any;
    onExportSettingsChange: (settings: any) => void;
    debugSettings: { showAnchorPoints: boolean };
    onDebugSettingsChange: (settings: { showAnchorPoints: boolean }) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = (props) => {
    const { element, schema, onConfigChange } = props;
    const { visualizer } = useSceneSelection();

    // Show ElementPropertiesPanel when an element is selected, otherwise show GlobalPropertiesPanel
    if (element && schema) {
        return (
            <ElementPropertiesPanel
                element={element}
                schema={schema}
                onConfigChange={onConfigChange}
            />
        );
    }

    return (
        <GlobalPropertiesPanel
            visualizer={visualizer}
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

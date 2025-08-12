import React from 'react';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import GlobalPropertiesPanel from './GlobalPropertiesPanel';
import { useSceneSelection } from '../../context/SceneSelectionContext';

interface PropertiesPanelProps {
    element?: any;
    schema?: any;
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;

    // Additional props for global functionality
    onExport: (exportSettings: any) => void; // simplified for now due to mixed JS/TS
    exportStatus: string;
    canExport: boolean;
    exportSettings: any;
    onExportSettingsChange: (settings: any) => void;
    debugSettings: { showAnchorPoints: boolean };
    onDebugSettingsChange: (settings: { showAnchorPoints: boolean }) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    element,
    schema,
    onConfigChange,
    onExport,
    exportStatus,
    canExport,
    exportSettings,
    onExportSettingsChange,
    debugSettings,
    onDebugSettingsChange
}) => {
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
            onExport={onExport}
            exportStatus={exportStatus}
            canExport={canExport}
            exportSettings={exportSettings}
            onExportSettingsChange={onExportSettingsChange}
            debugSettings={debugSettings}
            onDebugSettingsChange={onDebugSettingsChange}
        />
    );
};

export default PropertiesPanel;

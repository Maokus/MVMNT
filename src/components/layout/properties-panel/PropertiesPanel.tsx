import React from 'react';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import GlobalPropertiesPanel from './GlobalPropertiesPanel';

interface PropertiesPanelProps {
    element?: any;
    schema?: any;
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;

    // Additional props for global functionality
    visualizer?: any;
    onExport: (exportSettings: { fps: number; resolution: number; fullDuration: boolean }) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: { fps: number; resolution: number; fullDuration: boolean };
    onExportSettingsChange: (settings: { fps: number; resolution: number; fullDuration: boolean }) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    element,
    schema,
    onConfigChange,
    visualizer,
    onExport,
    exportStatus,
    canExport,
    exportSettings,
    onExportSettingsChange
}) => {
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
        />
    );
};

export default PropertiesPanel;

import React from 'react';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import GlobalPropertiesPanel from './GlobalPropertiesPanel';

interface PropertiesPanelProps {
    element?: any;
    schema?: any;
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    element,
    schema,
    onConfigChange
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

    return <GlobalPropertiesPanel />;
};

export default PropertiesPanel;

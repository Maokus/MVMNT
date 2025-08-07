import React from 'react';

interface GlobalPropertiesPanelProps {
    // Add props for global settings if needed in the future
}

const GlobalPropertiesPanel: React.FC<GlobalPropertiesPanelProps> = () => {
    return (
        <div className="global-properties-panel">
            <div className="global-properties-header">
                <h3>Global Properties</h3>
                <p className="description">Configure global settings for the visualizer</p>
            </div>

            <div className="global-properties-content">
                <p>No global properties configured yet.</p>
                <small>Global properties will be added here in future updates.</small>
            </div>
        </div>
    );
};

export default GlobalPropertiesPanel;

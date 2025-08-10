import React from 'react';
import MacroConfig from './MacroConfig';

interface GlobalPropertiesPanelProps {
    // Macro-related props
    visualizer?: any;

    // Export-related props
    onExport: (exportSettings: { fps: number; resolution: number; fullDuration: boolean }) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: { fps: number; resolution: number; fullDuration: boolean };
    onExportSettingsChange: (settings: { fps: number; resolution: number; fullDuration: boolean }) => void;
}

const GlobalPropertiesPanel: React.FC<GlobalPropertiesPanelProps> = ({
    visualizer,
    onExport,
    exportStatus,
    canExport,
    exportSettings,
    onExportSettingsChange
}) => {
    // Create a local function to handle export setting updates
    const updateExportSetting = (key: 'fps' | 'resolution' | 'fullDuration', value: any) => {
        const newSettings = {
            ...exportSettings,
            [key]: value
        };
        onExportSettingsChange(newSettings);
    };

    // Handle Enter key on export settings inputs
    const handleExportInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div className="global-properties-panel">

            <div className="global-properties-content">
                <div className="settings-grid">
                    {/* Global Macros Section */}
                    <div className="setting-group">
                        <MacroConfig
                            sceneBuilder={visualizer?.getSceneBuilder()}
                            visualizer={visualizer}
                        />
                    </div>

                    <div className="setting-group">
                        <h4>Export Settings</h4>
                        <label htmlFor="resolutionSelect">Resolution:</label>
                        <select
                            id="resolutionSelect"
                            value={exportSettings.resolution}
                            onChange={(e) => updateExportSetting('resolution', parseInt(e.target.value))}
                        >
                            <option value="1500">1500x1500px (Default)</option>
                            <option value="1080">1080x1080px (Instagram)</option>
                            <option value="720">720x720px (Smaller)</option>
                            <option value="2160">2160x2160px (4K)</option>
                        </select>

                        <label htmlFor="fpsInput">Frame Rate (FPS):</label>
                        <input
                            type="number"
                            id="fpsInput"
                            min="24"
                            max="60"
                            value={exportSettings.fps}
                            onChange={(e) => updateExportSetting('fps', parseInt(e.target.value))}
                            onKeyDown={handleExportInputKeyDown}
                        />

                        <label>
                            <input
                                type="checkbox"
                                id="fullDurationExport"
                                checked={exportSettings.fullDuration}
                                onChange={(e) => updateExportSetting('fullDuration', e.target.checked)}
                            />
                            Export full duration
                        </label>

                        <div className="export-actions" style={{ marginTop: '16px' }}>
                            <button
                                className="btn-export"
                                onClick={() => onExport(exportSettings)}
                                disabled={!canExport}
                                style={{
                                    width: '100%',
                                    padding: '8px 16px',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                📸 Export PNG Sequence
                            </button>
                            <span style={{
                                fontSize: '12px',
                                color: '#666',
                                marginTop: '8px',
                                display: 'block',
                                textAlign: 'center'
                            }}>
                                {exportStatus}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalPropertiesPanel;

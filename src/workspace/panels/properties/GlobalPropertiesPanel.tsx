import React, { useEffect, useState } from 'react';
import MacroConfig from './MacroConfig';
import { useVisualizer } from '@context/VisualizerContext';
import { useTimelineStore } from '@state/timelineStore';

interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime?: number;
    endTime?: number;
    // padding removed
    includeAudio?: boolean;
}

interface DebugSettings {
    showAnchorPoints: boolean;
}

interface GlobalPropertiesPanelProps {
    // Macro-related props
    visualizer?: any;

    // Export-related props
    onExport: (exportSettings: ExportSettings) => void;
    onExportVideo?: (exportSettings: ExportSettings) => void;
    exportStatus: string;
    canExport: boolean;
    exportSettings: ExportSettings;
    onExportSettingsChange: (settings: ExportSettings) => void;

    // Debug-related props (moved from SidePanels)
    debugSettings: DebugSettings;
    onDebugSettingsChange: (settings: DebugSettings) => void;
}

const GlobalPropertiesPanel: React.FC<GlobalPropertiesPanelProps> = (props) => {
    const ctx = useVisualizer();
    const visualizer = props.visualizer || ctx.visualizer;
    const onExport = props.onExport;
    // @ts-ignore optional video export function if provided via props or context (not typed yet)
    const onExportVideo = props.onExportVideo || (ctx as any).exportVideo;
    const exportStatus = props.exportStatus;
    const canExport = props.canExport;
    const exportSettings = props.exportSettings || ctx.exportSettings;
    const onExportSettingsChange = props.onExportSettingsChange || ctx.setExportSettings;
    const debugSettings = props.debugSettings || ctx.debugSettings;
    const onDebugSettingsChange = props.onDebugSettingsChange || ctx.setDebugSettings;
    const [localWidth, setLocalWidth] = useState(exportSettings.width);
    const [localHeight, setLocalHeight] = useState(exportSettings.height);
    // Global timing values from timeline store
    // Timing controls moved into timeline header; keep minimal flags if needed later
    const hasTempoMap = useTimelineStore((s) => (s.timeline.masterTempoMap?.length || 0) > 0);

    // Sync local state when external exportSettings change (e.g., reset)
    useEffect(() => {
        setLocalWidth(exportSettings.width);
        setLocalHeight(exportSettings.height);
    }, [exportSettings.width, exportSettings.height]);

    // Create a local function to handle export setting updates
    const updateExportSetting = (key: keyof ExportSettings, value: any) => {
        const newSettings = {
            ...exportSettings,
            [key]: value
        };
        onExportSettingsChange(newSettings);
    };

    // Handle Enter key on export settings inputs
    const handleExportInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // Commit width/height if these inputs
            const id = e.currentTarget.id;
            if (id === 'widthInput') commitSize('width');
            if (id === 'heightInput') commitSize('height');
            e.currentTarget.blur();
        }
    };

    const commitSize = (dimension: 'width' | 'height') => {
        if (dimension === 'width') {
            let w = parseInt(String(localWidth));
            if (!Number.isFinite(w) || w < 16) w = exportSettings.width; // revert invalid
            if (w !== exportSettings.width) updateExportSetting('width', w);
            setLocalWidth(w);
        } else {
            let h = parseInt(String(localHeight));
            if (!Number.isFinite(h) || h < 16) h = exportSettings.height;
            if (h !== exportSettings.height) updateExportSetting('height', h);
            setLocalHeight(h);
        }
    };

    // Removed commit handlers for tempo/meter

    return (
        <div className="global-properties-panel">

            <div className="global-properties-content">
                <div className="settings-grid">
                    {/* Global Macros Section */}
                    <div className="setting-group">
                        <MacroConfig visualizer={visualizer} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalPropertiesPanel;

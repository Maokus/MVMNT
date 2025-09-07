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
    prePadding?: number;
    postPadding?: number;
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
    const sceneBuilder = visualizer?.getSceneBuilder?.();
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
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const hasTempoMap = useTimelineStore((s) => (s.timeline.masterTempoMap?.length || 0) > 0);
    // Local editing buffers for tempo/meter
    const [localTempo, setLocalTempo] = useState<string>('');
    const [localBeatsPerBar, setLocalBeatsPerBar] = useState<string>('');

    useEffect(() => {
        setLocalTempo(String(Number.isFinite(globalBpm) ? globalBpm : 120));
    }, [globalBpm]);
    useEffect(() => {
        setLocalBeatsPerBar(String(Number.isFinite(beatsPerBar) ? beatsPerBar : 4));
    }, [beatsPerBar]);

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

    const commitTempo = () => {
        const v = parseFloat(localTempo);
        const value = Number.isFinite(v) && v > 0 ? v : (Number.isFinite(globalBpm) ? globalBpm : 120);
        if (sceneBuilder?.updateSceneSettings) sceneBuilder.updateSceneSettings({ tempo: value });
        else {
            try { useTimelineStore.getState().setGlobalBpm(value); } catch { }
        }
        setLocalTempo(String(value));
    };

    const commitBeatsPerBar = () => {
        const v = parseInt(localBeatsPerBar);
        const value = Number.isFinite(v) && v > 0 ? Math.floor(v) : (Number.isFinite(beatsPerBar) ? beatsPerBar : 4);
        if (sceneBuilder?.updateSceneSettings) sceneBuilder.updateSceneSettings({ beatsPerBar: value });
        else {
            try { useTimelineStore.getState().setBeatsPerBar(value); } catch { }
        }
        setLocalBeatsPerBar(String(value));
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
                        <h4>Scene Settings</h4>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <label htmlFor="widthInput">Width (px):</label>
                                <input
                                    type="number"
                                    id="widthInput"
                                    min={16}
                                    max={8192}
                                    value={localWidth}
                                    onChange={(e) => setLocalWidth(e.target.value === '' ? 0 : parseInt(e.target.value))}
                                    onBlur={() => commitSize('width')}
                                    onKeyDown={handleExportInputKeyDown}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label htmlFor="heightInput">Height (px):</label>
                                <input
                                    type="number"
                                    id="heightInput"
                                    min={16}
                                    max={8192}
                                    value={localHeight}
                                    onChange={(e) => setLocalHeight(e.target.value === '' ? 0 : parseInt(e.target.value))}
                                    onBlur={() => commitSize('height')}
                                    onKeyDown={handleExportInputKeyDown}
                                />
                            </div>
                        </div>

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

                        <div style={{ marginTop: '16px' }}>
                            <h4 style={{ marginBottom: '4px' }}>Timing</h4>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <label htmlFor="tempoInput">Tempo (BPM):</label>
                                    <input
                                        type="number"
                                        id="tempoInput"
                                        min={1}
                                        max={400}
                                        step={0.1}
                                        value={localTempo}
                                        onChange={(e) => setLocalTempo(e.target.value)}
                                        onBlur={commitTempo}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { commitTempo(); (e.currentTarget as any).blur?.(); } }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label htmlFor="beatsPerBarInput">Beats per Bar:</label>
                                    <input
                                        type="number"
                                        id="beatsPerBarInput"
                                        min={1}
                                        max={16}
                                        step={1}
                                        value={localBeatsPerBar}
                                        onChange={(e) => setLocalBeatsPerBar(e.target.value)}
                                        onBlur={commitBeatsPerBar}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { commitBeatsPerBar(); (e.currentTarget as any).blur?.(); } }}
                                    />
                                </div>
                            </div>
                            {hasTempoMap && (
                                <small style={{ color: '#888' }}>
                                    A tempo map is active. BPM acts as a fallback where the map has no entries.
                                </small>
                            )}
                        </div>

                        {/* Removed legacy export controls: pre/post padding, full duration, start/end. */}

                        <div style={{ marginTop: '16px' }}>
                            <h4 style={{ marginBottom: '4px' }}>Debug Settings</h4>
                            <label>
                                <input
                                    type="checkbox"
                                    id="showAnchorPoints"
                                    checked={debugSettings.showAnchorPoints}
                                    onChange={(e) => onDebugSettingsChange({ ...debugSettings, showAnchorPoints: e.target.checked })}
                                />{' '}
                                Show Anchor Points
                            </label>
                        </div>

                        <div className="export-actions" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                                className="w-full px-4 py-1.5 border rounded cursor-pointer text-sm font-semibold transition inline-flex items-center justify-center bg-violet-500 border-violet-400 text-white hover:bg-violet-400 hover:border-violet-300 disabled:bg-neutral-700 disabled:border-neutral-600 disabled:text-neutral-500 disabled:cursor-not-allowed"
                                onClick={() => onExport(exportSettings)}
                                disabled={!canExport}
                            >
                                📸 Export PNG Sequence
                            </button>
                            <button
                                className="w-full px-4 py-1.5 border rounded cursor-pointer text-sm font-semibold transition inline-flex items-center justify-center bg-violet-500 border-violet-400 text-white hover:bg-violet-400 hover:border-violet-300 disabled:bg-neutral-700 disabled:border-neutral-600 disabled:text-neutral-500 disabled:cursor-not-allowed"
                                onClick={() => onExportVideo && onExportVideo(exportSettings)}
                                disabled={!canExport || !onExportVideo}
                                title={!onExportVideo ? 'Video export not available' : ''}
                            >
                                🎬 Export MP4 Video
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

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore
import { MIDIVisualizerCore } from '../../visualizer/visualizer-core.js';
// @ts-ignore
import { ImageSequenceGenerator } from '../../visualizer/image-sequence-generator';

export interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
}

export interface DebugSettings {
    showAnchorPoints: boolean;
}

interface ProgressData { progress: number; text: string; }

interface VisualizerContextValue {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any | null;
    isPlaying: boolean;
    currentTimeLabel: string;
    numericCurrentTime: number;
    totalDuration: number;
    exportStatus: string;
    exportSettings: ExportSettings;
    setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
    debugSettings: DebugSettings;
    setDebugSettings: React.Dispatch<React.SetStateAction<DebugSettings>>;
    forceRender: () => void;
    playPause: () => void;
    stop: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    seekPercent: (percent: number) => void;
    exportSequence: (override?: Partial<ExportSettings>) => Promise<void>;
    showProgressOverlay: boolean;
    progressData: ProgressData;
    closeProgress: () => void;
}

const VisualizerContext = createContext<VisualizerContextValue | undefined>(undefined);

export const VisualizerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visualizer, setVisualizer] = useState<any | null>(null);
    const [imageSequenceGenerator, setImageSequenceGenerator] = useState<any | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTimeLabel, setCurrentTimeLabel] = useState('00:00 / 00:00');
    const [numericCurrentTime, setNumericCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [exportStatus, setExportStatus] = useState('Load MIDI or create scene to enable export');
    const [exportSettings, setExportSettings] = useState<ExportSettings>({
        fps: 30,
        width: 1500,
        height: 1500,
        fullDuration: true,
        startTime: 0,
        endTime: 0
    });
    const [debugSettings, setDebugSettings] = useState<DebugSettings>({ showAnchorPoints: false });
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState<ProgressData>({ progress: 0, text: 'Generating images...' });

    // Initialize visualizer
    useEffect(() => {
        if (canvasRef.current && !visualizer) {
            const vis = new MIDIVisualizerCore(canvasRef.current);
            vis.render();
            setVisualizer(vis);
            const gen = new ImageSequenceGenerator(canvasRef.current, vis);
            setImageSequenceGenerator(gen);
            (window as any).debugVisualizer = vis;
        }
    }, [visualizer]);

    // Animation / time update loop
    useEffect(() => {
        if (!visualizer) return;
        let raf: number;
        let lastCurrentTime = -1;
        let lastExportStatus = '';
        let lastUIUpdate = 0;
        const loop = () => {
            const current = Math.max(0, visualizer.currentTime || 0);
            const timeChanged = current !== lastCurrentTime;
            const now = performance.now();
            const shouldUpdateUI = timeChanged && (now - lastUIUpdate > 80);
            if (shouldUpdateUI) {
                const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);
                const curMin = Math.floor(current / 60);
                const curSec = Math.floor(current % 60);
                const totMin = Math.floor(total / 60);
                const totSec = Math.floor(total % 60);
                setCurrentTimeLabel(`${curMin.toString().padStart(2, '0')}:${curSec.toString().padStart(2, '0')} / ${totMin.toString().padStart(2, '0')}:${totSec.toString().padStart(2, '0')}`);
                setNumericCurrentTime(current);
                setTotalDuration(total);
                lastCurrentTime = current;
                lastUIUpdate = now;
                const hasValidScene = total > 0;
                const newExportStatus = hasValidScene ? 'Ready to export' : 'Load MIDI or create scene to enable export';
                if (newExportStatus !== lastExportStatus) {
                    setExportStatus(newExportStatus);
                    lastExportStatus = newExportStatus;
                }
            }
            raf = requestAnimationFrame(loop);
        };
        loop();
        const handleVisUpdate = () => {
            const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);
            const current = Math.max(0, visualizer.currentTime || 0);
            const curMin = Math.floor(current / 60);
            const curSec = Math.floor(current % 60);
            const totMin = Math.floor(total / 60);
            const totSec = Math.floor(total % 60);
            setCurrentTimeLabel(`${curMin.toString().padStart(2, '0')}:${curSec.toString().padStart(2, '0')} / ${totMin.toString().padStart(2, '0')}:${totSec.toString().padStart(2, '0')}`);
            setNumericCurrentTime(current);
            setTotalDuration(total);
        };
        visualizer.canvas?.addEventListener('visualizer-update', handleVisUpdate);
        return () => {
            cancelAnimationFrame(raf);
            visualizer.canvas?.removeEventListener('visualizer-update', handleVisUpdate);
            if (typeof visualizer.cleanup === 'function') visualizer.cleanup();
        };
    }, [visualizer]);

    // Apply export settings size changes
    useEffect(() => {
        if (!visualizer || !canvasRef.current) return;
        if (canvasRef.current.width !== exportSettings.width || canvasRef.current.height !== exportSettings.height) {
            // resize() now performs an immediate render for a static preview when not playing
            visualizer.resize(exportSettings.width, exportSettings.height);
        }
        visualizer.updateExportSettings?.(exportSettings);
    }, [visualizer, exportSettings]);

    // Apply debug settings
    useEffect(() => {
        if (!visualizer) return;
        visualizer.updateDebugSettings?.(debugSettings);
    }, [visualizer, debugSettings]);

    const playPause = useCallback(() => {
        if (!visualizer) return;
        if (visualizer.isPlaying) {
            visualizer.pause();
            setIsPlaying(false);
        } else {
            visualizer.play();
            setIsPlaying(true);
        }
    }, [visualizer]);

    const stop = useCallback(() => {
        if (!visualizer) return;
        visualizer.stop();
        setIsPlaying(false);
    }, [visualizer]);

    const stepForward = useCallback(() => { visualizer?.stepForward?.(); }, [visualizer]);
    const stepBackward = useCallback(() => { visualizer?.stepBackward?.(); }, [visualizer]);
    const forceRender = useCallback(() => { visualizer?.invalidateRender?.(); }, [visualizer]);
    const seekPercent = useCallback((percent: number) => {
        if (!visualizer || !totalDuration || totalDuration <= 0) return;
        visualizer.seek?.(percent * totalDuration);
    }, [visualizer, totalDuration]);

    const exportSequence = useCallback(async (override?: Partial<ExportSettings>) => {
        if (!visualizer || !imageSequenceGenerator) return;
        const settings: ExportSettings = { ...exportSettings, ...(override || {}) } as ExportSettings;
        if (!settings.fullDuration) {
            if (settings.startTime == null || settings.endTime == null || settings.startTime >= settings.endTime) {
                alert('Invalid start/end time for export');
                return;
            }
        }
        setShowProgressOverlay(true);
        setProgressData({ progress: 0, text: 'Generating images...' });
        try {
            let maxFrames: number | null = null; let startFrame = 0;
            if (!settings.fullDuration) {
                const duration = visualizer.getCurrentDuration();
                const clampedStart = Math.max(0, Math.min(settings.startTime, duration));
                const clampedEnd = Math.max(clampedStart, Math.min(settings.endTime, duration));
                const totalFrames = Math.ceil((clampedEnd - clampedStart) * settings.fps);
                maxFrames = totalFrames; startFrame = Math.floor(clampedStart * settings.fps);
            }
            await imageSequenceGenerator.generateImageSequence({
                fps: settings.fps,
                width: settings.width,
                height: settings.height,
                sceneName: 'scene',
                maxFrames,
                _startFrame: startFrame,
                onProgress: (progress: number, text: string = 'Generating images...') => setProgressData({ progress, text }),
            });
        } catch (e) {
            console.error('Export error', e);
            alert('Export failed: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setShowProgressOverlay(false);
        }
    }, [visualizer, imageSequenceGenerator, exportSettings]);

    const value: VisualizerContextValue = {
        canvasRef,
        visualizer,
        isPlaying,
        currentTimeLabel,
        numericCurrentTime,
        totalDuration,
        exportStatus,
        exportSettings,
        setExportSettings,
        debugSettings,
        setDebugSettings,
        forceRender,
        playPause,
        stop,
        stepForward,
        stepBackward,
        seekPercent,
        exportSequence,
        showProgressOverlay,
        progressData,
        closeProgress: () => setShowProgressOverlay(false)
    };

    return <VisualizerContext.Provider value={value}>{children}</VisualizerContext.Provider>;
};

export const useVisualizer = () => {
    const ctx = useContext(VisualizerContext);
    if (!ctx) throw new Error('useVisualizer must be used within VisualizerProvider');
    return ctx;
};

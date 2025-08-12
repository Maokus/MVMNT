import React, { useEffect, useRef, useState } from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import ProgressOverlay from './ProgressOverlay';
import { useMenuBar } from '../hooks/useMenuBar';
// @ts-ignore
import { MIDIVisualizerCore } from '../../visualizer/visualizer-core.js';
// @ts-ignore
import { ImageSequenceGenerator } from '../../visualizer/image-sequence-generator';
// @ts-ignore
import { SceneNameGenerator } from '../../visualizer/scene-name-generator.js';

const MidiVisualizer: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visualizer, setVisualizer] = useState<any>(null);
    const [imageSequenceGenerator, setImageSequenceGenerator] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState('00:00 / 00:00');
    const [numericCurrentTime, setNumericCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [sceneName, setSceneName] = useState(SceneNameGenerator.generate());
    const [exportStatus, setExportStatus] = useState('Load MIDI or create scene to enable export');
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState({ progress: 0, text: 'Generating images...' });
    const [sceneRefreshTrigger, setSceneRefreshTrigger] = useState(0);

    // Export settings managed at the top level
    const [exportSettings, setExportSettings] = useState({
        fps: 30,
        width: 1500,
        height: 1500,
        fullDuration: true,
        startTime: 0,
        endTime: 0
    });

    // Debug settings managed at the top level
    const [debugSettings, setDebugSettings] = useState({
        showAnchorPoints: false
    });

    // Initialize the visualizer when canvas is ready
    useEffect(() => {
        if (canvasRef.current && !visualizer) {
            console.log('Initializing MIDIVisualizer...');
            const vis = new MIDIVisualizerCore(canvasRef.current);

            // Render the initial default scene
            vis.render();

            setVisualizer(vis);

            // Initialize image sequence generator for export functionality
            const generator = new ImageSequenceGenerator(canvasRef.current, vis);
            setImageSequenceGenerator(generator);

            // Expose for debugging
            (window as any).debugVisualizer = vis;

            console.log('MIDIVisualizer initialized successfully');
        }
    }, [visualizer]);

    // Setup animation loop and event listeners
    useEffect(() => {
        if (!visualizer) return;

        let animationId: number;
        let lastCurrentTime = -1;
        let lastExportStatus = '';
        let lastUIUpdate = 0;

        const animate = () => {
            if (visualizer) {
                const currentTime = Math.max(0, visualizer.currentTime || 0);
                const timeChanged = currentTime !== lastCurrentTime;

                // Update time display only when time changes
                const now = performance.now();
                const shouldUpdateUI = timeChanged && (now - lastUIUpdate > 80); // ~12.5Hz
                if (shouldUpdateUI) {
                    // Only get total duration when time changes, not every frame
                    const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);

                    const currentMin = Math.floor(currentTime / 60);
                    const currentSec = Math.floor(currentTime % 60);
                    const totalMin = Math.floor(total / 60);
                    const totalSec = Math.floor(total % 60);

                    setCurrentTime(
                        `${currentMin.toString().padStart(2, '0')}:${currentSec.toString().padStart(2, '0')} / ` +
                        `${totalMin.toString().padStart(2, '0')}:${totalSec.toString().padStart(2, '0')}`
                    );
                    setNumericCurrentTime(currentTime);
                    setTotalDuration(total);
                    lastCurrentTime = currentTime;
                    lastUIUpdate = now;

                    // Update export status only when time changes (and we have fresh duration)
                    const hasValidScene = total > 0;
                    const newExportStatus = hasValidScene ? 'Ready to export' : 'Load MIDI or create scene to enable export';
                    if (newExportStatus !== lastExportStatus) {
                        setExportStatus(newExportStatus);
                        lastExportStatus = newExportStatus;
                    }
                }

                // Don't call visualizer.animate() here; the core manages its own RAF when playing.
            }

            animationId = requestAnimationFrame(animate);
        };

        animate();

        // Listen for visualizer changes that require re-render
        const handleVisualizerUpdate = () => {
            if (!visualizer) return;
            // Render once when explicitly invalidated (e.g., settings change, resize, MIDI load)
            if (typeof visualizer.render === 'function') {
                visualizer.render();
            }
            // Immediately refresh duration and time display when visualizer signals an update
            const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);
            const nowTime = Math.max(0, visualizer.currentTime || 0);

            const currentMin = Math.floor(nowTime / 60);
            const currentSec = Math.floor(nowTime % 60);
            const totalMin = Math.floor(total / 60);
            const totalSec = Math.floor(total % 60);

            setCurrentTime(
                `${currentMin.toString().padStart(2, '0')}:${currentSec.toString().padStart(2, '0')} / ` +
                `${totalMin.toString().padStart(2, '0')}:${totalSec.toString().padStart(2, '0')}`
            );
            setNumericCurrentTime(nowTime);
            setTotalDuration(total);
        };

        // Add event listeners for changes that require re-render
        if (visualizer.canvas) {
            visualizer.canvas.addEventListener('visualizer-update', handleVisualizerUpdate);
        }

        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            if (visualizer.canvas) {
                visualizer.canvas.removeEventListener('visualizer-update', handleVisualizerUpdate);
            }
            // Ensure the core cleans up any listeners and RAFs on unmount
            if (typeof visualizer.cleanup === 'function') {
                visualizer.cleanup();
            }
        };
    }, [visualizer]);

    // Handle export settings changes (size, fps)
    useEffect(() => {
        if (visualizer && canvasRef.current) {
            const canvas = canvasRef.current;
            if (canvas.width !== exportSettings.width || canvas.height !== exportSettings.height) {
                console.log(`Updating canvas size to ${exportSettings.width}x${exportSettings.height}`);
                visualizer.resize(exportSettings.width, exportSettings.height);
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }
            }
            if (visualizer.updateExportSettings) {
                visualizer.updateExportSettings(exportSettings);
            }
        }
    }, [visualizer, exportSettings]);

    // Update visualizer's debug settings when they change
    useEffect(() => {
        if (visualizer) {
            if (visualizer.updateDebugSettings) {
                visualizer.updateDebugSettings(debugSettings);
            }
        }
    }, [visualizer, debugSettings]);

    // Handle scene refresh trigger
    const handleSceneRefresh = () => {
        setSceneRefreshTrigger(prev => prev + 1);
    };

    // Handle export settings changes
    const handleExportSettingsChange = (newSettings: typeof exportSettings) => {
        setExportSettings(newSettings);
    };

    // Handle debug settings changes
    const handleDebugSettingsChange = (newSettings: typeof debugSettings) => {
        setDebugSettings(newSettings);
    };

    // Use the MenuBar hook to get menu actions
    const menuBarActions = useMenuBar({
        visualizer,
        sceneName,
        onSceneNameChange: setSceneName,
        onSceneRefresh: handleSceneRefresh
    });

    const handlePlayPause = () => {
        if (!visualizer) return;

        if (visualizer.isPlaying) {
            visualizer.pause();
            setIsPlaying(false);
        } else {
            visualizer.play();
            setIsPlaying(true);
        }
    };

    const handleStop = () => {
        if (!visualizer) return;

        visualizer.stop();
        setIsPlaying(false);
    };

    const handleStepForward = () => {
        if (!visualizer) return;
        if (visualizer.stepForward) {
            visualizer.stepForward();
        }
    };

    const handleStepBackward = () => {
        if (!visualizer) return;
        if (visualizer.stepBackward) {
            visualizer.stepBackward();
        }
    };

    const handleSeekAtPercent = (percent: number) => {
        if (!visualizer || !totalDuration || totalDuration <= 0) return;
        const target = percent * totalDuration;
        if (typeof visualizer.seek === 'function') {
            visualizer.seek(target);
        }
    };

    const handleExport = async (exportSettingsOverride?: any) => {
        if (!visualizer || !imageSequenceGenerator) return;
        const settings = exportSettingsOverride || exportSettings;

        // Validate partial range
        if (!settings.fullDuration) {
            if (settings.startTime == null || settings.endTime == null || settings.startTime >= settings.endTime) {
                alert('Invalid start/end time for export');
                return;
            }
        }

        setShowProgressOverlay(true);
        setProgressData({ progress: 0, text: 'Generating images...' });

        try {
            // Determine frame range
            let maxFrames: number | null = null;
            let startFrame = 0;
            if (!settings.fullDuration) {
                const duration = visualizer.getCurrentDuration();
                const clampedStart = Math.max(0, Math.min(settings.startTime, duration));
                const clampedEnd = Math.max(clampedStart, Math.min(settings.endTime, duration));
                const totalFrames = Math.ceil((clampedEnd - clampedStart) * settings.fps);
                maxFrames = totalFrames;
                startFrame = Math.floor(clampedStart * settings.fps);
            }

            await imageSequenceGenerator.generateImageSequence({
                fps: settings.fps,
                width: settings.width,
                height: settings.height,
                sceneName: sceneName,
                maxFrames,
                // Custom pass-through for range (extended generator will look for these non-standard props)
                // @ts-ignore
                _startFrame: startFrame,
                onProgress: (progress: number, text: string = 'Generating images...') => {
                    setProgressData({ progress, text });
                },
                onComplete: (blob: Blob) => {
                    console.log('Image sequence generation completed');
                }
            });
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setShowProgressOverlay(false);
        }
    };

    return (
        <div className="app-container">
            <MenuBar
                sceneName={sceneName}
                onSceneNameChange={setSceneName}
                menuBarActions={menuBarActions}
            />

            <div className="main-workspace">
                <PreviewPanel
                    canvasRef={canvasRef}
                    isPlaying={isPlaying}
                    onPlayPause={handlePlayPause}
                    onStop={handleStop}
                    onStepForward={handleStepForward}
                    onStepBackward={handleStepBackward}
                    currentTime={currentTime}
                    width={exportSettings.width}
                    height={exportSettings.height}
                    progressPercent={totalDuration > 0 ? (numericCurrentTime / totalDuration) : 0}
                    onSeekAtPercent={handleSeekAtPercent}
                />

                <SidePanels
                    visualizer={visualizer}
                    sceneRefreshTrigger={sceneRefreshTrigger}
                    onExport={(settings) => handleExport(settings)}
                    exportStatus={exportStatus}
                    canExport={visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0}
                    exportSettings={exportSettings}
                    onExportSettingsChange={handleExportSettingsChange}
                    debugSettings={debugSettings}
                    onDebugSettingsChange={handleDebugSettingsChange}
                />
            </div>

            {showProgressOverlay && (
                <ProgressOverlay
                    progress={progressData.progress}
                    text={progressData.text}
                    onClose={() => setShowProgressOverlay(false)}
                />
            )}
        </div>
    );
};

export default MidiVisualizer;

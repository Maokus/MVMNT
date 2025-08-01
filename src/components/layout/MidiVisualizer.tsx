import React, { useEffect, useRef, useState } from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import ProgressOverlay from './ProgressOverlay';
import { useMenuBar } from '../hooks/useMenuBar';
// @ts-ignore
import { MIDIVisualizerCore } from '../../visualizer/visualizer-core.js';
// @ts-ignore
import { MIDIParser } from '../../visualizer/midi-parser';
// @ts-ignore
import { ImageSequenceGenerator } from '../../visualizer/image-sequence-generator';
// @ts-ignore
import { SceneNameGenerator } from '../../visualizer/scene-name-generator.js';

const MidiVisualizer: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visualizer, setVisualizer] = useState<any>(null);
    const [imageSequenceGenerator, setImageSequenceGenerator] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentMidiData, setCurrentMidiData] = useState<any>(null);
    const [currentTime, setCurrentTime] = useState('00:00 / 00:00');
    const [sceneName, setSceneName] = useState(SceneNameGenerator.generate());
    const [exportStatus, setExportStatus] = useState('Load MIDI or create scene to enable export');
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState({ progress: 0, text: 'Generating images...' });
    const [sceneRefreshTrigger, setSceneRefreshTrigger] = useState(0);

    // Export settings managed at the top level
    const [exportSettings, setExportSettings] = useState({
        fps: 30,
        resolution: 1500,
        fullDuration: true
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

            console.log('MIDIVisualizer initialized successfully');
        }
    }, [visualizer]);

    // Setup animation loop and event listeners
    useEffect(() => {
        if (!visualizer) return;

        let animationId: number;
        let lastCurrentTime = -1;
        let lastExportStatus = '';
        let needsRender = true; // Force initial render

        const animate = () => {
            if (visualizer) {
                const currentTime = Math.max(0, visualizer.currentTime || 0);

                // Only render if something has changed or if playing
                const timeChanged = currentTime !== lastCurrentTime;
                const isPlaying = visualizer.isPlaying;

                if (needsRender || isPlaying || timeChanged) {
                    if (visualizer.render) {
                        visualizer.render();
                    }
                    needsRender = false;
                }

                // Update time display only when time changes
                if (timeChanged) {
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
                    lastCurrentTime = currentTime;

                    // Update export status only when time changes (and we have fresh duration)
                    const hasValidScene = total > 0;
                    const newExportStatus = hasValidScene ? 'Ready to export' : 'Load MIDI or create scene to enable export';
                    if (newExportStatus !== lastExportStatus) {
                        setExportStatus(newExportStatus);
                        lastExportStatus = newExportStatus;
                    }
                }

                // Only animate when playing
                if (isPlaying) {
                    if (visualizer.animate) {
                        visualizer.animate();
                    }
                }
            }

            animationId = requestAnimationFrame(animate);
        };

        animate();

        // Listen for visualizer changes that require re-render
        const handleVisualizerUpdate = () => {
            needsRender = true;
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
        };
    }, [visualizer, currentMidiData]);

    // Handle export settings changes, especially resolution changes
    useEffect(() => {
        if (visualizer && canvasRef.current) {
            // Update canvas resolution when export settings change
            const canvas = canvasRef.current;
            if (canvas.width !== exportSettings.resolution || canvas.height !== exportSettings.resolution) {
                console.log(`Updating canvas resolution to ${exportSettings.resolution}x${exportSettings.resolution}`);
                visualizer.resize(exportSettings.resolution, exportSettings.resolution);

                // Trigger a rerender to show the resolution change immediately
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }
            }

            // Update visualizer's export settings
            if (visualizer.updateExportSettings) {
                visualizer.updateExportSettings(exportSettings);
            }
        }
    }, [visualizer, exportSettings]);

    const handleMidiLoad = async (file: File) => {
        if (!visualizer) return;

        try {
            console.log('Loading MIDI file:', file.name);
            const parser = new MIDIParser();
            const midiData = await parser.parseMIDIFile(file);

            visualizer.loadMIDIData(midiData);
            setCurrentMidiData(midiData);
            setExportStatus('Ready to export');

            console.log('MIDI file loaded successfully');
        } catch (error) {
            console.error('Error loading MIDI file:', error);
            alert('Error loading MIDI file: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    // Handle scene refresh trigger
    const handleSceneRefresh = () => {
        setSceneRefreshTrigger(prev => prev + 1);
    };

    // Handle export settings changes
    const handleExportSettingsChange = (newSettings: typeof exportSettings) => {
        setExportSettings(newSettings);
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

    const handleExport = async (exportSettings?: { fps: number; resolution: number; fullDuration: boolean }) => {
        if (!visualizer || !imageSequenceGenerator) return;

        // Use passed settings or defaults
        const settings = exportSettings || { fps: 30, resolution: 1500, fullDuration: true };

        setShowProgressOverlay(true);
        setProgressData({ progress: 0, text: 'Generating images...' });

        try {
            await imageSequenceGenerator.generateImageSequence({
                fps: settings.fps,
                width: settings.resolution,
                height: settings.resolution,
                sceneName: sceneName,
                maxFrames: settings.fullDuration ? null : Math.ceil(visualizer.getCurrentDuration() * settings.fps * 0.5), // 50% if not full duration
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
                onMidiLoad={handleMidiLoad}
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
                    resolution={exportSettings.resolution}
                />

                <SidePanels
                    visualizer={visualizer}
                    sceneRefreshTrigger={sceneRefreshTrigger}
                    onExport={(settings) => handleExport(settings)}
                    exportStatus={exportStatus}
                    canExport={visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0}
                    exportSettings={exportSettings}
                    onExportSettingsChange={handleExportSettingsChange}
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

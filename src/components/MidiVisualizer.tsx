import React, { useEffect, useRef, useState } from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import ProgressOverlay from './ProgressOverlay';
// @ts-ignore
import { MIDIVisualizer as MIDIVisualizerCore } from '../visualizer/visualizer.js';
// @ts-ignore
import { MIDIParser } from '../core/midi-parser.js';
// @ts-ignore
import { ImageSequenceGenerator } from '../core/image-sequence-generator.js';

const MidiVisualizer: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visualizer, setVisualizer] = useState<any>(null);
    const [imageSequenceGenerator, setImageSequenceGenerator] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentMidiData, setCurrentMidiData] = useState<any>(null);
    const [currentTime, setCurrentTime] = useState('00:00 / 00:00');
    const [sceneName, setSceneName] = useState('My Scene');
    const [exportStatus, setExportStatus] = useState('Load MIDI to enable export');
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState({ progress: 0, text: 'Generating images...' });

    // Initialize the visualizer when canvas is ready
    useEffect(() => {
        if (canvasRef.current && !visualizer) {
            console.log('Initializing MIDIVisualizer...');
            const vis = new MIDIVisualizerCore(canvasRef.current);
            setVisualizer(vis);

            // Initialize image sequence generator for export functionality
            const generator = new ImageSequenceGenerator(vis);
            setImageSequenceGenerator(generator);

            console.log('MIDIVisualizer initialized successfully');
        }
    }, [visualizer]);

    // Setup animation loop and event listeners
    useEffect(() => {
        if (!visualizer) return;

        let animationId: number;

        const animate = () => {
            if (visualizer && visualizer.isPlaying) {
                if (visualizer.animate) {
                    visualizer.animate();
                }
                if (visualizer.render) {
                    visualizer.render();
                }

                // Update time display
                const current = Math.max(0, visualizer.currentTime || 0);
                const total = visualizer.duration || 0;
                const currentMin = Math.floor(current / 60);
                const currentSec = Math.floor(current % 60);
                const totalMin = Math.floor(total / 60);
                const totalSec = Math.floor(total % 60);

                setCurrentTime(
                    `${currentMin.toString().padStart(2, '0')}:${currentSec.toString().padStart(2, '0')} / ` +
                    `${totalMin.toString().padStart(2, '0')}:${totalSec.toString().padStart(2, '0')}`
                );
            }

            animationId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        };
    }, [visualizer, isPlaying]);

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

    const handleExport = async () => {
        if (!visualizer || !imageSequenceGenerator || !currentMidiData) return;

        setShowProgressOverlay(true);
        setProgressData({ progress: 0, text: 'Generating images...' });

        try {
            await imageSequenceGenerator.generateImageSequence(
                currentMidiData,
                {
                    onProgress: (progress: number, text: string) => {
                        setProgressData({ progress, text });
                    }
                }
            );
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    return (
        <div className="app-container">
            <MenuBar
                sceneName={sceneName}
                onSceneNameChange={setSceneName}
                onMidiLoad={handleMidiLoad}
                onExport={handleExport}
                exportStatus={exportStatus}
                canExport={!!currentMidiData}
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
                />

                <SidePanels
                    visualizer={visualizer}
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

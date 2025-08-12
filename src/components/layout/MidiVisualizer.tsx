import React, { useState } from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import ProgressOverlay from './ProgressOverlay';
import { useMenuBar } from '../hooks/useMenuBar';
import { VisualizerProvider, useVisualizer } from '../context/VisualizerContext';
// @ts-ignore
import { SceneNameGenerator } from '../../visualizer/scene-name-generator.js';

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const {
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
        playPause,
        stop,
        stepForward,
        stepBackward,
        seekPercent,
        exportSequence,
        showProgressOverlay,
        progressData,
        closeProgress
    } = useVisualizer();

    const [sceneName, setSceneName] = useState(SceneNameGenerator.generate());
    const [sceneRefreshTrigger, setSceneRefreshTrigger] = useState(0);

    const handleSceneRefresh = () => setSceneRefreshTrigger(p => p + 1);

    const menuBarActions = useMenuBar({
        visualizer,
        sceneName,
        onSceneNameChange: setSceneName,
        onSceneRefresh: handleSceneRefresh
    });

    return (
        <div className="app-container">
            <MenuBar sceneName={sceneName} onSceneNameChange={setSceneName} menuBarActions={menuBarActions} />
            <div className="main-workspace">
                <PreviewPanel
                    canvasRef={canvasRef}
                    isPlaying={isPlaying}
                    onPlayPause={playPause}
                    onStop={stop}
                    onStepForward={stepForward}
                    onStepBackward={stepBackward}
                    currentTime={currentTimeLabel}
                    width={exportSettings.width}
                    height={exportSettings.height}
                    progressPercent={totalDuration > 0 ? (numericCurrentTime / totalDuration) : 0}
                    onSeekAtPercent={seekPercent}
                />
                <SidePanels
                    visualizer={visualizer}
                    sceneRefreshTrigger={sceneRefreshTrigger}
                    onExport={(settings) => exportSequence(settings)}
                    exportStatus={exportStatus}
                    canExport={!!(visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0)}
                    exportSettings={exportSettings}
                    onExportSettingsChange={setExportSettings}
                    debugSettings={debugSettings}
                    onDebugSettingsChange={setDebugSettings}
                />
            </div>
            {showProgressOverlay && (
                <ProgressOverlay progress={progressData.progress} text={progressData.text} onClose={closeProgress} />
            )}
        </div>
    );
};

const MidiVisualizer: React.FC = () => (
    <VisualizerProvider>
        <MidiVisualizerInner />
    </VisualizerProvider>
);

export default MidiVisualizer;

import React from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import { SceneSelectionProvider } from '../context/SceneSelectionContext';
import ExportProgressOverlay from './ExportProgressOverlay';
import { VisualizerProvider, useVisualizer } from '../context/VisualizerContext';
import { SceneProvider } from '../context/SceneContext';
import { MacroProvider } from '../context/MacroContext';

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress } = useVisualizer() as any;
    const sceneRefreshTrigger = 0;

    return (
        <div className="app-container">
            <MenuBar />
            <SceneSelectionProvider sceneRefreshTrigger={sceneRefreshTrigger}>
                <div className="main-workspace">
                    <PreviewPanel />
                    <SidePanels sceneRefreshTrigger={sceneRefreshTrigger} />
                </div>
            </SceneSelectionProvider>
            {showProgressOverlay && (
                <ExportProgressOverlay progress={progressData.progress} text={progressData.text} onClose={closeProgress} />
            )}
        </div>
    );
};

const MidiVisualizer: React.FC = () => (
    <VisualizerProvider>
        <MacroProvider>
            <SceneProvider>
                <MidiVisualizerInner />
            </SceneProvider>
        </MacroProvider>
    </VisualizerProvider>
);

export default MidiVisualizer;

import React, { useEffect, useState } from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import { SceneSelectionProvider } from '@context/SceneSelectionContext';
import ExportProgressOverlay from './ExportProgressOverlay';
import { VisualizerProvider, useVisualizer } from '@context/VisualizerContext';
import { SceneProvider } from '@context/SceneContext';
import { MacroProvider } from '@context/MacroContext';
import OnboardingOverlay from './OnboardingOverlay';

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress } = useVisualizer() as any;
    const sceneRefreshTrigger = 0;
    const [showOnboarding, setShowOnboarding] = useState(false);

    // Detect first visit via localStorage; show onboarding once
    useEffect(() => {
        try {
            const KEY = 'mvmnt_onboarded_v1';
            if (!localStorage.getItem(KEY)) {
                setShowOnboarding(true);
                localStorage.setItem(KEY, '1'); // set immediately to avoid race on reload
            }
        } catch { /* ignore */ }
    }, []);

    return (
        <div className="app-container">
            <MenuBar onHelp={() => setShowOnboarding(true)} />
            <SceneSelectionProvider sceneRefreshTrigger={sceneRefreshTrigger}>
                <div className="main-workspace">
                    <PreviewPanel />
                    <SidePanels sceneRefreshTrigger={sceneRefreshTrigger} />
                </div>
            </SceneSelectionProvider>
            {showProgressOverlay && (
                <ExportProgressOverlay progress={progressData.progress} text={progressData.text} onClose={closeProgress} />
            )}
            {showOnboarding && <OnboardingOverlay onClose={() => setShowOnboarding(false)} />}
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

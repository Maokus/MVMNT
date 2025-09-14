import React, { useEffect, useState } from 'react';
import MenuBar from './MenuBar';
import PreviewPanel from './PreviewPanel';
import SidePanels from './SidePanels';
import { TimelinePanel } from '@ui/panels/TimelinePanel';
import SmallScreenWarning from './SmallScreenWarning';
import { SceneSelectionProvider } from '@context/SceneSelectionContext';
import ExportProgressOverlay from './ExportProgressOverlay';
import { VisualizerProvider, useVisualizer } from '@context/VisualizerContext';
import { SceneProvider } from '@context/SceneContext';
import { UndoProvider } from '@context/UndoContext';
import { MacroProvider } from '@context/MacroContext';
import OnboardingOverlay from './OnboardingOverlay';
import RenderModal from './RenderModal';

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress } = useVisualizer() as any;
    const sceneRefreshTrigger = 0;
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [sidePanelsVisible, setSidePanelsVisible] = useState(true);
    const [timelineVisible, setTimelineVisible] = useState(true);
    const [showSmallScreenWarning, setShowSmallScreenWarning] = useState(false);
    const [showRenderModal, setShowRenderModal] = useState(false);

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

    // Small-screen warning modal logic
    useEffect(() => {
        const KEY = 'mvmnt_small_screen_override_v1';
        const check = () => {
            try {
                const overridden = localStorage.getItem(KEY) === '1';
                const shouldWarn = window.innerWidth < 1200 && !overridden;
                setShowSmallScreenWarning(shouldWarn);
            } catch {
                setShowSmallScreenWarning(window.innerWidth < 1200);
            }
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const proceedSmallScreen = () => {
        try { localStorage.setItem('mvmnt_small_screen_override_v1', '1'); } catch { }
        setShowSmallScreenWarning(false);
    };

    // Listen for render modal open events
    useEffect(() => {
        const handler = () => setShowRenderModal(true);
        window.addEventListener('open-render-modal', handler as EventListener);
        return () => window.removeEventListener('open-render-modal', handler as EventListener);
    }, []);

    return (
        <div className="app-container">
            <MenuBar
                onHelp={() => setShowOnboarding(true)}
                onToggleSidePanels={() => setSidePanelsVisible(v => !v)}
                onToggleTimeline={() => setTimelineVisible(v => !v)}
                sidePanelsVisible={sidePanelsVisible}
                timelineVisible={timelineVisible}
            />
            <SceneSelectionProvider sceneRefreshTrigger={sceneRefreshTrigger}>
                <div className="main-workspace">
                    <PreviewPanel />
                    {sidePanelsVisible && <SidePanels sceneRefreshTrigger={sceneRefreshTrigger} />}
                </div>
                {timelineVisible && (
                    <div className="timeline-container">
                        <TimelinePanel />
                    </div>
                )}
            </SceneSelectionProvider>
            {showProgressOverlay && (
                <ExportProgressOverlay progress={progressData.progress} text={progressData.text} onClose={closeProgress} />
            )}
            {showOnboarding && <OnboardingOverlay onClose={() => setShowOnboarding(false)} />}

            {showSmallScreenWarning && (<SmallScreenWarning onProceed={proceedSmallScreen} />)}
            {showRenderModal && <RenderModal onClose={() => setShowRenderModal(false)} />}
        </div>
    );
};

const MidiVisualizer: React.FC = () => (
    <VisualizerProvider>
        <MacroProvider>
            <UndoProvider>
                <SceneProvider>
                    <MidiVisualizerInner />
                </SceneProvider>
            </UndoProvider>
        </MacroProvider>
    </VisualizerProvider>
);

export default MidiVisualizer;

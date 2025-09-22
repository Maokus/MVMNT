import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MenuBar from './MenuBar';
import PreviewPanel from '@workspace/panels/preview/PreviewPanel';
import SidePanels from './SidePanels';
import { TimelinePanel } from '@workspace/panels/timeline';
import SmallScreenWarning from './SmallScreenWarning';
import { SceneSelectionProvider } from '@context/SceneSelectionContext';
import ExportProgressOverlay from './ExportProgressOverlay';
import { VisualizerProvider, useVisualizer } from '@context/VisualizerContext';
import { SceneProvider } from '@context/SceneContext';
import { UndoProvider } from '@context/UndoContext';
import { MacroProvider } from '@context/MacroContext';
import OnboardingOverlay from './OnboardingOverlay';
import RenderModal from './RenderModal';
import { importScene } from '@persistence/index';
import { createDefaultMIDIScene, createAllElementsDebugScene, createDebugScene } from '@core/scene-templates';
import { useScene } from '@context/SceneContext';
import { useUndo } from '@context/UndoContext';

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress, exportKind } = useVisualizer() as any;
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
                <ExportProgressOverlay kind={exportKind} progress={progressData.progress} text={progressData.text} onClose={closeProgress} />
            )}
            {showOnboarding && <OnboardingOverlay onClose={() => setShowOnboarding(false)} />}

            {showSmallScreenWarning && (<SmallScreenWarning onProceed={proceedSmallScreen} />)}
            {showRenderModal && <RenderModal onClose={() => setShowRenderModal(false)} />}
        </div>
    );
};

const MidiVisualizer: React.FC = () => {
    return (
        <VisualizerProvider>
            <MacroProvider>
                <UndoProvider>
                    <SceneProvider>
                        <TemplateInitializer />
                        <MidiVisualizerInner />
                    </SceneProvider>
                </UndoProvider>
            </MacroProvider>
        </VisualizerProvider>
    );
};

// Handles applying template/import based on navigation state or session storage
const TemplateInitializer: React.FC = () => {
    const { visualizer } = useVisualizer() as any;
    const { setSceneName, refreshSceneUI } = useScene();
    const undo = (() => { try { return useUndo(); } catch { return null; } })();
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (!visualizer) return;
        const state: any = location.state || {};
        let didChange = false;
        try {
            const sceneBuilder = visualizer.getSceneBuilder?.();
            if (!sceneBuilder) return;
            if (state.importScene) {
                const payload = sessionStorage.getItem('mvmnt_import_scene_payload');
                if (payload) {
                    try {
                        const result = importScene(payload);
                        if (!result.ok) {
                            console.warn('[HomePage Import] Failed:', result.errors.map(e => e.message).join('\n'));
                        } else {
                            try {
                                const parsed = JSON.parse(payload);
                                if (parsed?.metadata?.name) setSceneName(parsed.metadata.name);
                            } catch { }
                            undo?.reset();
                            refreshSceneUI();
                            didChange = true;
                        }
                    } catch (e) {
                        console.error('Failed to import scene payload from HomePage', e);
                    }
                    sessionStorage.removeItem('mvmnt_import_scene_payload');
                }
            } else if (state.template) {
                const tpl = state.template as string;
                sceneBuilder.clearElements();
                switch (tpl) {
                    case 'blank':
                        sceneBuilder.resetSceneSettings?.();
                        break;
                    case 'default':
                        createDefaultMIDIScene(sceneBuilder);
                        break;
                    case 'debug':
                        try { createAllElementsDebugScene(sceneBuilder); }
                        catch { createDebugScene(sceneBuilder); }
                        break;
                    default:
                        createDefaultMIDIScene(sceneBuilder);
                }
                refreshSceneUI();
                didChange = true;
            }
            if (didChange) {
                visualizer.invalidateRender?.();
                navigate('/workspace', { replace: true });
            }
        } catch (e) {
            console.error('Template initialization error', e);
        }
    }, [visualizer, location.state, navigate, refreshSceneUI, setSceneName, undo]);
    return null;
};

export default MidiVisualizer;

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { dispatchSceneCommand } from '@state/scene';
import { useScene } from '@context/SceneContext';
import { useUndo } from '@context/UndoContext';

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const SIDE_MIN_WIDTH = 320;
const SIDE_MAX_WIDTH = 720;
const PREVIEW_MIN_WIDTH = 520;
const SIDE_HANDLE_WIDTH = 6;
const TIMELINE_MIN_HEIGHT = 160;
const TIMELINE_HANDLE_HEIGHT = 8;

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress, exportKind } = useVisualizer() as any;
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [sidePanelsVisible, setSidePanelsVisible] = useState(true);
    const [timelineVisible, setTimelineVisible] = useState(true);
    const [showSmallScreenWarning, setShowSmallScreenWarning] = useState(false);
    const [showRenderModal, setShowRenderModal] = useState(false);
    const workspaceRef = useRef<HTMLDivElement | null>(null);
    const sideResizeRef = useRef<null | { startX: number; startWidth: number; containerWidth: number }>(null);
    const timelineResizeRef = useRef<null | { startY: number; startHeight: number }>(null);
    const [sidePanelWidth, setSidePanelWidth] = useState(() => {
        if (typeof window === 'undefined') return 360;
        const approx = Math.round(window.innerWidth * 0.28);
        const maxCandidate = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, window.innerWidth - PREVIEW_MIN_WIDTH));
        return clampNumber(approx, SIDE_MIN_WIDTH, maxCandidate);
    });
    const [timelineHeight, setTimelineHeight] = useState(() => {
        if (typeof window === 'undefined') return 240;
        const approx = Math.round(window.innerHeight * 0.25);
        const maxCandidate = Math.max(TIMELINE_MIN_HEIGHT, Math.round(window.innerHeight * 0.65));
        return clampNumber(approx, TIMELINE_MIN_HEIGHT, maxCandidate);
    });

    const getTimelineBounds = useCallback(() => {
        if (typeof window === 'undefined') {
            return { min: TIMELINE_MIN_HEIGHT, max: TIMELINE_MIN_HEIGHT * 3 };
        }
        const viewport = window.innerHeight || 900;
        const ideal = Math.round(viewport * 0.65);
        const lowerBound = TIMELINE_MIN_HEIGHT + 60;
        const upperBound = Math.max(lowerBound, viewport - 160);
        const max = clampNumber(ideal, lowerBound, upperBound);
        return { min: TIMELINE_MIN_HEIGHT, max: Math.max(TIMELINE_MIN_HEIGHT, max) };
    }, []);

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

    useEffect(() => {
        const handleResize = () => {
            const bounds = getTimelineBounds();
            setTimelineHeight((prev) => clampNumber(prev, bounds.min, bounds.max));
            const container = workspaceRef.current;
            if (!container) return;
            const width = container.getBoundingClientRect().width;
            const maxCandidate = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, width - PREVIEW_MIN_WIDTH));
            setSidePanelWidth((prev) => clampNumber(prev, SIDE_MIN_WIDTH, maxCandidate));
        };
        handleResize();
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
        return undefined;
    }, [getTimelineBounds]);

    useEffect(() => {
        if (!sidePanelsVisible) return;
        const container = workspaceRef.current;
        if (!container) return;
        const width = container.getBoundingClientRect().width;
        const maxCandidate = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, width - PREVIEW_MIN_WIDTH));
        setSidePanelWidth((prev) => clampNumber(prev, SIDE_MIN_WIDTH, maxCandidate));
    }, [sidePanelsVisible]);

    const proceedSmallScreen = () => {
        try { localStorage.setItem('mvmnt_small_screen_override_v1', '1'); } catch { }
        setShowSmallScreenWarning(false);
    };

    const handleSideResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!sidePanelsVisible) return;
        const container = workspaceRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        sideResizeRef.current = {
            startX: e.clientX,
            startWidth: sidePanelWidth,
            containerWidth: rect.width,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const handleSideResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = sideResizeRef.current;
        if (!state || !sidePanelsVisible) return;
        const containerWidth = workspaceRef.current?.getBoundingClientRect().width ?? state.containerWidth;
        const maxCandidate = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, containerWidth - PREVIEW_MIN_WIDTH));
        const delta = e.clientX - state.startX;
        const next = clampNumber(state.startWidth - delta, SIDE_MIN_WIDTH, maxCandidate);
        setSidePanelWidth(next);
    };

    const handleSideResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!sideResizeRef.current) return;
        sideResizeRef.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
    };

    const handleTimelineResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!timelineVisible) return;
        timelineResizeRef.current = { startY: e.clientY, startHeight: timelineHeight };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const handleTimelineResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = timelineResizeRef.current;
        if (!state || !timelineVisible) return;
        const bounds = getTimelineBounds();
        const delta = e.clientY - state.startY;
        const next = clampNumber(state.startHeight + delta, bounds.min, bounds.max);
        setTimelineHeight(next);
    };

    const handleTimelineResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!timelineResizeRef.current) return;
        timelineResizeRef.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
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
            <SceneSelectionProvider>
                <div className="main-workspace" ref={workspaceRef}>
                    <div className="flex-1 min-w-[320px] lg:min-w-[520px] flex flex-col">
                        <PreviewPanel />
                    </div>
                    {sidePanelsVisible && (
                        <>
                            <div
                                className="relative h-full cursor-col-resize bg-neutral-900/70 border-l border-r border-neutral-800 hover:bg-sky-500/30 transition-colors"
                                style={{ width: SIDE_HANDLE_WIDTH }}
                                onPointerDown={handleSideResizeDown}
                                onPointerMove={handleSideResizeMove}
                                onPointerUp={handleSideResizeUp}
                                onPointerCancel={handleSideResizeUp}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="Resize side panels"
                            >
                                <div className="absolute top-1/2 left-1/2 w-[2px] h-12 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
                            </div>
                            <div className="h-full flex-none" style={{ width: `${Math.round(sidePanelWidth)}px` }}>
                                <SidePanels />
                            </div>
                        </>
                    )}
                </div>
                {timelineVisible && (
                    <>
                        <div
                            className="relative w-full cursor-row-resize bg-neutral-900/70 border-t border-b border-neutral-800 hover:bg-sky-500/30 transition-colors"
                            style={{ height: TIMELINE_HANDLE_HEIGHT }}
                            onPointerDown={handleTimelineResizeDown}
                            onPointerMove={handleTimelineResizeMove}
                            onPointerUp={handleTimelineResizeUp}
                            onPointerCancel={handleTimelineResizeUp}
                            role="separator"
                            aria-orientation="horizontal"
                            aria-label="Resize timeline"
                        >
                            <div className="absolute left-1/2 top-1/2 h-[2px] w-16 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
                        </div>
                        <div className="timeline-container" style={{ height: `${Math.round(timelineHeight)}px` }}>
                            <TimelinePanel />
                        </div>
                    </>
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
                dispatchSceneCommand({ type: 'clearScene', clearMacros: true }, { source: 'TemplateInitializer.template' });
                switch (tpl) {
                    case 'blank':
                        // Clear scene already resets settings; nothing else required.
                        break;
                    case 'default':
                        createDefaultMIDIScene();
                        break;
                    case 'debug':
                        try {
                            createAllElementsDebugScene();
                        } catch {
                            createDebugScene();
                        }
                        break;
                    default:
                        createDefaultMIDIScene();
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

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MenuBar from '@workspace/layout/MenuBar';
import PreviewPanel from '@workspace/panels/preview/PreviewPanel';
import WorkspaceDock from '@workspace/layout/WorkspaceDock';
import { ClearSelectionOnBackgroundClick } from '@workspace/layout/ClearSelectionOnBackgroundClick';
import { TimelinePanel } from '@workspace/panels/timeline';
import SmallScreenWarning from '@workspace/layout/SmallScreenWarning';
import { SceneSelectionProvider } from '@context/SceneSelectionContext';
const ExportProgressOverlay = React.lazy(() => import('./ExportProgressOverlay'));
import { VisualizerProvider, useVisualizer } from '@context/VisualizerContext';
import { SceneProvider, useScene } from '@context/SceneContext';
import { UndoProvider } from '@context/UndoContext';
import { MacroProvider } from '@context/MacroContext';
const OnboardingOverlay = React.lazy(() =>
    import('./OnboardingOverlay').then((module) => ({ default: module.OnboardingOverlay }))
);
import { useOnboarding } from '@workspace/onboarding/useOnboarding';
import { GettingStarted } from '@workspace/onboarding/GettingStarted';
const RenderModal = React.lazy(() => import('../modals/RenderModal'));
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { TemplateLoadingOverlay } from '../../components/TemplateLoadingOverlay';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { CacheDiagnosticsPopup } from '@workspace/components/CacheDiagnosticsPopup';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { TrackInputPopupController } from './TrackInputPopupController';
import { InsertKeyframeController } from './InsertKeyframeController';
import { TemplateInitializer } from './TemplateInitializer';
import { MissingFontsBanner } from '@workspace/components/MissingFontsBanner';
import { ControlsModal } from '@workspace/modals/ControlsModal';
import { isTextEditingTarget, matchesShortcut, useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { useWorkspacePanelsStore } from '@state/workspacePanelsStore';
import { clamp } from '@math/transforms/numeric';

const TIMELINE_MIN_HEIGHT = 160;
const TIMELINE_HANDLE_HEIGHT = 8;
const TIMELINE_COLLAPSE_THRESHOLD = 120;

const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress, exportKind, cancelExport, revealExport, removeExport } =
        useVisualizer() as any;
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);
    const [showSmallScreenWarning, setShowSmallScreenWarning] = useState(false);
    const [screenChecked, setScreenChecked] = useState(false);
    const [showControlsModal, setShowControlsModal] = useState(false);
    const { visualizer } = useVisualizer();
    const { leaveWorkspace } = useScene();
    const navigate = useNavigate();
    const location = useLocation();
    const automatedRenderer = useRef(Boolean(location.state?.automationRender || location.state?.backgroundExport));
    automatedRenderer.current ||= Boolean(location.state?.automationRender || location.state?.backgroundExport);
    const initialized = useSceneEditorStore((state) => state.hasInitializedScene);
    const templateLoading = useTemplateStatusStore((state) => state.isTemplateLoading);
    const onboarding = useOnboarding({
        ready: Boolean(visualizer) && initialized && !templateLoading && screenChecked && !showSmallScreenWarning,
        suppressed: automatedRenderer.current,
        renderingVideo: showProgressOverlay && exportKind === 'video',
    });
    const revealTutorialProperties = useCallback(() => useWorkspacePanelsStore.getState().activate('properties'), []);
    const revealTutorialTimeline = useCallback(() => setTimelineCollapsed(false), []);
    const [showRenderModal, setShowRenderModal] = useState(false);
    const timelineResizeRef = useRef<null | { startY: number; startHeight: number }>(null);
    const [timelineHeight, setTimelineHeight] = useState(() => {
        if (typeof window === 'undefined') return 240;
        const approx = Math.round(window.innerHeight * 0.25);
        const maxCandidate = Math.max(TIMELINE_MIN_HEIGHT, Math.round(window.innerHeight * 0.65));
        return clamp(approx, TIMELINE_MIN_HEIGHT, maxCandidate);
    });

    const diagnosticsBannerVisible = useAudioDiagnosticsStore((state) => state.bannerVisible);
    const showDiagnosticsBanner = diagnosticsBannerVisible;

    const getTimelineBounds = useCallback(() => {
        if (typeof window === 'undefined') {
            return { min: TIMELINE_MIN_HEIGHT, max: TIMELINE_MIN_HEIGHT * 3 };
        }
        const viewport = window.innerHeight || 900;
        const ideal = Math.round(viewport * 0.65);
        const lowerBound = TIMELINE_MIN_HEIGHT + 60;
        const upperBound = Math.max(lowerBound, viewport - 160);
        const max = clamp(ideal, lowerBound, upperBound);
        return { min: TIMELINE_MIN_HEIGHT, max: Math.max(TIMELINE_MIN_HEIGHT, max) };
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
            setScreenChecked(true);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        const handleResize = () => {
            const bounds = getTimelineBounds();
            setTimelineHeight((prev) => clamp(prev, bounds.min, bounds.max));
        };
        handleResize();
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
        return undefined;
    }, [getTimelineBounds]);

    // Keyboard / native-menu access to the help overlay and controls reference.
    useGlobalShortcut({
        id: 'document.controls',
        domain: 'document',
        enabled: !showControlsModal,
        matches: (event) =>
            !isTextEditingTarget(event.target) &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            (event.key === '?' || (event.code === 'Slash' && event.shiftKey)),
        handle: (event) => {
            event.preventDefault();
            setShowControlsModal(true);
            return true;
        },
    });

    const handleGoCommunity = useCallback(async () => {
        if (await leaveWorkspace()) navigate('/community');
    }, [leaveWorkspace, navigate]);

    // Native menu entries live in the OS-level bar and reach the renderer as commands.
    const menuActionRef = useRef<(command: string) => void>(() => {});
    menuActionRef.current = (command) => {
        if (command === 'help') onboarding.openWelcome();
        else if (command === 'controls') setShowControlsModal(true);
        else if (command === 'community') void handleGoCommunity();
    };
    useEffect(() => {
        const unsubscribe = window.mvmntDesktop?.menu.onCommand((command) => menuActionRef.current(command));
        return () => unsubscribe?.();
    }, []);

    const proceedSmallScreen = () => {
        try {
            localStorage.setItem('mvmnt_small_screen_override_v1', '1');
        } catch {}
        setShowSmallScreenWarning(false);
    };

    const handleTimelineResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        timelineResizeRef.current = { startY: e.clientY, startHeight: timelineCollapsed ? 0 : timelineHeight };
    };

    const handleTimelineResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = timelineResizeRef.current;
        if (!state) return;
        const bounds = getTimelineBounds();
        const delta = e.clientY - state.startY;
        const rawNext = clamp(state.startHeight - delta, 0, bounds.max);
        if (rawNext <= TIMELINE_COLLAPSE_THRESHOLD) {
            setTimelineCollapsed(true);
        } else {
            setTimelineCollapsed(false);
            setTimelineHeight(clamp(rawNext, bounds.min, bounds.max));
        }
    };

    const handleTimelineResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!timelineResizeRef.current) return;
        timelineResizeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
    };

    // Listen for render modal open events
    useEffect(() => {
        const handler = () => setShowRenderModal(true);
        window.addEventListener('open-render-modal', handler as EventListener);
        return () => window.removeEventListener('open-render-modal', handler as EventListener);
    }, []);

    return (
        <div className="app-container" data-tutorial-step={onboarding.step ?? undefined}>
            <TemplateLoadingOverlay />
            <MenuBar
                onHelp={() => onboarding.openWelcome()}
                onControls={() => setShowControlsModal(true)}
                onCommunity={() => void handleGoCommunity()}
            />
            <MissingFontsBanner />
            <SceneSelectionProvider>
                <>
                    <InsertKeyframeController />
                    <ClearSelectionOnBackgroundClick />
                    <TrackInputPopupController />
                    <div className="main-workspace">
                        <WorkspaceDock side="left" />
                        <div
                            className="flex-1 min-w-[320px] lg:min-w-[520px] flex flex-col overflow-hidden min-h-0"
                            data-center-column="true"
                        >
                            <WorkspaceDock side="top" />
                            {onboarding.session && (
                                <GettingStarted
                                    {...onboarding.session}
                                    onDismiss={onboarding.dismissGuide}
                                    step={onboarding.step ?? 'complete'}
                                    revealProperties={revealTutorialProperties}
                                    revealTimeline={revealTutorialTimeline}
                                />
                            )}
                            <div className="flex min-h-0 flex-1 flex-col">
                                <PreviewPanel />
                            </div>
                            <WorkspaceDock side="bottom" />
                        </div>
                        <WorkspaceDock side="right" />
                    </div>
                    <div
                        className={`relative w-full cursor-row-resize bg-neutral-900 border-t border-b border-neutral-800 transition-colors ${timelineCollapsed ? 'opacity-70 hover:bg-neutral-800' : 'hover:bg-neutral-800'}`}
                        style={{ height: TIMELINE_HANDLE_HEIGHT }}
                        data-preserve-selection="true"
                        onPointerDown={handleTimelineResizeDown}
                        onPointerMove={handleTimelineResizeMove}
                        onPointerUp={handleTimelineResizeUp}
                        onPointerCancel={handleTimelineResizeUp}
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Resize timeline"
                        aria-expanded={!timelineCollapsed}
                    >
                        <div className="absolute left-1/2 top-1/2 h-[2px] w-16 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
                    </div>
                    {!timelineCollapsed && (
                        <div
                            className="timeline-container"
                            data-preserve-selection="true"
                            style={{ height: `${Math.round(timelineHeight)}px` }}
                        >
                            <TimelinePanel />
                        </div>
                    )}
                </>
            </SceneSelectionProvider>
            {showProgressOverlay && (
                <Suspense fallback={null}>
                    <ExportProgressOverlay
                        kind={exportKind}
                        progress={progressData.progress}
                        text={progressData.text}
                        onClose={closeProgress}
                        onCancel={cancelExport}
                        onReveal={(outputId) => void revealExport(outputId)}
                        onRemove={removeExport}
                    />
                </Suspense>
            )}
            {onboarding.showWelcome && (
                <Suspense fallback={null}>
                    <OnboardingOverlay
                        onClose={onboarding.closeWelcome}
                        onStart={() => void onboarding.startTutorial()}
                        busy={onboarding.busy}
                        error={onboarding.error}
                        restarting={Boolean(onboarding.session)}
                    />
                </Suspense>
            )}

            {showSmallScreenWarning && <SmallScreenWarning onProceed={proceedSmallScreen} />}
            {showRenderModal && (
                <Suspense fallback={null}>
                    <RenderModal onClose={() => setShowRenderModal(false)} />
                </Suspense>
            )}
            {showControlsModal && <ControlsModal onClose={() => setShowControlsModal(false)} />}
            <CacheDiagnosticsPopup />
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

export default MidiVisualizer;

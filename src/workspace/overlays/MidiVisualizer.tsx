import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import MenuBar from '@workspace/layout/MenuBar';
import PreviewPanel from '@workspace/panels/preview/PreviewPanel';
import SidePanels from '@workspace/layout/SidePanels';
import { TimelinePanel } from '@workspace/panels/timeline';
import SmallScreenWarning from '@workspace/layout/SmallScreenWarning';
import { SceneSelectionProvider } from '@context/SceneSelectionContext';
const ExportProgressOverlay = React.lazy(() => import('./ExportProgressOverlay'));
import { VisualizerProvider, useVisualizer } from '@context/VisualizerContext';
import { SceneProvider } from '@context/SceneContext';
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
import AssetManagerPanel from '@workspace/panels/asset-manager/AssetManagerPanel';
import { TrackInputPopupController } from './TrackInputPopupController';
import { InsertKeyframeController } from './InsertKeyframeController';
import { TemplateInitializer } from './TemplateInitializer';
import { MissingFontsBanner } from '@workspace/components/MissingFontsBanner';
import { clamp } from '@math/transforms/numeric';
const SIDE_MIN_WIDTH = 320;
const SIDE_MAX_WIDTH = 720;
const PREVIEW_MIN_WIDTH = 520;
const SIDE_HANDLE_WIDTH = 6;
const SIDE_COLLAPSE_THRESHOLD = 120;
const TIMELINE_MIN_HEIGHT = 160;
const TIMELINE_HANDLE_HEIGHT = 8;
const TIMELINE_COLLAPSE_THRESHOLD = 120;
const ASSET_PANEL_MIN_WIDTH = 160;
const ASSET_PANEL_MAX_WIDTH = 380;
const ASSET_PANEL_DEFAULT_WIDTH = 220;
const ASSET_COLLAPSE_THRESHOLD = 80;

const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress, exportKind, cancelExport, revealExport, removeExport } =
        useVisualizer() as any;
    const [sidePanelsCollapsed, setSidePanelsCollapsed] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);
    const [isCompact, setIsCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1200);
    const [showSmallScreenWarning, setShowSmallScreenWarning] = useState(false);
    const [screenChecked, setScreenChecked] = useState(false);
    const { visualizer } = useVisualizer();
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
    const revealTutorialProperties = useCallback(() => setSidePanelsCollapsed(false), []);
    const revealTutorialTimeline = useCallback(() => setTimelineCollapsed(false), []);
    const [showRenderModal, setShowRenderModal] = useState(false);
    const [assetPanelCollapsed, setAssetPanelCollapsed] = useState(false);
    const [assetPanelWidth, setAssetPanelWidth] = useState(ASSET_PANEL_DEFAULT_WIDTH);
    const workspaceRef = useRef<HTMLDivElement | null>(null);
    const sideResizeRef = useRef<null | { startX: number; startWidth: number; containerWidth: number }>(null);
    const timelineResizeRef = useRef<null | { startY: number; startHeight: number }>(null);
    const assetResizeRef = useRef<null | { startX: number; startWidth: number }>(null);
    const [sidePanelWidth, setSidePanelWidth] = useState(() => {
        if (typeof window === 'undefined') return 360;
        const approx = Math.round(window.innerWidth * 0.28);
        const maxCandidate = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, window.innerWidth - PREVIEW_MIN_WIDTH));
        return clamp(approx, SIDE_MIN_WIDTH, maxCandidate);
    });
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
            setIsCompact(window.innerWidth < 1200);
            const container = workspaceRef.current;
            if (!container) return;
            const width = container.getBoundingClientRect().width;
            const maxCandidate = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, width - PREVIEW_MIN_WIDTH));
            setSidePanelWidth((prev) => clamp(prev, SIDE_MIN_WIDTH, maxCandidate));
        };
        handleResize();
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
        return undefined;
    }, [getTimelineBounds]);

    const proceedSmallScreen = () => {
        try {
            localStorage.setItem('mvmnt_small_screen_override_v1', '1');
        } catch {}
        setShowSmallScreenWarning(false);
    };

    const handleSideResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const container = workspaceRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        sideResizeRef.current = {
            startX: e.clientX,
            startWidth: sidePanelsCollapsed ? 0 : sidePanelWidth,
            containerWidth: rect.width,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const handleSideResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = sideResizeRef.current;
        if (!state) return;
        const containerWidth = workspaceRef.current?.getBoundingClientRect().width ?? state.containerWidth;
        const maxExpanded = Math.max(SIDE_MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, containerWidth - PREVIEW_MIN_WIDTH));
        const maxForRaw = Math.max(0, containerWidth - PREVIEW_MIN_WIDTH);
        const delta = e.clientX - state.startX;
        const rawNext = clamp(state.startWidth - delta, 0, maxForRaw);
        if (rawNext <= SIDE_COLLAPSE_THRESHOLD) {
            setSidePanelsCollapsed(true);
        } else {
            setSidePanelsCollapsed(false);
            setSidePanelWidth(clamp(rawNext, SIDE_MIN_WIDTH, maxExpanded));
        }
    };

    const handleSideResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!sideResizeRef.current) return;
        sideResizeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
    };

    const handleAssetResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
        assetResizeRef.current = { startX: e.clientX, startWidth: assetPanelCollapsed ? 0 : assetPanelWidth };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const handleAssetResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = assetResizeRef.current;
        if (!state) return;
        const delta = e.clientX - state.startX;
        const rawNext = clamp(state.startWidth + delta, 0, ASSET_PANEL_MAX_WIDTH);
        if (rawNext <= ASSET_COLLAPSE_THRESHOLD) {
            setAssetPanelCollapsed(true);
        } else {
            setAssetPanelCollapsed(false);
            setAssetPanelWidth(clamp(rawNext, ASSET_PANEL_MIN_WIDTH, ASSET_PANEL_MAX_WIDTH));
        }
    };

    const handleAssetResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!assetResizeRef.current) return;
        assetResizeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
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
            <MenuBar onHelp={onboarding.openWelcome} />
            <MissingFontsBanner />
            <SceneSelectionProvider>
                <>
                    <InsertKeyframeController />
                    <TrackInputPopupController />
                    <div className="main-workspace" ref={workspaceRef}>
                        {/* Asset manager panel — left of preview, hidden in compact mode */}
                        {!isCompact && !assetPanelCollapsed && (
                            <div
                                className="h-full flex-none overflow-hidden"
                                style={{ width: `${Math.round(assetPanelWidth)}px` }}
                            >
                                <AssetManagerPanel />
                            </div>
                        )}
                        {!isCompact && (
                            <div
                                className={`relative h-full cursor-col-resize bg-neutral-900/70 border-l border-r border-neutral-800 transition-colors ${assetPanelCollapsed ? 'opacity-70 hover:bg-sky-500/20' : 'hover:bg-sky-500/30'}`}
                                style={{ width: SIDE_HANDLE_WIDTH }}
                                onPointerDown={handleAssetResizeDown}
                                onPointerMove={handleAssetResizeMove}
                                onPointerUp={handleAssetResizeUp}
                                onPointerCancel={handleAssetResizeUp}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="Resize asset panel"
                                aria-expanded={!assetPanelCollapsed}
                            >
                                <div className="absolute top-1/2 left-1/2 w-[2px] h-12 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
                            </div>
                        )}
                        <div
                            className={`flex-1 min-w-[320px] lg:min-w-[520px] flex flex-col overflow-hidden min-h-0${isCompact ? ' min-h-[200px]' : ''}`}
                        >
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
                        </div>
                        {!isCompact && (
                            <div
                                className={`relative h-full cursor-col-resize bg-neutral-900/70 border-l border-r border-neutral-800 transition-colors ${sidePanelsCollapsed ? 'opacity-70 hover:bg-sky-500/20' : 'hover:bg-sky-500/30'}`}
                                style={{ width: SIDE_HANDLE_WIDTH }}
                                onPointerDown={handleSideResizeDown}
                                onPointerMove={handleSideResizeMove}
                                onPointerUp={handleSideResizeUp}
                                onPointerCancel={handleSideResizeUp}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="Resize side panels"
                                aria-expanded={!sidePanelsCollapsed}
                            >
                                <div className="absolute top-1/2 left-1/2 w-[2px] h-12 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
                            </div>
                        )}
                        {!sidePanelsCollapsed && (
                            <div
                                className={
                                    isCompact ? 'flex-1 min-h-[160px] w-full overflow-hidden' : 'h-full flex-none'
                                }
                                style={isCompact ? undefined : { width: `${Math.round(sidePanelWidth)}px` }}
                            >
                                <SidePanels />
                            </div>
                        )}
                    </div>
                    <div
                        className={`relative w-full cursor-row-resize bg-neutral-900/70 border-t border-b border-neutral-800 transition-colors ${timelineCollapsed ? 'opacity-70 hover:bg-sky-500/20' : 'hover:bg-sky-500/30'}`}
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

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import InsertKeyframePopup from '@workspace/panels/properties/InsertKeyframePopup';
import TrackInputAssignPopup from '@workspace/components/TrackInputAssignPopup';
import { hoveredPropertyRef } from '@workspace/panels/properties/hoveredPropertyRef';
import { resolveAutomationValueType } from '@workspace/panels/properties/KeyframeControl';
import { elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import { insertPropertyKeyframe } from '@state/scene';
import { useTimelineStore } from '@state/timelineStore';
import { isTextEditingTarget, useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { isCommandSurfaceActive } from '@context/commands/commandContext';
import { deriveElementOrder } from '@state/scene-graph';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useLocation, useNavigate } from 'react-router-dom';
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
const OnboardingOverlay = React.lazy(() => import('./OnboardingOverlay'));
const RenderModal = React.lazy(() => import('../modals/RenderModal'));
import { importScene } from '@persistence/index';
import { loadDefaultScene } from '@core/default-scene-loader';
import { dispatchSceneCommand } from '@state/scene';
import { useScene } from '@context/SceneContext';
import { useUndo } from '@context/UndoContext';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { clearStoredImportPayload, readStoredImportPayload } from '@utils/importPayloadStorage';
import { clearPendingDesktopProject, readPendingDesktopProjectName } from '../../desktop/pending-open';
import { clearPendingRender, hasPendingRender, markPendingRenderImported } from '../../desktop/pending-automation';
import { LocalSaveService } from '@persistence/local-save-service';
import { LocalFileStore } from '@persistence/local-file-store';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { TemplateLoadingOverlay } from '../../components/TemplateLoadingOverlay';
import { failPendingDocumentAnalytics } from '@app/analytics';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { CacheDiagnosticsPopup } from '@workspace/components/CacheDiagnosticsPopup';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import AssetManagerPanel from '@workspace/panels/asset-manager/AssetManagerPanel';
import { MissingFontsBanner } from '@workspace/components/MissingFontsBanner';

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
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

// Controller for the track input assignment popup shown after adding an element with track inputs.
const TrackInputPopupController: React.FC = () => {
    const { trackInputPopup, dismissTrackInputPopup, updateElementConfig, selectedElementId } = useSceneSelection();

    // Dismiss when user selects a different element (or deselects)
    useEffect(() => {
        if (!trackInputPopup) return;
        if (selectedElementId !== trackInputPopup.elementId) {
            dismissTrackInputPopup();
        }
    }, [selectedElementId, trackInputPopup, dismissTrackInputPopup]);

    if (!trackInputPopup) return null;

    const handleAssign = (assignments: Record<string, string | string[] | null>) => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(assignments)) {
            if (value !== null && !(Array.isArray(value) && value.length === 0)) {
                patch[key] = value;
            }
        }
        if (Object.keys(patch).length > 0) {
            updateElementConfig(trackInputPopup.elementId, patch);
        }
        dismissTrackInputPopup();
    };

    return (
        <TrackInputAssignPopup
            elementId={trackInputPopup.elementId}
            trackInputs={trackInputPopup.trackInputs}
            onDismiss={dismissTrackInputPopup}
            onAssign={handleAssign}
        />
    );
};

// Controller for the "i" key → insert keyframe popup. Must live inside SceneSelectionProvider.
const InsertKeyframeController: React.FC = () => {
    const { selectedElement, selectedElementSchema, activeNodeId } = useSceneSelection();
    const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
    const mousePos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            mousePos.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, []);

    useGlobalShortcut({
        id: 'scene.insert-keyframe',
        domain: 'focused-control',
        matches: (event) => {
            if (event.key.toLowerCase() !== 'i' || event.altKey || event.ctrlKey || event.metaKey || !activeNodeId)
                return false;
            return !isTextEditingTarget(event.target) && isCommandSurfaceActive(['preview', 'properties'], event);
        },
        handle: (event) => {
            event.preventDefault();
            const apply = () => {
                const hovered = hoveredPropertyRef.current;
                const valueType = hovered && resolveAutomationValueType(hovered.propertyType);
                if (hovered && valueType) {
                    const target =
                        hovered.owner.kind === 'node'
                            ? nodePropertyTarget(hovered.owner.id, hovered.propertyKey)
                            : elementPropertyTarget(hovered.owner.id, hovered.propertyKey);
                    insertPropertyKeyframe(
                        target,
                        valueType,
                        useTimelineStore.getState().timeline.currentTick,
                        'keyframe-hotkey'
                    );
                } else {
                    setPopupPos({ x: mousePos.current.x, y: mousePos.current.y });
                }
            };
            apply();
            return true;
        },
    });

    if (!popupPos || !activeNodeId) return null;

    return (
        <InsertKeyframePopup
            position={popupPos}
            nodeId={activeNodeId}
            elementId={selectedElement?.id}
            schema={selectedElementSchema ?? undefined}
            onClose={() => setPopupPos(null)}
        />
    );
};

// Inner component that consumes context so provider mount is clean
const MidiVisualizerInner: React.FC = () => {
    const { showProgressOverlay, progressData, closeProgress, exportKind, cancelExport, revealExport, removeExport } =
        useVisualizer() as any;
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [sidePanelsCollapsed, setSidePanelsCollapsed] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);
    const [isCompact, setIsCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1200);
    const [showSmallScreenWarning, setShowSmallScreenWarning] = useState(false);
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
        return clampNumber(approx, SIDE_MIN_WIDTH, maxCandidate);
    });
    const [timelineHeight, setTimelineHeight] = useState(() => {
        if (typeof window === 'undefined') return 240;
        const approx = Math.round(window.innerHeight * 0.25);
        const maxCandidate = Math.max(TIMELINE_MIN_HEIGHT, Math.round(window.innerHeight * 0.65));
        return clampNumber(approx, TIMELINE_MIN_HEIGHT, maxCandidate);
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
        } catch {
            /* ignore */
        }
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
            setIsCompact(window.innerWidth < 1200);
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
        const rawNext = clampNumber(state.startWidth - delta, 0, maxForRaw);
        if (rawNext <= SIDE_COLLAPSE_THRESHOLD) {
            setSidePanelsCollapsed(true);
        } else {
            setSidePanelsCollapsed(false);
            setSidePanelWidth(clampNumber(rawNext, SIDE_MIN_WIDTH, maxExpanded));
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
        const rawNext = clampNumber(state.startWidth + delta, 0, ASSET_PANEL_MAX_WIDTH);
        if (rawNext <= ASSET_COLLAPSE_THRESHOLD) {
            setAssetPanelCollapsed(true);
        } else {
            setAssetPanelCollapsed(false);
            setAssetPanelWidth(clampNumber(rawNext, ASSET_PANEL_MIN_WIDTH, ASSET_PANEL_MAX_WIDTH));
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
        const rawNext = clampNumber(state.startHeight - delta, 0, bounds.max);
        if (rawNext <= TIMELINE_COLLAPSE_THRESHOLD) {
            setTimelineCollapsed(true);
        } else {
            setTimelineCollapsed(false);
            setTimelineHeight(clampNumber(rawNext, bounds.min, bounds.max));
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
        <div className="app-container">
            <TemplateLoadingOverlay />
            <MenuBar onHelp={() => setShowOnboarding(true)} />
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
                            <PreviewPanel />
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
            {showOnboarding && (
                <Suspense fallback={null}>
                    <OnboardingOverlay onClose={() => setShowOnboarding(false)} />
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

// Handles applying template/import based on navigation state or session storage
const TemplateInitializer: React.FC = () => {
    const { visualizer } = useVisualizer() as any;
    const { refreshSceneUI, markSaveClean, markDirty } = useScene();
    const setSceneAuthor = useSceneMetadataStore((state) => state.setAuthor);
    const setSceneAttribution = useSceneMetadataStore((state) => state.setAttribution);
    const setSceneName = useSceneMetadataStore((state) => state.setName);
    const undo = (() => {
        try {
            return useUndo();
        } catch {
            return null;
        }
    })();
    const location = useLocation();
    const navigate = useNavigate();
    const startTemplateLoading = useTemplateStatusStore((state) => state.startLoading);
    const updateTemplateLoading = useTemplateStatusStore((state) => state.updateLoading);
    const finishTemplateLoading = useTemplateStatusStore((state) => state.finishLoading);

    useEffect(() => {
        if (!visualizer) return;
        const state: any = location.state || {};
        const sceneStoreState = (() => {
            try {
                return useSceneStore.getState();
            } catch {
                return null;
            }
        })();
        const hasScene = sceneStoreState ? deriveElementOrder(sceneStoreState.graph).length > 0 : false;
        const hasInitializedScene = useSceneEditorStore.getState().hasInitializedScene;

        const shouldImport = Boolean(state.importScene);
        const isNewDocumentImport = Boolean(state.newDocument);
        const shouldRestoreAutosave = Boolean(state.restoreAutosave);
        const shouldLoadTemplate = Boolean(state.template);
        const shouldLoadDefault = !shouldImport && !shouldLoadTemplate && !hasScene && !hasInitializedScene;
        const shouldShowIndicator = shouldImport || shouldLoadTemplate || shouldLoadDefault;
        const message = shouldImport
            ? 'Importing scene…'
            : shouldLoadTemplate
              ? 'Loading template…'
              : 'Checking for last open file…';

        let finished = false;
        let unsubscribeHydration: (() => void) | null = null;
        const abortController = shouldShowIndicator ? new AbortController() : null;
        const finish = (options: { abort?: boolean } = {}) => {
            if (finished || !shouldShowIndicator) return;
            finished = true;
            if (options.abort) {
                abortController?.abort();
            }
            unsubscribeHydration?.();
            unsubscribeHydration = null;
            finishTemplateLoading();
        };

        if (shouldShowIndicator) {
            startTemplateLoading(message, {
                progress: 0,
                onAbort: abortController ? () => abortController.abort() : null,
            });
            try {
                const initialHydration = useSceneEditorStore.getState().lastHydratedAt ?? 0;
                unsubscribeHydration = useSceneEditorStore.subscribe((state, previousState) => {
                    if (finished) return;
                    const nextHydration = state.lastHydratedAt ?? 0;
                    const prevHydration = previousState.lastHydratedAt ?? 0;
                    if (!nextHydration || nextHydration === prevHydration) return;
                    if (prevHydration !== initialHydration) return;
                    finish();
                });
            } catch {
                /* no-op */
            }
        }

        const run = async () => {
            let didChange = false;
            const clearSceneAfterAbort = () => {
                dispatchSceneCommand(
                    { type: 'clearScene', clearMacros: true },
                    { source: 'MidiVisualizer.TemplateInitializer.abort' }
                );
                try {
                    useTimelineStore.getState().resetTimeline();
                } catch {}
                refreshSceneUI();
                visualizer.invalidateRender?.();
            };
            try {
                if (shouldImport) {
                    const pendingDesktopName = readPendingDesktopProjectName();
                    const payload = readStoredImportPayload();
                    if (payload) {
                        try {
                            const result = await importScene(payload, {
                                signal: abortController?.signal,
                                onProgress: (progress, text) => updateTemplateLoading({ progress, message: text }),
                                autoInstallEmbeddedPlugins:
                                    sessionStorage.getItem('mvmnt.desktop.background-export.v1') !== null,
                            });
                            if (!result.ok) {
                                const msg = result.errors.map((e) => e.message).join('\n');
                                console.warn('[Import] Failed:', msg);
                                void failPendingDocumentAnalytics();
                                alert('Failed to load scene: ' + msg);
                            } else {
                                const metadataStore = useSceneMetadataStore.getState();
                                const importedName = metadataStore.metadata?.name?.trim() || 'Untitled';
                                const importedAuthor = metadataStore.metadata?.author?.trim() || '';
                                undo?.reset();
                                refreshSceneUI();
                                const isBackgroundExport =
                                    sessionStorage.getItem('mvmnt.desktop.background-export.v1') !== null;
                                if (isBackgroundExport) {
                                    setSceneName(importedName);
                                    sessionStorage.setItem('mvmnt.desktop.background-export.v1.imported', '1');
                                    window.dispatchEvent(new Event('mvmnt-project-imported'));
                                } else if (pendingDesktopName && window.mvmntDesktop && !isNewDocumentImport) {
                                    const fallbackName = pendingDesktopName.replace(/\.mvt$/i, '');
                                    // Desktop files use their filename as the canonical scene name.
                                    setSceneName(fallbackName || importedName);
                                    await window.mvmntDesktop.documents.acceptOpen();
                                    const recovery = await LocalSaveService.saveCurrentFile(
                                        fallbackName || importedName
                                    );
                                    if (!recovery.ok) {
                                        console.warn(
                                            '[Import] Could not save desktop recovery snapshot:',
                                            recovery.error
                                        );
                                    }
                                    localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
                                    markSaveClean();
                                    markPendingRenderImported();
                                    window.dispatchEvent(new Event('mvmnt-project-imported'));
                                } else {
                                    const attribution = importedAuthor
                                        ? `Based on "${importedName}" by ${importedAuthor}`
                                        : `Based on "${importedName}"`;
                                    setSceneName(SceneNameGenerator.generate());
                                    setSceneAuthor('');
                                    setSceneAttribution(attribution);
                                    // Browser/community imports remain new unsaved remixes.
                                    markDirty();
                                }
                                didChange = true;
                            }
                        } catch (e) {
                            if ((e as Error)?.name === 'AbortError') {
                                throw e;
                            }
                            console.error('Failed to import scene payload', e);
                            void failPendingDocumentAnalytics();
                            const message = e instanceof Error ? e.message : String(e);
                            if (hasPendingRender()) {
                                clearPendingRender();
                                window.mvmntDesktop?.automation.reportResult({ type: 'error', code: 'input', message });
                            } else {
                                alert('Failed to load scene: ' + message);
                            }
                        }
                        clearStoredImportPayload();
                        clearPendingDesktopProject();
                    }
                    // Always clear the importScene navigation state to prevent getting stuck
                    navigate('/workspace', { replace: true });
                } else if (shouldLoadTemplate) {
                    updateTemplateLoading({ progress: null, message: 'Loading template…', onAbort: null });
                    const tpl = state.template as string;
                    dispatchSceneCommand(
                        { type: 'clearScene', clearMacros: true },
                        { source: 'TemplateInitializer.template' }
                    );
                    try {
                        useTimelineStore.getState().resetTimeline();
                    } catch {}
                    switch (tpl) {
                        case 'blank':
                            setSceneName(SceneNameGenerator.generate());
                            break;
                        case 'default':
                            await loadDefaultScene('MidiVisualizer.TemplateInitializer.default');
                            break;
                        case 'debug':
                            console.warn('Debug template is no longer available; loading default scene instead.');
                            await loadDefaultScene('MidiVisualizer.TemplateInitializer.debugFallback');
                            break;
                        default:
                            await loadDefaultScene('MidiVisualizer.TemplateInitializer.fallback');
                    }
                    setSceneAuthor('');
                    refreshSceneUI();
                    if (state.desktopNew) {
                        localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
                        markDirty();
                    }
                    didChange = true;
                } else if (shouldLoadDefault) {
                    const savedAt = await LocalSaveService.savedAt();
                    const desktopRecoveryState = window.mvmntDesktop
                        ? localStorage.getItem('mvmnt.desktop.recovery-state')
                        : null;
                    const restoreRecovery =
                        shouldRestoreAutosave ||
                        desktopRecoveryState !== 'dirty' ||
                        window.confirm('MVMNT found changes recovered from the previous session. Restore them?');
                    if (!restoreRecovery) {
                        await LocalFileStore.clear();
                        await window.mvmntDesktop?.documents.clearActivePath();
                        localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
                    }
                    // A clean desktop launch restores the actual native document,
                    // not the global recovery slot. The latter can belong to a
                    // previously opened project and must never be paired with a
                    // different active file path.
                    if (window.mvmntDesktop && desktopRecoveryState !== 'dirty' && restoreRecovery) {
                        const active = await window.mvmntDesktop.documents.restoreActive().catch((error) => {
                            // A renderer can briefly outrun a restarted Electron main
                            // process during development. Fall back safely instead of
                            // surfacing a missing IPC handler as a startup failure.
                            console.warn('[TemplateInitializer] Native active-document restore unavailable:', error);
                            return null;
                        });
                        if (active && !active.canceled && active.kind === 'project' && active.bytes) {
                            const result = await importScene(active.bytes, {
                                signal: abortController?.signal,
                                onProgress: (progress, text) => updateTemplateLoading({ progress, message: text }),
                            });
                            if (result.ok) {
                                const filename = active.displayName?.replace(/\.mvt$/i, '');
                                if (filename) setSceneName(filename);
                                await LocalFileStore.save(active.bytes).catch(() => undefined);
                                refreshSceneUI();
                                markSaveClean();
                                didChange = true;
                            } else {
                                console.warn(
                                    '[TemplateInitializer] Could not restore active desktop document:',
                                    result.errors
                                );
                            }
                        }
                    }
                    // Try to restore from the user's last local save first.
                    updateTemplateLoading({
                        progress: 0.05,
                        message: savedAt ? 'Loading last open file…' : 'Preparing default scene…',
                    });
                    const localResult =
                        !didChange && restoreRecovery
                            ? await LocalSaveService.loadSavedFile({
                                  signal: abortController?.signal,
                                  onProgress: (progress, text) => updateTemplateLoading({ progress, message: text }),
                              })
                            : { ok: true as const, loaded: false as const };
                    if (didChange) {
                        // The active native document is already hydrated.
                    } else if (localResult.ok && localResult.loaded) {
                        if (window.mvmntDesktop) {
                            const document = await window.mvmntDesktop.documents.getState();
                            if (document.status === 'saved' && document.displayName) {
                                setSceneName(document.displayName.replace(/\.mvt$/i, ''));
                            }
                        }
                        refreshSceneUI();
                        if (desktopRecoveryState === 'dirty') markDirty();
                        else markSaveClean();
                        didChange = true;
                    } else {
                        if (!localResult.ok) {
                            console.warn(
                                '[TemplateInitializer] Could not load local save, falling back to default scene:',
                                localResult.error
                            );
                        }
                        // No local save found (or corrupt) – load the default template.
                        updateTemplateLoading({ progress: null, message: 'Preparing default scene…', onAbort: null });
                        const loaded = await loadDefaultScene('MidiVisualizer.TemplateInitializer.initialDefault');
                        if (loaded) {
                            // Give the fresh scene a generated name (default template may have a generic one).
                            useSceneMetadataStore.getState().setName(SceneNameGenerator.generate());
                            refreshSceneUI();
                            // Establish a clean baseline so the asterisk doesn't show immediately.
                            markSaveClean();
                            didChange = true;
                        }
                    }
                }
                if (didChange) {
                    visualizer.invalidateRender?.();
                    window.dispatchEvent(new Event('mvmnt-project-imported'));
                    if (!shouldImport) {
                        navigate('/workspace', { replace: true });
                    }
                }
            } catch (e) {
                if ((e as Error)?.name === 'AbortError') {
                    void failPendingDocumentAnalytics();
                    clearSceneAfterAbort();
                } else {
                    void failPendingDocumentAnalytics();
                    console.error('Template initialization error', e);
                }
            } finally {
                finish();
            }
        };

        run();

        return () => finish({ abort: true });
    }, [
        visualizer,
        location.state,
        navigate,
        refreshSceneUI,
        markSaveClean,
        markDirty,
        setSceneAuthor,
        setSceneAttribution,
        setSceneName,
        undo,
        startTemplateLoading,
        finishTemplateLoading,
        updateTemplateLoading,
    ]);
    return null;
};

export default MidiVisualizer;

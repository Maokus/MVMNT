import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PreviewPanel from '@workspace/panels/preview/PreviewPanel';
import { TimelinePanel } from '@workspace/panels/timeline';
import MacroConfig from '@workspace/panels/properties/MacroConfig';
import ExportProgressOverlay from '@workspace/layout/ExportProgressOverlay';
import { useScene } from '@context/SceneContext';
import { useVisualizer } from '@context/VisualizerContext';
import { useTimelineStore } from '@state/timelineStore';

const EasyModeLayout: React.FC = () => {
    const { sceneName, setSceneName, loadScene } = useScene();
    const visualizerCtx = useVisualizer() as any;
    const { visualizer, showProgressOverlay, progressData, closeProgress, exportKind } = visualizerCtx;
    const exportVideo = visualizerCtx?.exportVideo as ((override?: any) => Promise<void>) | undefined;
    const [macrosVisible, setMacrosVisible] = useState(true);

    const midiTrackCount = useTimelineStore(
        useCallback((state) => state.tracksOrder.filter((id) => state.tracks[id]?.type === 'midi').length, [])
    );
    const audioTrackCount = useTimelineStore(
        useCallback((state) => state.tracksOrder.filter((id) => state.tracks[id]?.type === 'audio').length, [])
    );

    const handleImportScene = useCallback(() => {
        loadScene();
    }, [loadScene]);

    const handleExportVideo = useCallback(async () => {
        if (!exportVideo) return;
        const safeName = (sceneName || 'scene')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'scene';
        try {
            await exportVideo({ filename: `${safeName}-easy-mode.mp4`, fullDuration: true });
        } catch (error) {
            console.error('Easy mode export failed', error);
        }
    }, [exportVideo, sceneName]);

    return (
        <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
            <header className="border-b border-neutral-800 bg-[color:var(--twc-menubar)]/95 shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-4 px-4 py-2 text-xs">
                    <div className="flex items-center gap-3 text-sm font-medium">
                        <Link
                            to="/"
                            className="text-base font-semibold text-white transition-colors hover:text-sky-300"
                        >
                            MVMNT
                        </Link>
                        <span className="rounded-full border border-neutral-700/80 bg-neutral-800/80 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-neutral-300">
                            Easy Mode
                        </span>
                    </div>
                    <div className="flex min-w-[240px] flex-1 flex-wrap items-center justify-center gap-3 text-[11px] text-neutral-300 md:justify-center">
                        <label className="flex items-center gap-2 text-neutral-200">
                            <span className="uppercase tracking-wide text-neutral-500">Scene</span>
                            <input
                                className="w-[180px] rounded border border-neutral-700 bg-[color:var(--twc-control)] px-2 py-1 text-sm text-neutral-100 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                value={sceneName}
                                onChange={(event) => setSceneName(event.target.value)}
                                aria-label="Scene name"
                            />
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <button
                            type="button"
                            onClick={handleImportScene}
                            className="inline-flex items-center justify-center gap-1 rounded border border-sky-500/70 bg-sky-600/20 px-3 py-1 text-sky-100 transition-colors hover:bg-sky-500/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        >
                            Import .mvt
                        </button>
                        <button
                            type="button"
                            onClick={handleExportVideo}
                            className="inline-flex items-center justify-center gap-1 rounded border border-emerald-500/70 bg-emerald-600/20 px-3 py-1 text-emerald-100 transition-colors hover:bg-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                            Export Video
                        </button>
                        <Link
                            to="/workspace"
                            className="inline-flex items-center justify-center gap-1 rounded border border-neutral-600 bg-neutral-800/70 px-3 py-1 text-neutral-100 transition-colors hover:border-neutral-400 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
                        >
                            Open Workspace
                        </Link>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-hidden border-b border-neutral-800">
                        <PreviewPanel />
                    </div>
                    <div className="timeline-container h-[320px] border-t border-neutral-800">
                        <TimelinePanel />
                    </div>
                </div>
                {macrosVisible && (
                    <aside className="flex w-full flex-col border-t border-neutral-800 bg-neutral-900/50 lg:w-80 lg:border-l lg:border-t-0">
                        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
                            <MacroConfig visualizer={visualizer} showAddButton={false} />
                        </div>
                    </aside>
                )}
            </div>

            {showProgressOverlay && (
                <ExportProgressOverlay
                    progress={progressData.progress}
                    text={progressData.text}
                    onClose={closeProgress}
                    kind={exportKind}
                />
            )}
        </div>
    );
};

export default EasyModeLayout;

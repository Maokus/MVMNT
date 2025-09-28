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

    const sceneLabel = useMemo(() => {
        const parts: string[] = [];
        if (midiTrackCount > 0) {
            parts.push(`${midiTrackCount} MIDI`);
        }
        if (audioTrackCount > 0) {
            parts.push(`${audioTrackCount} Audio`);
        }
        return parts.length ? parts.join(' · ') : 'No tracks yet';
    }, [midiTrackCount, audioTrackCount]);

    return (
        <div className="flex h-screen flex-col bg-neutral-800 text-neutral-100">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <div className="flex items-center gap-2">
                        <Link to="/" className="text-base font-semibold text-white hover:text-sky-400 transition-colors">
                            MVMNT
                        </Link>
                        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neutral-300">
                            Easy Mode
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span className="uppercase tracking-wide text-neutral-500">Scene</span>
                        <input
                            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-sky-500 focus:outline-none"
                            value={sceneName}
                            onChange={(event) => setSceneName(event.target.value)}
                            aria-label="Scene name"
                        />
                        <span className="hidden sm:inline" aria-hidden="true">
                            •
                        </span>
                        <span>{sceneLabel}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                        type="button"
                        onClick={handleImportScene}
                        className="rounded border border-sky-500 bg-sky-500/10 px-3 py-1 font-semibold text-sky-200 transition-colors hover:bg-sky-500/20"
                    >
                        Import .mvt
                    </button>
                    <button
                        type="button"
                        onClick={() => setMacrosVisible((value) => !value)}
                        className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                    >
                        {macrosVisible ? 'Hide Macros' : 'Show Macros'}
                    </button>
                    <button
                        type="button"
                        onClick={handleExportVideo}
                        className="rounded border border-emerald-500 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
                    >
                        Export Video
                    </button>
                    <Link
                        to="/workspace"
                        className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                    >
                        Open Workspace
                    </Link>
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
                            <MacroConfig visualizer={visualizer} />
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

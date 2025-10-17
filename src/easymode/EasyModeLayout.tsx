import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PreviewPanel from '@workspace/panels/preview/PreviewPanel';
import { TimelinePanel } from '@workspace/panels/timeline';
import MacroConfig from '@workspace/panels/properties/MacroConfig';
import ExportProgressOverlay from '@workspace/layout/ExportProgressOverlay';
import { useScene } from '@context/SceneContext';
import { useVisualizer } from '@context/VisualizerContext';
import { useTimelineStore } from '@state/timelineStore';
import logo from '@assets/Logo_Transparent.png';
import { useMacros } from '@context/MacroContext';
import { TemplateLoadingOverlay } from '../components/TemplateLoadingOverlay';
import { BrowseTemplatesButton } from '@workspace/templates/BrowseTemplatesButton';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import { useTemplateApply } from '@workspace/templates/useTemplateApply';
import type { TemplateDefinition } from '@workspace/templates/types';

const EasyModeLayout: React.FC = () => {
    const { sceneName, loadScene } = useScene();
    const visualizerCtx = useVisualizer() as any;
    const { visualizer, showProgressOverlay, progressData, closeProgress, exportKind } = visualizerCtx;
    const exportVideo = visualizerCtx?.exportVideo as ((override?: any) => Promise<void>) | undefined;
    const [macrosVisible] = useState(true);
    const templates = useMemo(() => easyModeTemplates, []);
    const hasTemplates = templates.length > 0;
    const applyTemplate = useTemplateApply();
    const displaySceneName = sceneName?.trim() ? sceneName : 'Untitled Scene';
    const isBetaMode = import.meta.env.VITE_APP_MODE === 'beta';

    const midiTrackIds = useTimelineStore(
        useCallback((state) => state.tracksOrder.filter((id) => state.tracks[id]?.type === 'midi'), [])
    );
    const midiTrackCount = midiTrackIds.length;
    const addMidiTrack = useTimelineStore((state) => state.addMidiTrack);

    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const { macros: macroList, updateValue } = useMacros();
    const midiMacros = useMemo(() => {
        return (macroList as any[]).filter((macro) => macro?.type === 'timelineTrackRef');
    }, [macroList]);
    const previousMidiCountRef = useRef(midiTrackCount);

    useEffect(() => {
        const previousCount = previousMidiCountRef.current;
        if (previousCount === 0 && midiTrackIds.length > 0 && midiMacros.length > 0) {
            const targetTrackId = midiTrackIds[0];
            midiMacros.forEach((macro: any) => {
                if (!macro?.name) return;
                const allowsMultiple = Boolean(macro?.options?.allowMultiple) || Array.isArray(macro?.value);
                const currentValue = macro.value;
                const nextValue = allowsMultiple ? [targetTrackId] : targetTrackId;
                if (allowsMultiple) {
                    const asArray = Array.isArray(currentValue) ? currentValue : [];
                    if (asArray.length === 1 && asArray[0] === targetTrackId) {
                        return;
                    }
                } else if (currentValue === targetTrackId) {
                    return;
                }
                try {
                    updateValue(macro.name, nextValue);
                } catch (error) {
                    console.warn('Failed to assign MIDI track macro', macro.name, error);
                }
            });
        }
        previousMidiCountRef.current = midiTrackIds.length;
    }, [midiTrackIds, midiMacros, updateValue]);

    const handlePlaceholderButtonClick = useCallback(() => {
        uploadInputRef.current?.click();
    }, []);

    const handlePlaceholderFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const trackName = file.name.replace(/\.[^/.]+$/, '');
            await addMidiTrack({ name: trackName, file });
            if (event.target) {
                event.target.value = '';
            }
        },
        [addMidiTrack]
    );

    const handleImportScene = useCallback(() => {
        loadScene();
    }, [loadScene]);

    const handleApplyTemplate = useCallback(
        async (template: TemplateDefinition) => applyTemplate(template),
        [applyTemplate]
    );

    const handleExportVideo = useCallback(async () => {
        if (!exportVideo) return;
        const safeName = (sceneName || 'scene')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'scene';
        try {
            await exportVideo({ filename: `${safeName}.mp4`, fullDuration: true });
        } catch (error) {
            console.error('Easy mode export failed', error);
        }
    }, [exportVideo, sceneName]);

    return (
        <div className="flex h-screen flex-col bg-neutral-800 text-neutral-100">
            <TemplateLoadingOverlay />
            <header
                style={{ 'backgroundColor': 'var(--twc-menubar)' }}
                className="border-b border-neutral-600 bg-[color:var(--twc-menubar)]/95 shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            >
                <div className="mx-auto flex w-full flex-col gap-3 px-4 py-3 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:py-2">
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-3 sm:justify-start">
                        <div className="flex items-center gap-3 text-sm font-medium">
                            <Link to="/" title="Go to Home" style={{ display: 'inline-flex' }}>
                                <img width="44" src={logo} style={{ cursor: 'pointer', marginTop: '-1px' }} />
                            </Link>
                            <div className="flex flex-col gap-1">
                                <h3 className="text-sm font-semibold">
                                    <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} title="Go to Home">
                                        MVMNT v{((import.meta as any).env?.VITE_VERSION)} {isBetaMode ? '(beta)' : ''}
                                    </Link>
                                </h3>
                                <span className="inline-flex w-fit items-center rounded-full border border-neutral-700/80 bg-neutral-800/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">
                                    Easy Mode
                                </span>
                            </div>
                        </div>
                        <Link
                            to="/workspace"
                            className="inline-flex items-center justify-center gap-1 rounded border border-neutral-600 bg-neutral-900/70 px-3 py-1 text-[11px] font-semibold text-neutral-100 transition-colors hover:border-neutral-400 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
                        >
                            Open Advanced Mode
                        </Link>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-1 sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-neutral-200">
                            <span className="hidden uppercase tracking-wide text-neutral-500 sm:inline">Scene</span>
                            <span
                                className="max-w-full truncate rounded bg-neutral-900/60 px-3 py-1 text-sm font-medium text-neutral-100 sm:max-w-[240px]"
                                title={displaySceneName}
                                aria-label="Scene name"
                            >
                                {displaySceneName}
                            </span>
                        </div>
                        <div className="-mx-1 flex flex-wrap items-center gap-2 overflow-x-auto pb-1 text-[11px] font-semibold sm:mx-0 sm:justify-end sm:pb-0">
                            <BrowseTemplatesButton
                                templates={templates}
                                onTemplateSelect={handleApplyTemplate}
                                className="mx-1 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded border border-neutral-600 bg-neutral-900/70 px-3 py-1 text-xs text-neutral-100 transition-colors hover:border-neutral-400 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
                                disabled={!hasTemplates}
                            >
                                Browse Templates
                            </BrowseTemplatesButton>
                            <button
                                type="button"
                                onClick={handleImportScene}
                                className="mx-1 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded border border-sky-500/70 bg-sky-600/20 px-3 py-1 text-xs text-sky-100 transition-colors hover:bg-sky-500/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                            >
                                Import .mvt
                            </button>
                            <button
                                type="button"
                                onClick={handleExportVideo}
                                className="mx-1 inline-flex items-center justify-center whitespace-nowrap rounded bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-pink-400"
                                title="Render / Export Video"
                            >
                                Export Video
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-hidden border-b border-neutral-800">
                        <PreviewPanel interactive={false} />
                    </div>
                    <div className="timeline-container h-[280px] border-t border-neutral-800">
                        {midiTrackCount === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-4 bg-neutral-900/60 px-6 text-center">
                                <p className="max-w-lg text-sm text-neutral-300">
                                    Upload a MIDI file to start customizing this template. Your timeline and macros will automatically connect once the file is added.
                                </p>
                                <button
                                    type="button"
                                    onClick={handlePlaceholderButtonClick}
                                    className="rounded-lg bg-emerald-600 px-8 py-4 text-lg font-semibold text-white shadow transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-neutral-900"
                                >
                                    Upload Midi
                                </button>
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    accept=".mid,.midi"
                                    className="hidden"
                                    onChange={handlePlaceholderFileChange}
                                />
                            </div>
                        ) : (
                            <TimelinePanel />
                        )}
                    </div>
                </div>
                {macrosVisible && (
                    <aside className="flex w-full flex-col border-t border-neutral-800 bg-neutral-900/50 lg:w-[25rem] lg:border-l lg:border-t-0">
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

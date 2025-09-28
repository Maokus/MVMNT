import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PreviewPanel from '@workspace/panels/preview/PreviewPanel';
import { TimelinePanel } from '@workspace/panels/timeline';
import MacroConfig from '@workspace/panels/properties/MacroConfig';
import ExportProgressOverlay from '@workspace/layout/ExportProgressOverlay';
import { useScene } from '@context/SceneContext';
import { useVisualizer } from '@context/VisualizerContext';
import { useTimelineStore } from '@state/timelineStore';
import { useUndo } from '@context/UndoContext';
import { importScene } from '@persistence/index';

interface TemplateDefinition {
    id: string;
    name: string;
    description: string;
    content: string;
}

const templateFiles = import.meta.glob('../templates/*.mvt', { as: 'raw', eager: true }) as Record<string, string>;

const EASY_MODE_TEMPLATES: TemplateDefinition[] = Object.entries(templateFiles)
    .map(([path, content]) => {
        const filename = path.split('/').pop() ?? 'template.mvt';
        const id = filename.replace(/\.mvt$/i, '');
        const fallbackName = id
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase());
        let name = fallbackName || 'Template';
        let description = 'Ready-made scene configuration.';
        try {
            const parsed = JSON.parse(content);
            if (parsed?.metadata) {
                const metaName = typeof parsed.metadata.name === 'string' ? parsed.metadata.name.trim() : '';
                const metaDescription = typeof parsed.metadata.description === 'string' ? parsed.metadata.description.trim() : '';
                if (metaName) name = metaName;
                if (metaDescription) description = metaDescription;
            }
        } catch {
            /* ignore parse errors for metadata lookup */
        }
        return { id, name, description, content };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

const EasyModeLayout: React.FC = () => {
    const { sceneName, setSceneName, loadScene, refreshSceneUI } = useScene();
    const visualizerCtx = useVisualizer() as any;
    const { visualizer, showProgressOverlay, progressData, closeProgress, exportKind } = visualizerCtx;
    const exportVideo = visualizerCtx?.exportVideo as ((override?: any) => Promise<void>) | undefined;
    const [macrosVisible] = useState(true);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const undo = useUndo();
    const templates = useMemo(() => EASY_MODE_TEMPLATES, []);
    const hasTemplates = templates.length > 0;
    const displaySceneName = sceneName?.trim() ? sceneName : 'Untitled Scene';

    const midiTrackCount = useTimelineStore(
        useCallback((state) => state.tracksOrder.filter((id) => state.tracks[id]?.type === 'midi').length, [])
    );
    const audioTrackCount = useTimelineStore(
        useCallback((state) => state.tracksOrder.filter((id) => state.tracks[id]?.type === 'audio').length, [])
    );

    const handleImportScene = useCallback(() => {
        loadScene();
    }, [loadScene]);

    const handleApplyTemplate = useCallback((template: TemplateDefinition) => {
        const result = importScene(template.content);
        if (!result.ok) {
            const message = result.errors.map((error) => error.message).join('\n') || 'Unknown error';
            alert(`Failed to load template: ${message}`);
            return;
        }
        try {
            const parsed = JSON.parse(template.content);
            if (parsed?.metadata?.name) {
                setSceneName(parsed.metadata.name);
            } else {
                setSceneName(template.name);
            }
        } catch {
            setSceneName(template.name);
        }
        undo.reset();
        refreshSceneUI();
        visualizer?.invalidateRender?.();
        setShowTemplateModal(false);
    }, [refreshSceneUI, setSceneName, undo, visualizer]);

    const handleOpenTemplates = useCallback(() => setShowTemplateModal(true), []);
    const handleCloseTemplates = useCallback(() => setShowTemplateModal(false), []);

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
                        <div className="flex items-center gap-2 text-neutral-200">
                            <span className="uppercase tracking-wide text-neutral-500">Scene</span>
                            <span
                                className="max-w-[220px] truncate rounded border border-neutral-700 bg-[color:var(--twc-control)] px-3 py-1 text-sm font-medium text-neutral-100"
                                title={displaySceneName}
                                aria-label="Scene name"
                            >
                                {displaySceneName}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <button
                            type="button"
                            onClick={handleOpenTemplates}
                            className="inline-flex items-center justify-center gap-1 rounded border border-indigo-500/70 bg-indigo-600/20 px-3 py-1 text-indigo-100 transition-colors hover:bg-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!hasTemplates}
                        >
                            Browse Templates
                        </button>
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
            {showTemplateModal && (
                <TemplateBrowserModal
                    templates={templates}
                    onClose={handleCloseTemplates}
                    onSelect={handleApplyTemplate}
                />
            )}
        </div>
    );
};

interface TemplateBrowserModalProps {
    templates: TemplateDefinition[];
    onClose: () => void;
    onSelect: (template: TemplateDefinition) => void;
}

const TemplateBrowserModal: React.FC<TemplateBrowserModalProps> = ({ templates, onClose, onSelect }) => {
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
            role="dialog"
            aria-modal="true"
            aria-label="Browse templates"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                    <h2 className="text-sm font-semibold text-neutral-100">Choose a Template</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-neutral-600 px-2 py-1 text-xs uppercase tracking-wide text-neutral-300 transition-colors hover:border-neutral-400 hover:text-neutral-100"
                    >
                        Close
                    </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                    {templates.length === 0 ? (
                        <p className="text-sm text-neutral-400">No templates available yet.</p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {templates.map((template) => (
                                <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => onSelect(template)}
                                    className="group flex h-full flex-col items-start gap-2 rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 text-left transition-colors hover:border-sky-500 hover:bg-neutral-800"
                                >
                                    <span className="text-sm font-semibold text-neutral-100 group-hover:text-white">
                                        {template.name}
                                    </span>
                                    <span className="text-xs text-neutral-400 group-hover:text-neutral-300">
                                        {template.description}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EasyModeLayout;

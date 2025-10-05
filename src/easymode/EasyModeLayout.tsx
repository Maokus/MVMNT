import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import logo from '@assets/Logo_Transparent.png';
import { useMacros } from '@context/MacroContext';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { easyModeTemplateManifest, TemplateManifestEntry } from '../templates/manifest';
import { extractSceneMetadataFromArtifact } from '@persistence/scene-package';
import { TemplateLoadingOverlay } from '../components/TemplateLoadingOverlay';
import { useTemplateStatusStore } from '@state/templateStatusStore';

interface LoadedTemplateArtifact {
    data: Uint8Array;
    metadata?: { name?: string; author?: string; description?: string };
}

interface TemplateDefinition {
    id: string;
    name: string;
    description: string;
    loadArtifact: () => Promise<LoadedTemplateArtifact>;
    loadMetadata?: () => Promise<LoadedTemplateArtifact['metadata'] | undefined>;
    author?: string;
}

const templateFiles = import.meta.glob('../templates/*.mvt', {
    query: '?arraybuffer',
    import: 'default',
}) as Record<string, () => Promise<ArrayBuffer | Uint8Array>>;

async function toUint8Array(value: unknown): Promise<Uint8Array> {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
        return new Uint8Array(await value.arrayBuffer());
    }
    if (typeof value === 'string') {
        if (typeof fetch !== 'function') {
            throw new Error('Unable to resolve template asset URL');
        }
        const response = await fetch(value);
        if (!response.ok) {
            throw new Error(`Failed to fetch template asset: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }
    throw new Error('Unsupported template module format');
}

const manifestEntries = easyModeTemplateManifest.reduce<Record<string, TemplateManifestEntry>>((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
}, {});

const EASY_MODE_TEMPLATES: TemplateDefinition[] = Object.entries(templateFiles)
    .map(([path, loader]) => {
        const filename = path.split('/').pop() ?? 'template.mvt';
        const id = filename.replace(/\.mvt$/i, '');
        const fallbackName = id
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase());
        const manifest = manifestEntries[id];
        const name = manifest?.name?.trim() || fallbackName || 'Template';
        const description = manifest?.description?.trim() || 'Ready-made scene configuration.';
        const author = manifest?.author?.trim() || undefined;
        let cachedData: Uint8Array | null = null;
        let cachedMetadata: LoadedTemplateArtifact['metadata'];
        let pendingLoad: Promise<void> | null = null;

        const ensureLoaded = async () => {
            if (cachedData) return;
            if (pendingLoad) {
                await pendingLoad;
                return;
            }
            pendingLoad = (async () => {
                try {
                    const moduleValue = await loader();
                    const data = await toUint8Array(moduleValue);
                    cachedData = data;
                    cachedMetadata = extractSceneMetadataFromArtifact(data);
                } finally {
                    pendingLoad = null;
                }
            })();
            await pendingLoad;
        };
        return {
            id,
            name,
            description,
            author,
            loadArtifact: async () => {
                await ensureLoaded();
                if (!cachedData) {
                    throw new Error('Template data unavailable');
                }
                const cloned = new Uint8Array(cachedData);
                return { data: cloned, metadata: cachedMetadata };
            },
            loadMetadata: async () => {
                try {
                    await ensureLoaded();
                    return cachedMetadata;
                } catch {
                    return undefined;
                }
            },
        };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

const EasyModeLayout: React.FC = () => {
    const { sceneName, loadScene, refreshSceneUI } = useScene();
    const visualizerCtx = useVisualizer() as any;
    const { visualizer, showProgressOverlay, progressData, closeProgress, exportKind } = visualizerCtx;
    const exportVideo = visualizerCtx?.exportVideo as ((override?: any) => Promise<void>) | undefined;
    const [macrosVisible] = useState(true);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const undo = useUndo();
    const templates = useMemo(() => EASY_MODE_TEMPLATES, []);
    const hasTemplates = templates.length > 0;
    const displaySceneName = sceneName?.trim() ? sceneName : 'Untitled Scene';
    const isBetaMode = import.meta.env.VITE_APP_MODE === 'beta';
    const startTemplateLoading = useTemplateStatusStore((state) => state.startLoading);
    const finishTemplateLoading = useTemplateStatusStore((state) => state.finishLoading);

    const midiTrackIds = useTimelineStore(
        useCallback((state) => state.tracksOrder.filter((id) => state.tracks[id]?.type === 'midi'), [])
    );
    const midiTrackCount = midiTrackIds.length;
    const addMidiTrack = useTimelineStore((state) => state.addMidiTrack);

    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const { macros: macroList, updateValue } = useMacros();
    const midiMacros = useMemo(() => {
        return (macroList as any[]).filter((macro) => macro?.type === 'midiTrackRef');
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

    const handleApplyTemplate = useCallback(async (template: TemplateDefinition) => {
        const templateLabel = template.name.trim() || 'template';
        startTemplateLoading(`Loading ${templateLabel}…`);
        let artifact: LoadedTemplateArtifact;
        try {
            try {
                artifact = await template.loadArtifact();
            } catch (error) {
                console.error('Failed to load template content', error);
                alert('Failed to load template. Please try again.');
                return;
            }
            const result = await importScene(artifact.data);
            if (!result.ok) {
                const message = result.errors.map((error) => error.message).join('\n') || 'Unknown error';
                alert(`Failed to load template: ${message}`);
                return;
            }
            const metadataStore = useSceneMetadataStore.getState();
            const importedName = metadataStore.metadata?.name?.trim();
            if (!importedName) {
                const fallbackName = artifact.metadata?.name?.trim() || template.name;
                if (fallbackName) {
                    metadataStore.setName(fallbackName);
                }
            }
            const importedAuthor = metadataStore.metadata?.author?.trim();
            if (!importedAuthor || importedAuthor.length === 0) {
                const fallbackAuthor = artifact.metadata?.author?.trim() || template.author || '';
                metadataStore.setAuthor(fallbackAuthor);
            }
            undo.reset();
            refreshSceneUI();
            visualizer?.invalidateRender?.();
            setShowTemplateModal(false);
        } finally {
            finishTemplateLoading();
        }
    }, [
        finishTemplateLoading,
        refreshSceneUI,
        startTemplateLoading,
        undo,
        visualizer,
    ]);

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
        <div className="flex h-screen flex-col bg-neutral-800 text-neutral-100">
            <TemplateLoadingOverlay />
            <header style={{ 'backgroundColor': 'var(--twc-menubar)' }} className="border-b border-neutral-600 bg-[color:var(--twc-menubar)]/95 shadow-[0_2px_8px_rgba(0,0,0,0.25)] h-[48px]">
                <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-4 px-4 py-0 text-xs">
                    <div className="flex items-center gap-3 text-sm font-medium">
                        <Link to="/" title="Go to Home" style={{ display: 'inline-flex' }}>
                            <img width="50" src={logo} style={{ cursor: 'pointer', marginTop: "-1px" }} />
                        </Link>
                        <h3 style={{ marginRight: 0 }}>
                            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} title="Go to Home">
                                MVMNT v{((import.meta as any).env?.VITE_VERSION)} {isBetaMode ? '(beta)' : ''}
                            </Link>
                        </h3>
                        <span className="rounded-full border border-neutral-700/80 bg-neutral-800/80 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-neutral-300">
                            Easy Mode
                        </span>
                        <Link
                            to="/workspace"
                            className="text-xs inline-flex items-center justify-center gap-1 rounded border border-neutral-600 bg-neutral-800/70 px-3 py-1 text-neutral-100 transition-colors hover:border-neutral-400 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
                        >
                            Open Advanced Mode
                        </Link>
                    </div>
                    <div className="flex min-w-[240px] flex-1 flex-wrap items-center justify-center gap-3 text-[11px] text-neutral-300 md:justify-center">
                        <div className="flex items-center gap-2 text-neutral-200">
                            <span className="uppercase tracking-wide text-neutral-500">Scene</span>
                            <span
                                className="max-w-[220px] truncate rounded px-3 py-1 text-sm font-medium text-neutral-100"
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
                            className="text-xs inline-flex items-center justify-center gap-1 rounded border border-neutral-600 bg-neutral-800/70 px-3 py-1 text-neutral-100 transition-colors hover:border-neutral-400 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
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
                        <div className="flex items-center gap-2 mr-2">
                            <button
                                type="button"
                                onClick={handleExportVideo}
                                className="px-3 py-1 rounded cursor-pointer text-[12px] font-semibold shadow-sm inline-flex items-center justify-center bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-pink-400"
                                title="Render / Export Video"
                            >Export Video</button>
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
    const [metadataMap, setMetadataMap] = useState<Record<string, { name?: string; author?: string; description?: string }>>({});

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

    useEffect(() => {
        let cancelled = false;
        const loadAllMetadata = async () => {
            const results = await Promise.all(
                templates.map(async (template) => {
                    if (!template.loadMetadata) return undefined;
                    try {
                        const metadata = await template.loadMetadata();
                        if (!metadata) return undefined;
                        return [template.id, metadata] as const;
                    } catch {
                        return undefined;
                    }
                })
            );
            if (cancelled) return;
            setMetadataMap((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const entry of results) {
                    if (!entry) continue;
                    const [id, metadata] = entry;
                    const existing = prev[id];
                    if (
                        existing?.name === metadata.name &&
                        existing?.description === metadata.description &&
                        existing?.author === metadata.author
                    ) {
                        continue;
                    }
                    next[id] = metadata;
                    changed = true;
                }
                return changed ? next : prev;
            });
        };
        void loadAllMetadata();
        return () => {
            cancelled = true;
        };
    }, [templates]);

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
                            {templates.map((template) => {
                                const metadata = metadataMap[template.id];
                                const displayName = metadata?.name?.trim() || template.name;
                                const displayDescription = metadata?.description?.trim() || template.description;
                                const displayAuthor = metadata?.author?.trim() || template.author;
                                return (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => onSelect(template)}
                                        className="group flex h-full flex-col items-start gap-2 rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 text-left transition-colors hover:border-sky-500 hover:bg-neutral-800"
                                    >
                                        <span className="text-sm font-semibold text-neutral-100 group-hover:text-white">
                                            {displayName}
                                        </span>
                                        <span className="text-xs text-neutral-400 group-hover:text-neutral-300">
                                            {displayDescription}
                                        </span>
                                        {displayAuthor && (
                                            <span className="text-[11px] uppercase tracking-wide text-neutral-500 group-hover:text-neutral-400">
                                                By {displayAuthor}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EasyModeLayout;

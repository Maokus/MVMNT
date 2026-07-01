import React, { useEffect, useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useVisualizer } from '@context/VisualizerContext';
import { useTimelineStore } from '@state/timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useSceneStore } from '@state/sceneStore';
import SceneFontManager from '../scene-settings/SceneFontManager';
import SceneAnalysisCachesTab from '../scene-settings/SceneAnalysisCachesTab';
import ScenePluginsTab from '../scene-settings/ScenePluginsTab';

type ResizeScalingMode = 'scale' | 'reposition' | 'none';

const SCALING_MODE_OPTIONS: Array<{ id: ResizeScalingMode; label: string; description: string }> = [
    {
        id: 'scale',
        label: 'Scale All',
        description: 'Proportionally scale element positions and sizes',
    },
    {
        id: 'reposition',
        label: 'Reposition',
        description: 'Shift positions proportionally, keep sizes unchanged',
    },
    {
        id: 'none',
        label: 'No Change',
        description: 'Leave all element values unchanged',
    },
];

interface SceneSettingsModalProps {
    onClose: () => void;
}

const clampPositiveInt = (value: number, fallback: number) => {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
};

const SceneSettingsModal: React.FC<SceneSettingsModalProps> = ({ onClose }) => {
    const { exportSettings, setExportSettings, debugSettings, setDebugSettings } = useVisualizer();
    const view = useTimelineStore((s) => s.timelineView);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const setPlaybackRangeExplicitTicks = useTimelineStore((s) => s.setPlaybackRangeExplicitTicks);

    const metadata = useSceneMetadataStore((state) => state.metadata);
    const setMetadataName = useSceneMetadataStore((state) => state.setName);
    const setMetadataId = useSceneMetadataStore((state) => state.setId);
    const setMetadataDescription = useSceneMetadataStore((state) => state.setDescription);
    const setMetadataAuthor = useSceneMetadataStore((state) => state.setAuthor);

    const startTick = playbackRange?.startTick ?? view.startTick;
    const endTick = playbackRange?.endTick ?? view.endTick;
    const startBars = useMemo(() => {
        if (typeof startTick !== 'number') return 0;
        return (startTick / CANONICAL_PPQ) / (beatsPerBar || 4);
    }, [startTick, beatsPerBar]);
    const endBars = useMemo(() => {
        if (typeof endTick !== 'number') return 0;
        return (endTick / CANONICAL_PPQ) / (beatsPerBar || 4);
    }, [endTick, beatsPerBar]);

    const [localWidth, setLocalWidth] = useState<string>(() => String(exportSettings.width));
    const [localHeight, setLocalHeight] = useState<string>(() => String(exportSettings.height));
    const [localFps, setLocalFps] = useState<string>(() => String(exportSettings.fps));
    const [scalingMode, setScalingMode] = useState<ResizeScalingMode>('reposition');
    const [localStartBars, setLocalStartBars] = useState<string>(() => String(startBars ?? 0));
    const [localEndBars, setLocalEndBars] = useState<string>(() => String(endBars ?? 0));
    const [localSceneName, setLocalSceneName] = useState<string>(() => metadata.name);
    const [localSceneId, setLocalSceneId] = useState<string>(() => metadata.id);
    const [localDescription, setLocalDescription] = useState<string>(() => metadata.description ?? '');
    const [localAuthor, setLocalAuthor] = useState<string>(() => metadata.author ?? '');

    useEffect(() => { setLocalWidth(String(exportSettings.width)); }, [exportSettings.width]);
    useEffect(() => { setLocalHeight(String(exportSettings.height)); }, [exportSettings.height]);
    useEffect(() => { setLocalFps(String(exportSettings.fps)); }, [exportSettings.fps]);
    useEffect(() => { setLocalStartBars(String(Number.isFinite(startBars) ? startBars : 0)); }, [startBars]);
    useEffect(() => { setLocalEndBars(String(Number.isFinite(endBars) ? endBars : 0)); }, [endBars]);
    useEffect(() => { setLocalSceneName(metadata.name); }, [metadata.name]);
    useEffect(() => { setLocalSceneId(metadata.id); }, [metadata.id]);
    useEffect(() => { setLocalDescription(metadata.description ?? ''); }, [metadata.description]);
    useEffect(() => { setLocalAuthor(metadata.author ?? ''); }, [metadata.author]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const commitSceneSetting = (key: 'width' | 'height' | 'fps') => {
        const raw = key === 'width' ? localWidth : key === 'height' ? localHeight : localFps;
        const fallback = (exportSettings as any)[key];
        const next = clampPositiveInt(parseInt(raw, 10), fallback);

        if ((key === 'width' || key === 'height') && scalingMode !== 'none' && next !== fallback) {
            const oldWidth = exportSettings.width;
            const oldHeight = exportSettings.height;
            const newWidth = key === 'width' ? next : oldWidth;
            const newHeight = key === 'height' ? next : oldHeight;
            const wRatio = newWidth / oldWidth;
            const hRatio = newHeight / oldHeight;

            const { bindings: { byElement }, order, updateBindings } = useSceneStore.getState();
            for (const elementId of order) {
                const elBindings = byElement[elementId];
                if (!elBindings) continue;

                const patch: Record<string, { type: 'constant'; value: number }> = {};
                const tryScale = (propKey: string, multiplier: number) => {
                    const binding = elBindings[propKey];
                    if (binding?.type === 'constant' && typeof binding.value === 'number') {
                        const newVal = binding.value * multiplier;
                        if (newVal !== binding.value) {
                            patch[propKey] = { type: 'constant', value: newVal };
                        }
                    }
                };

                tryScale('offsetX', wRatio);
                tryScale('offsetY', hRatio);
                if (scalingMode === 'scale') {
                    tryScale('elementScaleX', wRatio);
                    tryScale('elementScaleY', hRatio);
                }

                if (Object.keys(patch).length > 0) {
                    updateBindings(elementId, patch);
                }
            }
        }

        setExportSettings((prev: any) => ({ ...prev, [key]: next }));
        if (key === 'width') setLocalWidth(String(next));
        if (key === 'height') setLocalHeight(String(next));
        if (key === 'fps') setLocalFps(String(next));
    };

    const commitSceneName = () => {
        const trimmed = localSceneName.trim();
        if (!trimmed) {
            setLocalSceneName(metadata.name);
            return;
        }
        setMetadataName(trimmed);
    };

    const commitSceneId = () => {
        const trimmed = localSceneId.trim();
        if (!trimmed) {
            setLocalSceneId(metadata.id);
            return;
        }
        setMetadataId(trimmed);
    };

    const commitDescription = () => {
        setMetadataDescription(localDescription);
    };
    const commitAuthor = () => {
        setMetadataAuthor(localAuthor);
    };

    const commitSceneRange = () => {
        const parse = (value: string) => {
            const n = parseFloat(value);
            return Number.isFinite(n) ? n : undefined;
        };
        const startVal = parse(localStartBars);
        const endVal = parse(localEndBars);
        if (startVal == null && endVal == null) {
            setPlaybackRangeExplicitTicks(undefined, undefined);
            return;
        }
        const beatsPerBarNow = beatsPerBar || 4;
        const toTicks = (bars?: number) =>
            typeof bars === 'number' ? Math.round(bars * beatsPerBarNow * CANONICAL_PPQ) : undefined;
        setPlaybackRangeExplicitTicks(toTicks(startVal ?? undefined), toTicks(endVal ?? undefined));
    };

    const onModalClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
        e.stopPropagation();
    };

    const formatTimestamp = (value: string) => {
        if (!value) return '—';
        try {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return value;
            return date.toLocaleString();
        } catch {
            return value;
        }
    };

    const [activeTab, setActiveTab] = useState<'general' | 'caches' | 'fonts' | 'debug' | 'metadata' | 'plugins'>('general');

    const tabs: Array<{ id: typeof activeTab; label: string }> = useMemo(
        () => [
            { id: 'general', label: 'General' },
            { id: 'caches', label: 'Caches' },
            { id: 'fonts', label: 'Fonts' },
            { id: 'plugins', label: 'Plugins' },
            { id: 'debug', label: 'Debug' },
            { id: 'metadata', label: 'Metadata' },
        ],
        [],
    );

    return (
        <div className="fixed inset-0 z-[9800] flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
            <div
                className="relative flex h-full max-h-[90vh] w-[700px] max-w-[95vw] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900/95 p-5 text-sm text-neutral-200 shadow-2xl"
                onClick={onModalClick}
            >
                <button
                    type="button"
                    className="absolute right-3 top-3 rounded-full border border-transparent p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                    onClick={onClose}
                    aria-label="Close scene settings"
                >
                    <FaTimes />
                </button>
                <h2 className="m-0 mb-1 text-lg font-semibold text-white">Scene Settings</h2>
                <p className="m-0 mb-4 text-[13px] text-neutral-400">
                    Adjust render dimensions, playback range, and debug tools for the current scene.
                </p>
                <div className="mb-4 flex gap-2 overflow-x-auto border-b border-neutral-800 pb-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`rounded px-3 py-1 text-[12px] transition-colors ${activeTab === tab.id
                                ? 'bg-sky-600/20 text-sky-200'
                                : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto pr-1">
                    {activeTab === 'general' && (
                        <div className="flex flex-col gap-5">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <label className="flex flex-col gap-1 text-[12px]">
                                    Width
                                    <input
                                        type="number"
                                        min={16}
                                        max={8192}
                                        value={localWidth}
                                        onChange={(e) => setLocalWidth(e.target.value)}
                                        onBlur={() => commitSceneSetting('width')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitSceneSetting('width');
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="number-input w-full"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-[12px]">
                                    Height
                                    <input
                                        type="number"
                                        min={16}
                                        max={8192}
                                        value={localHeight}
                                        onChange={(e) => setLocalHeight(e.target.value)}
                                        onBlur={() => commitSceneSetting('height')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitSceneSetting('height');
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="number-input w-full"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-[12px]">
                                    FPS
                                    <input
                                        type="number"
                                        min={1}
                                        max={240}
                                        value={localFps}
                                        onChange={(e) => setLocalFps(e.target.value)}
                                        onBlur={() => commitSceneSetting('fps')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitSceneSetting('fps');
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="number-input w-full"
                                    />
                                </label>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[12px] text-neutral-400">Resize Scaling Mode</span>
                                <div className="flex gap-1">
                                    {SCALING_MODE_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            title={opt.description}
                                            onClick={() => setScalingMode(opt.id)}
                                            className={`rounded px-3 py-1 text-[12px] transition-colors ${scalingMode === opt.id
                                                    ? 'bg-sky-600/30 text-sky-200 ring-1 ring-sky-500/50'
                                                    : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <span className="text-[11px] text-neutral-500">
                                    {SCALING_MODE_OPTIONS.find((o) => o.id === scalingMode)?.description}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="flex flex-col gap-1 text-[12px]">
                                    Scene Start (bars)
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={localStartBars}
                                        onChange={(e) => setLocalStartBars(e.target.value)}
                                        onBlur={commitSceneRange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitSceneRange();
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="number-input w-full"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-[12px]">
                                    Scene End (bars)
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={localEndBars}
                                        onChange={(e) => setLocalEndBars(e.target.value)}
                                        onBlur={commitSceneRange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitSceneRange();
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="number-input w-full"
                                    />
                                </label>
                            </div>
                        </div>
                    )}
                    {activeTab === 'caches' && <SceneAnalysisCachesTab />}
                    {activeTab === 'fonts' && (
                        <div className="flex flex-col gap-3">
                            <h3 className="m-0 text-[13px] font-semibold text-white">Fonts</h3>
                            <p className="m-0 text-[12px] text-neutral-400">
                                Upload custom fonts for this scene and manage the shared font library available to font pickers.
                            </p>
                            <SceneFontManager />
                        </div>
                    )}
                    {activeTab === 'plugins' && <ScenePluginsTab />}
                    {activeTab === 'debug' && (
                        <div className="flex flex-col gap-3">
                            <h3 className="m-0 text-[13px] font-semibold text-white">Debug</h3>
                            <label className="flex items-center gap-2 text-[12px] text-neutral-300">
                                <input
                                    type="checkbox"
                                    checked={!!debugSettings?.showAnchorPoints}
                                    onChange={(e) => setDebugSettings((prev) => ({ ...prev, showAnchorPoints: e.target.checked }))}
                                />
                                Show Anchor Points
                            </label>
                            <label className="flex items-center gap-2 text-[12px] text-neutral-300">
                                <input
                                    type="checkbox"
                                    checked={!!debugSettings?.showDevelopmentOverlay}
                                    onChange={(e) =>
                                        setDebugSettings((prev) => ({
                                            ...prev,
                                            showDevelopmentOverlay: e.target.checked,
                                        }))
                                    }
                                />
                                Enable Development Overlay
                            </label>
                        </div>
                    )}
                    {activeTab === 'metadata' && (
                        <div className="flex flex-col gap-3">
                            <h3 className="m-0 text-[13px] font-semibold text-white">Scene Metadata</h3>
                            <label className="flex flex-col gap-1 text-[12px]">
                                Scene Name
                                <input
                                    type="text"
                                    value={localSceneName}
                                    onChange={(e) => setLocalSceneName(e.target.value)}
                                    onBlur={commitSceneName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            commitSceneName();
                                            (e.currentTarget as HTMLInputElement).blur();
                                        }
                                    }}
                                    className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-neutral-100 focus:border-sky-500 focus:outline-none"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-[12px]">
                                Scene ID
                                <input
                                    type="text"
                                    value={localSceneId}
                                    onChange={(e) => setLocalSceneId(e.target.value)}
                                    onBlur={commitSceneId}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            commitSceneId();
                                            (e.currentTarget as HTMLInputElement).blur();
                                        }
                                    }}
                                    className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-neutral-100 focus:border-sky-500 focus:outline-none"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-[12px]">
                                Description
                                <textarea
                                    value={localDescription}
                                    onChange={(e) => setLocalDescription(e.target.value)}
                                    onBlur={commitDescription}
                                    rows={3}
                                    className="w-full resize-none rounded border border-neutral-700 bg-neutral-800/60 px-2 py-2 text-neutral-100 focus:border-sky-500 focus:outline-none"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-[12px]">
                                Author
                                <input
                                    type="text"
                                    value={localAuthor}
                                    onChange={(e) => setLocalAuthor(e.target.value)}
                                    onBlur={commitAuthor}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            commitAuthor();
                                            (e.currentTarget as HTMLInputElement).blur();
                                        }
                                    }}
                                    className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-neutral-100 focus:border-sky-500 focus:outline-none"
                                />
                            </label>
                            <div className="grid grid-cols-1 gap-3 text-[11px] text-neutral-400 sm:grid-cols-2">
                                <div>
                                    <span className="block uppercase tracking-wide text-neutral-500">Created</span>
                                    <span className="block text-neutral-300">{formatTimestamp(metadata.createdAt)}</span>
                                </div>
                                <div>
                                    <span className="block uppercase tracking-wide text-neutral-500">Modified</span>
                                    <span className="block text-neutral-300">{formatTimestamp(metadata.modifiedAt)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SceneSettingsModal;

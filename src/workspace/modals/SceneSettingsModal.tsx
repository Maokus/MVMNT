import React, { useEffect, useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useVisualizer } from '@context/VisualizerContext';
import { useTimelineStore } from '@state/timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useScene } from '@context/SceneContext';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import SceneFontManager from '../scene-settings/SceneFontManager';
import SceneAnalysisCachesTab from '../scene-settings/SceneAnalysisCachesTab';
import ScenePluginsTab from '../scene-settings/ScenePluginsTab';
import {
    connectToDevPluginServer,
    getDevPluginConnectionStatus,
    setDevPluginServerContinuousScanning,
    subscribeToDevPluginConnectionStatus,
    type DevPluginConnectionStatus,
} from '@core/scene/plugins/dev-plugin-watcher';

type ResizeScalingMode = 'scale' | 'reposition' | 'none';

const SCALING_MODE_OPTIONS: Array<{ id: ResizeScalingMode; label: string; description: string }> = [
    {
        id: 'scale',
        label: 'Scale All',
        description: 'Proportionally scale element positions, sizes, and keyframe values',
    },
    {
        id: 'reposition',
        label: 'Reposition',
        description: 'Shift positions proportionally (corner-snap for static, proportional for animated), keep sizes unchanged',
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
    const { renameScene } = useScene();
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
    const [devPluginConnection, setDevPluginConnection] = useState<DevPluginConnectionStatus>(getDevPluginConnectionStatus);

    useEffect(() => subscribeToDevPluginConnectionStatus(setDevPluginConnection), []);

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

    // Pending (normalised but not yet applied) dimensions
    const pendingWidth = useMemo(
        () => clampPositiveInt(parseInt(localWidth, 10), exportSettings.width),
        [localWidth, exportSettings.width],
    );
    const pendingHeight = useMemo(
        () => clampPositiveInt(parseInt(localHeight, 10), exportSettings.height),
        [localHeight, exportSettings.height],
    );
    const hasResizeChanges =
        pendingWidth !== exportSettings.width || pendingHeight !== exportSettings.height;

    // Normalise width/height inputs on blur/Enter without committing the resize
    const normalizeWidth = () => setLocalWidth(String(pendingWidth));
    const normalizeHeight = () => setLocalHeight(String(pendingHeight));

    const applyResize = () => {
        const newWidth = pendingWidth;
        const newHeight = pendingHeight;
        const oldWidth = exportSettings.width;
        const oldHeight = exportSettings.height;

        if (newWidth === oldWidth && newHeight === oldHeight) return;

        const mergeKey = `resize-elements-${Date.now()}`;
        const { bindings: { byElement }, order, automation } = useSceneStore.getState();
        const wRatio = newWidth / oldWidth;
        const hRatio = newHeight / oldHeight;
        const dw = newWidth - oldWidth;
        const dh = newHeight - oldHeight;

        if (scalingMode !== 'none') {
            const refPoints =
                scalingMode === 'reposition'
                    ? [
                        { x: 0, y: 0, dx: 0, dy: 0 },
                        { x: oldWidth, y: 0, dx: dw, dy: 0 },
                        { x: 0, y: oldHeight, dx: 0, dy: dh },
                        { x: oldWidth, y: oldHeight, dx: dw, dy: dh },
                        { x: oldWidth / 2, y: oldHeight / 2, dx: dw / 2, dy: dh / 2 },
                    ]
                    : null;

            for (const elementId of order) {
                const elBindings = byElement[elementId];
                if (!elBindings) continue;

                // ── Constant bindings ──────────────────────────────────────────────
                const patch: Record<string, number> = {};

                if (scalingMode === 'reposition') {
                    const oxB = elBindings['offsetX'];
                    const oyB = elBindings['offsetY'];
                    if (
                        oxB?.type === 'constant' && typeof oxB.value === 'number' &&
                        oyB?.type === 'constant' && typeof oyB.value === 'number'
                    ) {
                        const ox = oxB.value;
                        const oy = oyB.value;
                        let minDist = Infinity;
                        let bestDx = 0;
                        let bestDy = 0;
                        for (const ref of refPoints!) {
                            const d = Math.hypot(ox - ref.x, oy - ref.y);
                            if (d < minDist) { minDist = d; bestDx = ref.dx; bestDy = ref.dy; }
                        }
                        if (bestDx !== 0) patch['offsetX'] = ox + bestDx;
                        if (bestDy !== 0) patch['offsetY'] = oy + bestDy;
                    }
                } else {
                    // scale mode – positions and sizes
                    const oxB = elBindings['offsetX'];
                    const oyB = elBindings['offsetY'];
                    if (oxB?.type === 'constant' && typeof oxB.value === 'number') {
                        const newOx = oxB.value * wRatio;
                        if (newOx !== oxB.value) patch['offsetX'] = newOx;
                    }
                    if (oyB?.type === 'constant' && typeof oyB.value === 'number') {
                        const newOy = oyB.value * hRatio;
                        if (newOy !== oyB.value) patch['offsetY'] = newOy;
                    }
                    const sxB = elBindings['elementScaleX'];
                    const syB = elBindings['elementScaleY'];
                    if (sxB?.type === 'constant' && typeof sxB.value === 'number') {
                        const newSx = sxB.value * wRatio;
                        if (newSx !== sxB.value) patch['elementScaleX'] = newSx;
                    }
                    if (syB?.type === 'constant' && typeof syB.value === 'number') {
                        const newSy = syB.value * hRatio;
                        if (newSy !== syB.value) patch['elementScaleY'] = newSy;
                    }
                }

                if (Object.keys(patch).length > 0) {
                    dispatchSceneCommand(
                        { type: 'updateElementConfig', elementId, patch },
                        { mergeKey },
                    );
                }

                // ── Keyframe bindings ──────────────────────────────────────────────
                // Reposition mode: proportionally shift animated positions (same formula
                // as scale for keyframes; discrete corner-snapping only applies to static values).
                // Scale mode: scale positions AND sizes.
                const kfProps: Array<{ propKey: string; ratio: number }> = [];
                if (scalingMode === 'scale') {
                    kfProps.push(
                        { propKey: 'offsetX', ratio: wRatio },
                        { propKey: 'offsetY', ratio: hRatio },
                        { propKey: 'elementScaleX', ratio: wRatio },
                        { propKey: 'elementScaleY', ratio: hRatio },
                    );
                } else {
                    // reposition: only shift positions, not sizes
                    kfProps.push(
                        { propKey: 'offsetX', ratio: wRatio },
                        { propKey: 'offsetY', ratio: hRatio },
                    );
                }

                for (const { propKey, ratio } of kfProps) {
                    const binding = elBindings[propKey];
                    if (binding?.type !== 'keyframes') continue;
                    const channel = automation.channels[binding.channelId];
                    if (!channel || channel.keyframes.length === 0) continue;
                    const newKeyframes = channel.keyframes.map((kf) => ({
                        ...kf,
                        value: typeof kf.value === 'number' ? kf.value * ratio : kf.value,
                    }));
                    dispatchSceneCommand(
                        { type: 'batchUpdateKeyframes', channelId: channel.id, keyframes: newKeyframes },
                        { mergeKey },
                    );
                }
            }
        }

        dispatchSceneCommand(
            { type: 'updateSceneSettings', patch: { width: newWidth, height: newHeight } },
            { mergeKey },
        );
        setExportSettings((prev: any) => ({ ...prev, width: newWidth, height: newHeight }));
        setLocalWidth(String(newWidth));
        setLocalHeight(String(newHeight));
    };

    const commitFps = () => {
        const next = clampPositiveInt(parseInt(localFps, 10), exportSettings.fps);
        setExportSettings((prev: any) => ({ ...prev, fps: next }));
        setLocalFps(String(next));
    };

    const commitSceneName = () => {
        const trimmed = localSceneName.trim();
        if (!trimmed) {
            setLocalSceneName(metadata.name);
            return;
        }
        void renameScene(trimmed).then((renamed) => {
            if (!renamed) setLocalSceneName(metadata.name);
        });
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
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <label className="flex flex-col gap-1 text-[12px]">
                                    Width
                                    <input
                                        type="number"
                                        min={16}
                                        max={8192}
                                        value={localWidth}
                                        onChange={(e) => setLocalWidth(e.target.value)}
                                        onBlur={normalizeWidth}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                normalizeWidth();
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
                                        onBlur={normalizeHeight}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                normalizeHeight();
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
                                        onBlur={commitFps}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitFps();
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="number-input w-full"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-[12px]">
                                    Scaling Mode
                                    <select
                                        value={scalingMode}
                                        onChange={(e) => setScalingMode(e.target.value as ResizeScalingMode)}
                                        className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-[5px] text-[12px] text-neutral-100 focus:border-sky-500 focus:outline-none"
                                    >
                                        {SCALING_MODE_OPTIONS.map((opt) => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    disabled={!hasResizeChanges}
                                    onClick={applyResize}
                                    className={`rounded px-4 py-1.5 text-[12px] font-medium transition-colors ${hasResizeChanges
                                            ? 'bg-sky-600 text-white hover:bg-sky-500'
                                            : 'cursor-not-allowed bg-neutral-700/50 text-neutral-500'
                                        }`}
                                >
                                    Apply Resize
                                </button>
                                {hasResizeChanges && (
                                    <span className="text-[11px] text-neutral-400">
                                        {pendingWidth} × {pendingHeight} —{' '}
                                        {SCALING_MODE_OPTIONS.find((o) => o.id === scalingMode)?.description}
                                    </span>
                                )}
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
                            <div className="mt-2 rounded border border-neutral-700 bg-neutral-800/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="m-0 text-[12px] font-medium text-neutral-100">Development Plugin Server</h4>
                                        <p className="m-0 mt-1 text-[11px] text-neutral-400">
                                            {devPluginConnection.state === 'idle' && 'Not connected. Connect to enable development plugin hot reload.'}
                                            {devPluginConnection.state === 'connecting' && `Scanning local ports ${devPluginConnection.portRange}…`}
                                            {devPluginConnection.state === 'connected' && (devPluginConnection.scanning ? `Connected while scanning ports ${devPluginConnection.portRange}.` : 'Connected to a development plugin server.')}
                                            {devPluginConnection.state === 'failed' && `No development plugin server responded on ports ${devPluginConnection.portRange}.`}
                                            {devPluginConnection.state === 'unavailable' && 'Development plugin servers are available only while running MVMNT in development mode.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={connectToDevPluginServer}
                                        disabled={devPluginConnection.scanning || devPluginConnection.state === 'unavailable'}
                                        className="shrink-0 rounded bg-sky-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                                    >
                                        {devPluginConnection.scanning ? 'Scanning…' : devPluginConnection.servers.length > 0 ? 'Scan Again' : 'Scan'}
                                    </button>
                                </div>
                                <div className="mt-3 border-t border-neutral-700 pt-3">
                                    <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-300">
                                        <span>Scanning ports {devPluginConnection.portRange}</span>
                                        <label className="flex cursor-pointer items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={devPluginConnection.continuousScanning}
                                                disabled={devPluginConnection.state === 'unavailable'}
                                                onChange={(event) => setDevPluginServerContinuousScanning(event.target.checked)}
                                            />
                                            Continue scanning
                                        </label>
                                    </div>
                                    {devPluginConnection.continuousScanning && (
                                        <p className="m-0 mt-1 text-[11px] text-neutral-500">Checks once every few seconds for servers that start later.</p>
                                    )}
                                    <div className="mt-2 rounded bg-neutral-950/40 px-2 py-1.5 text-[11px]">
                                        <div className="font-medium text-neutral-300">Connected servers</div>
                                        {devPluginConnection.servers.length > 0 ? (
                                            <ul className="m-0 mt-1 list-none space-y-1 p-0 text-emerald-300">
                                                {devPluginConnection.servers.map((server) => (
                                                    <li key={server.serverUrl}>
                                                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                        localhost:{server.port}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="m-0 mt-1 text-neutral-500">No servers connected.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
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

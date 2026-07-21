import React, { useCallback, useEffect, useState } from 'react';
import { useVisualizer } from '@context/VisualizerContext';
import type { ExportSettings } from '@context/visualizer/types';
import { ensureMp3EncoderRegistered } from '@export/mp3-encoder-loader';
import { ensureAacEncoderRegistered } from '@export/aac-encoder-loader';
import type { FpsMode, ExportFormat, VideoContainer, VideoBitrateSetting, FormState } from './render-modal/types';
import { deriveInitialFormState } from './render-modal/initialFormState';
import { useCodecCapabilities } from './render-modal/useCodecCapabilities';
import { useExportEstimates } from './render-modal/useExportEstimates';
import { FormField, inputCls } from './render-modal/FormField';
import { deleteExportPreset, loadExportPresets, saveExportPreset, type ExportPreset } from '@export/export-presets';

interface RenderModalProps {
    onClose: () => void;
}

// Simple modal to configure export settings & trigger video export.
const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
    const { exportSettings, exportVideo, exportSequence, exportBatch, setExportSettings, sceneName, exportKind, totalDuration } = useVisualizer();

    const [form, setForm] = useState<FormState>(() =>
        deriveInitialFormState(exportSettings, exportKind, sceneName),
    );
    const updateForm = useCallback((patch: Partial<FormState>) => {
        setForm(prev => ({ ...prev, ...patch }));
    }, []);

    // When sceneName changes and user hasn't customized the filename, sync it.
    useEffect(() => {
        setForm(prev => {
            if (prev.filename && prev.filename !== sceneName) return prev;
            return { ...prev, filename: sceneName || '' };
        });
    }, [sceneName]);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    const { videoCodecs, audioCodecs, capLoaded, getPreferredVideoCodec, getPreferredAudioCodec } =
        useCodecCapabilities();

    const [isExporting, setIsExporting] = useState(false);
    const [autoVideoCodec, setAutoVideoCodec] = useState(true);
    const [autoAudioCodec, setAutoAudioCodec] = useState(true);
    const [presets, setPresets] = useState<ExportPreset[]>(() => loadExportPresets());
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [batchPresetIds, setBatchPresetIds] = useState<string[]>([]);
    const [batchRanges, setBatchRanges] = useState('');

    const applyPreset = useCallback((preset: ExportPreset) => {
        const settings = preset.settings;
        setForm((previous) => ({
            ...previous,
            format: settings.transparentBackground ? 'png' : previous.format,
            width: settings.width ?? previous.width,
            height: settings.height ?? previous.height,
            fpsMode: settings.fps === 24 || settings.fps === 30 || settings.fps === 60 ? String(settings.fps) as FpsMode : settings.fps ? 'custom' : previous.fpsMode,
            customFps: settings.fps ?? previous.customFps,
            includeAudio: settings.includeAudio ?? previous.includeAudio,
            container: settings.container === 'webm' ? 'webm' : settings.container === 'mp4' ? 'mp4' : previous.container,
            videoCodec: settings.videoCodec ?? previous.videoCodec,
            audioCodec: settings.audioCodec ?? previous.audioCodec,
            transparentBackground: settings.transparentBackground ?? previous.transparentBackground,
        }));
    }, []);

    // Auto-select video codec when codec list loads or container/format changes.
    useEffect(() => {
        if (form.format !== 'video' || !videoCodecs.length) return;
        if (!videoCodecs.includes(form.videoCodec)) setAutoVideoCodec(true);
        if (!autoVideoCodec && videoCodecs.includes(form.videoCodec)) return;
        const preferred = getPreferredVideoCodec(form.container);
        if (preferred !== form.videoCodec) updateForm({ videoCodec: preferred });
    }, [autoVideoCodec, videoCodecs, form.videoCodec, form.format, form.container, getPreferredVideoCodec, updateForm]);

    // Auto-select audio codec when codec list loads or container/format changes.
    useEffect(() => {
        if (form.format !== 'video' || !audioCodecs.length) return;
        if (!audioCodecs.includes(form.audioCodec)) setAutoAudioCodec(true);
        if (!autoAudioCodec && audioCodecs.includes(form.audioCodec)) return;
        const preferred = getPreferredAudioCodec(form.container);
        if (preferred !== form.audioCodec) updateForm({ audioCodec: preferred });
    }, [audioCodecs, autoAudioCodec, form.audioCodec, form.format, form.container, getPreferredAudioCodec, updateForm]);

    const handleVideoCodecSelect = useCallback((codec: string) => {
        setAutoVideoCodec(false);
        updateForm({ videoCodec: codec });
    }, [updateForm]);

    const handleAudioCodecSelect = useCallback((codec: string) => {
        setAutoAudioCodec(false);
        updateForm({ audioCodec: codec });
    }, [updateForm]);

    // Prefetch encoder chunk when user selects MP3 or AAC to reduce export latency.
    useEffect(() => {
        if (form.audioCodec === 'mp3') ensureMp3EncoderRegistered();
        else if (form.audioCodec === 'aac') ensureAacEncoderRegistered();
    }, [form.audioCodec]);

    const handleFormatChange = useCallback((nextFormat: ExportFormat) => {
        setAutoVideoCodec(true);
        setAutoAudioCodec(true);
        setForm(prev => {
            if (prev.format === nextFormat) return prev;
            const next: FormState = { ...prev, format: nextFormat };
            if (nextFormat !== 'video') return next;
            return {
                ...next,
                videoCodec: getPreferredVideoCodec(next.container),
                audioCodec: getPreferredAudioCodec(next.container),
            };
        });
    }, [getPreferredAudioCodec, getPreferredVideoCodec]);

    const handleContainerChange = useCallback((nextContainer: VideoContainer) => {
        setAutoVideoCodec(true);
        setAutoAudioCodec(true);
        setForm(prev => {
            if (prev.container === nextContainer) return prev;
            const next: FormState = { ...prev, container: nextContainer };
            if (next.format !== 'video') return next;
            return {
                ...next,
                videoCodec: getPreferredVideoCodec(nextContainer),
                audioCodec: getPreferredAudioCodec(nextContainer),
            };
        });
    }, [getPreferredAudioCodec, getPreferredVideoCodec]);

    const {
        effectiveFps,
        isManualVideoBitrate,
        resolvedQualityPreset,
        autoBitrateEstimate,
        resolvedVideoBitrate,
        effectiveDuration,
        fileSizeEstimate,
    } = useExportEstimates(form, exportSettings, totalDuration);

    const beginExport = async () => {
        const trimmedFilename = form.filename.trim();
        const baseOverrides: Partial<ExportSettings> = {
            width: form.width,
            height: form.height,
            fullDuration: form.fullDuration,
            startTime: form.startTime,
            endTime: form.endTime,
            includeAudio: form.includeAudio,
            filename: trimmedFilename || undefined,
            fps: effectiveFps,
            videoCodec: form.videoCodec,
            videoBitrateMode: isManualVideoBitrate ? 'manual' : 'auto',
            qualityPreset: resolvedQualityPreset,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
            container: form.container,
            transparentBackground: form.format === 'png' ? form.transparentBackground : false,
            exportAudioMaster: form.format === 'video' && form.includeAudio ? form.exportAudioMaster : false,
            exportAudioStems: form.format === 'video' && form.includeAudio ? form.exportAudioStems : false,
            audioWavBitDepth: form.audioWavBitDepth,
            normalizeAudio: form.normalizeAudio,
        };
        const overrides: Partial<ExportSettings> =
            resolvedVideoBitrate != null
                ? { ...baseOverrides, videoBitrate: resolvedVideoBitrate }
                : baseOverrides;

        setExportSettings(prev => ({ ...prev, ...overrides }));
        setIsExporting(true);
        try {
            if (form.format !== 'video') {
                await exportSequence(overrides);
            } else {
                await exportVideo(overrides);
            }
            onClose();
        } catch {
            // surfaced upstream
        } finally {
            setIsExporting(false);
        }
    };

    const saveCurrentPreset = () => {
        const name = window.prompt('Preset name');
        if (!name?.trim()) return;
        const preset = saveExportPreset(name, {
            width: form.width,
            height: form.height,
            fps: effectiveFps,
            includeAudio: form.includeAudio,
            container: form.container,
            videoCodec: form.videoCodec,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
            transparentBackground: form.transparentBackground,
            exportAudioMaster: form.exportAudioMaster,
            exportAudioStems: form.exportAudioStems,
            audioWavBitDepth: form.audioWavBitDepth,
            normalizeAudio: form.normalizeAudio,
        });
        setPresets((current) => [...current, preset]);
        setSelectedPresetId(preset.id);
    };

    const queuePresetBatch = async () => {
        const selected = presets.filter((preset) => batchPresetIds.includes(preset.id));
        if (selected.length === 0) return;
        const common: Partial<ExportSettings> = {
            width: form.width,
            height: form.height,
            fps: effectiveFps,
            fullDuration: form.fullDuration,
            startTime: form.startTime,
            endTime: form.endTime,
            includeAudio: form.includeAudio,
            filename: form.filename.trim() || undefined,
            container: form.container,
            videoCodec: form.videoCodec,
            videoBitrateMode: isManualVideoBitrate ? 'manual' : 'auto',
            videoBitrate: resolvedVideoBitrate ?? undefined,
            qualityPreset: resolvedQualityPreset,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
            transparentBackground: form.transparentBackground,
            exportAudioMaster: form.exportAudioMaster,
            exportAudioStems: form.exportAudioStems,
            audioWavBitDepth: form.audioWavBitDepth,
            normalizeAudio: form.normalizeAudio,
        };
        await exportBatch(selected.map((preset) => ({
            kind: (preset.settings.transparentBackground ? 'png' : form.format) as 'png' | 'video',
            settings: { ...common, ...preset.settings },
            presetName: preset.name,
        })));
        onClose();
    };

    const queueRangeBatch = async () => {
        const ranges = batchRanges.split(',').map((value) => value.trim()).filter(Boolean).map((value) => {
            const match = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/.exec(value);
            return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
        });
        if (ranges.length === 0 || ranges.some((range) => !range || range.start >= range.end)) {
            alert('Enter ranges as start-end seconds, separated by commas.');
            return;
        }
        const settings: Partial<ExportSettings> = {
            width: form.width,
            height: form.height,
            fps: effectiveFps,
            includeAudio: form.includeAudio,
            filename: `${form.filename.trim() || '{scene}'}_{range}`,
            container: form.container,
            videoCodec: form.videoCodec,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
            transparentBackground: form.transparentBackground,
            exportAudioMaster: form.exportAudioMaster,
            exportAudioStems: form.exportAudioStems,
            audioWavBitDepth: form.audioWavBitDepth,
            normalizeAudio: form.normalizeAudio,
        };
        await exportBatch(ranges.map((range) => ({
            kind: form.format,
            settings: { ...settings, fullDuration: false, startTime: range!.start, endTime: range!.end },
        })));
        onClose();
    };

    const exportLabel =
        form.format === 'video'
            ? form.container === 'webm' ? 'Start WebM Render' : 'Start MP4 Render'
            : 'Start PNG Export';

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9700]" role="dialog" aria-modal="true">
            <div className="border rounded-lg w-[560px] max-w-[92vw] max-h-[90vh] overflow-y-auto p-5 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl relative">
                <h2 className="m-0 text-xl font-semibold mb-2">Render / Export</h2>
                <p className="m-0 mb-4 text-sm opacity-80">Choose output format & advanced settings. Resolution defaults come from Global Properties; you can override FPS here.</p>

                <div className="grid grid-cols-[1fr_auto_auto] gap-2 mb-4">
                    <select
                        value={selectedPresetId}
                        onChange={(event) => {
                            setSelectedPresetId(event.target.value);
                            const preset = presets.find((item) => item.id === event.target.value);
                            if (preset) applyPreset(preset);
                        }}
                        className={inputCls}
                    >
                        <option value="">Export preset…</option>
                        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    </select>
                    <button className="px-2 rounded bg-neutral-700 text-xs" onClick={saveCurrentPreset}>Save preset</button>
                    <button
                        className="px-2 rounded bg-neutral-700 text-xs disabled:opacity-40"
                        disabled={!selectedPresetId || presets.find((item) => item.id === selectedPresetId)?.builtin}
                        onClick={() => {
                            deleteExportPreset(selectedPresetId);
                            setPresets(loadExportPresets());
                            setSelectedPresetId('');
                        }}
                    >Delete</button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <FormField label="Filename" span2 hint="Extension is automatic. Templates: {scene}, {width}, {height}, {fps}, {range}, {date}.">
                        <input
                            type="text"
                            placeholder={sceneName || 'filename'}
                            value={form.filename}
                            onChange={e => updateForm({ filename: e.target.value })}
                            className={inputCls}
                        />
                    </FormField>

                    <FormField label="Format">
                        <select
                            value={form.format}
                            onChange={e => {
                                const v = e.target.value;
                                if (v === 'video' || v === 'png') handleFormatChange(v);
                            }}
                            className={inputCls}
                        >
                            <option value="video">Video</option>
                            <option value="png">PNG Sequence</option>
                        </select>
                    </FormField>

                    <FormField label="Width">
                        <input type="number" min={16} max={16384} value={form.width} onChange={e => updateForm({ width: Math.max(16, Number(e.target.value) || 16) })} className={inputCls} />
                    </FormField>
                    <FormField label="Height">
                        <input type="number" min={16} max={16384} value={form.height} onChange={e => updateForm({ height: Math.max(16, Number(e.target.value) || 16) })} className={inputCls} />
                    </FormField>

                    {form.format === 'video' && (
                        <FormField label="Container">
                            <select
                                value={form.container}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (v === 'mp4' || v === 'webm') handleContainerChange(v);
                                }}
                                className={inputCls}
                            >
                                <option value="mp4">MP4 (.mp4)</option>
                                <option value="webm">WebM (.webm)</option>
                            </select>
                        </FormField>
                    )}

                    {form.format === 'png' && (
                        <label className="flex items-center gap-2 col-span-2 select-none">
                            <input
                                type="checkbox"
                                checked={form.transparentBackground}
                                onChange={e => updateForm({ transparentBackground: e.target.checked })}
                            />
                            <span>Transparent background</span>
                        </label>
                    )}

                    <FormField label="Frame Rate">
                        <div className="flex gap-2 items-center">
                            <select
                                value={form.fpsMode}
                                onChange={e => updateForm({ fpsMode: e.target.value as FpsMode })}
                                className={`${inputCls} flex-1`}
                            >
                                <option value="24">24 fps</option>
                                <option value="30">30 fps</option>
                                <option value="60">60 fps</option>
                                <option value="custom">Custom…</option>
                            </select>
                            {form.fpsMode === 'custom' && (
                                <input
                                    type="number"
                                    min={1}
                                    max={240}
                                    value={form.customFps}
                                    onChange={e => updateForm({ customFps: Math.max(1, Number(e.target.value) || 1) })}
                                    className={`w-20 ${inputCls}`}
                                />
                            )}
                        </div>
                    </FormField>

                    <FormField label="Export Range">
                        <select
                            value={form.fullDuration ? 'full' : 'range'}
                            onChange={e => updateForm({ fullDuration: e.target.value === 'full' })}
                            className={inputCls}
                        >
                            <option value="full">Full</option>
                            <option value="range">Range</option>
                        </select>
                    </FormField>

                    {!form.fullDuration && (
                        <>
                            <FormField label="Start (s)">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.startTime}
                                    onChange={e => updateForm({ startTime: Number(e.target.value) || 0 })}
                                    className={inputCls}
                                />
                            </FormField>
                            <FormField label="End (s)">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.endTime}
                                    onChange={e => updateForm({ endTime: Number(e.target.value) || 0 })}
                                    className={inputCls}
                                />
                            </FormField>
                        </>
                    )}

                    {form.format === 'video' && (
                        <>
                            <FormField label="Video Codec">
                                <select
                                    disabled={!capLoaded}
                                    value={form.videoCodec}
                                    onChange={e => handleVideoCodecSelect(e.target.value)}
                                    className={inputCls}
                                >
                                    {videoCodecs.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </FormField>

                            <FormField label="Video Bitrate">
                                <select
                                    value={form.videoBitrateSetting}
                                    onChange={e => updateForm({ videoBitrateSetting: e.target.value as VideoBitrateSetting })}
                                    className={inputCls}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </FormField>

                            {isManualVideoBitrate ? (
                                <FormField label="Manual Bitrate">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={500000}
                                            step={100000}
                                            value={form.videoBitrate}
                                            onChange={e => updateForm({ videoBitrate: Number(e.target.value) || 0 })}
                                            className={`${inputCls} flex-1`}
                                        />
                                        <span className="text-[10px] opacity-60">bps</span>
                                    </div>
                                </FormField>
                            ) : (
                                <FormField label="Estimated Bitrate">
                                    <div className="text-xs opacity-80 h-[32px] flex items-center">
                                        {autoBitrateEstimate
                                            ? `${Math.round(autoBitrateEstimate / 1_000_000 * 10) / 10} Mbps (${form.videoBitrateSetting})`
                                            : 'Computing…'}
                                    </div>
                                </FormField>
                            )}

                            <label className="flex items-center gap-2 col-span-2 mt-1 select-none">
                                <input
                                    type="checkbox"
                                    checked={form.includeAudio}
                                    onChange={e => updateForm({ includeAudio: e.target.checked })}
                                />
                                <span>Include Audio</span>
                            </label>

                            {form.includeAudio && (
                                <>
                                    <FormField label="Audio Codec">
                                        <select
                                            disabled={!capLoaded}
                                            value={form.audioCodec}
                                            onChange={e => handleAudioCodecSelect(e.target.value)}
                                            className={inputCls}
                                        >
                                            {audioCodecs.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </FormField>

                                    <FormField label="Audio Bitrate" hint="bps (typical music 128k–320k)">
                                        <input
                                            type="number"
                                            min={64000}
                                            max={512000}
                                            step={16000}
                                            value={form.audioBitrate}
                                            onChange={e => updateForm({ audioBitrate: Number(e.target.value) || 0 })}
                                            className={inputCls}
                                        />
                                    </FormField>

                                    <FormField label="Sample Rate">
                                        <select
                                            value={form.audioSampleRate}
                                            onChange={e => updateForm({
                                                audioSampleRate: e.target.value === 'auto'
                                                    ? 'auto'
                                                    : (Number(e.target.value) as 44100 | 48000),
                                            })}
                                            className={inputCls}
                                        >
                                            <option value="auto">Auto</option>
                                            <option value={44100}>44.1 kHz</option>
                                            <option value={48000}>48 kHz</option>
                                        </select>
                                    </FormField>

                                    <FormField label="Channels">
                                        <select
                                            value={form.audioChannels}
                                            onChange={e => updateForm({ audioChannels: Number(e.target.value) === 1 ? 1 : 2 })}
                                            className={inputCls}
                                        >
                                            <option value={1}>Mono</option>
                                            <option value={2}>Stereo</option>
                                        </select>
                                    </FormField>

                                    <label className="flex items-center gap-2 col-span-2 select-none">
                                        <input type="checkbox" checked={form.exportAudioMaster} onChange={e => updateForm({ exportAudioMaster: e.target.checked })} />
                                        <span>Write mixed WAV master beside video</span>
                                    </label>
                                    {(form.exportAudioMaster || form.exportAudioStems) && (
                                        <>
                                            <FormField label="WAV Bit Depth">
                                                <select value={form.audioWavBitDepth} onChange={e => updateForm({ audioWavBitDepth: Number(e.target.value) as 16 | 24 | 32 })} className={inputCls}>
                                                    <option value={16}>16-bit PCM</option>
                                                    <option value={24}>24-bit PCM</option>
                                                    <option value={32}>32-bit PCM</option>
                                                </select>
                                            </FormField>
                                            <label className="flex items-center gap-2 select-none self-end pb-2">
                                                <input type="checkbox" checked={form.normalizeAudio} onChange={e => updateForm({ normalizeAudio: e.target.checked })} />
                                                <span>Normalize to −1 dBFS</span>
                                            </label>
                                        </>
                                    )}
                                    <label className="flex items-center gap-2 col-span-2 select-none">
                                        <input type="checkbox" checked={form.exportAudioStems} onChange={e => updateForm({ exportAudioStems: e.target.checked })} />
                                        <span>Write one WAV stem per audio track</span>
                                    </label>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* File size estimate */}
                <div className="mt-4 p-3 bg-neutral-900/50 border border-neutral-700 rounded text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Estimated file size:</span>
                        <span className="font-medium text-neutral-200">
                            {fileSizeEstimate ? (
                                <>
                                    {fileSizeEstimate.formatted}
                                    {fileSizeEstimate.confidence !== 'high' && (
                                        <span className="text-neutral-500 text-xs ml-1">
                                            ({fileSizeEstimate.confidence === 'medium' ? 'approx' : 'rough'})
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span className="text-neutral-500">—</span>
                            )}
                        </span>
                    </div>
                    {fileSizeEstimate && (
                        <div className="mt-2 text-xs text-neutral-500">
                            {effectiveDuration > 0 && (
                                <span>Duration: {effectiveDuration.toFixed(1)}s • </span>
                            )}
                            {form.width}×{form.height} @ {effectiveFps} fps
                            {fileSizeEstimate.breakdown.video != null &&
                                fileSizeEstimate.breakdown.audio != null &&
                                form.includeAudio && (
                                    <span className="block mt-1">
                                        Video: ~{Math.round(fileSizeEstimate.breakdown.video / 1024 / 1024)} MB
                                        {' • '}
                                        Audio: ~{Math.round(fileSizeEstimate.breakdown.audio / 1024 / 1024)} MB
                                    </span>
                                )}
                            {form.format === 'png' && fileSizeEstimate.breakdown.frames != null && (
                                <span className="block mt-1">
                                    {Math.ceil(effectiveFps * effectiveDuration)} frames
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {presets.length > 0 && (
                    <details className="mt-3 text-xs">
                        <summary className="cursor-pointer opacity-80">Batch export presets</summary>
                        <div className="mt-2 grid grid-cols-2 gap-1 max-h-28 overflow-auto">
                            {presets.map((preset) => (
                                <label key={preset.id} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={batchPresetIds.includes(preset.id)}
                                        onChange={(event) => setBatchPresetIds((current) => event.target.checked
                                            ? [...current, preset.id]
                                            : current.filter((id) => id !== preset.id))}
                                    />
                                    <span>{preset.name}</span>
                                </label>
                            ))}
                        </div>
                        <button
                            disabled={batchPresetIds.length === 0 || isExporting}
                            onClick={() => void queuePresetBatch()}
                            className="mt-2 px-3 py-1 rounded bg-sky-700 disabled:opacity-40"
                        >Queue selected presets</button>
                    </details>
                )}

                <details className="mt-3 text-xs">
                    <summary className="cursor-pointer opacity-80">Batch export ranges</summary>
                    <div className="mt-2 flex gap-2">
                        <input
                            className={`${inputCls} flex-1`}
                            value={batchRanges}
                            onChange={(event) => setBatchRanges(event.target.value)}
                            placeholder="0-10, 12.5-20"
                        />
                        <button disabled={!batchRanges.trim()} onClick={() => void queueRangeBatch()} className="px-3 rounded bg-sky-700 disabled:opacity-40">
                            Queue ranges
                        </button>
                    </div>
                </details>

                <div className="flex gap-2 justify-end mt-2">
                    <button
                        disabled={isExporting}
                        onClick={onClose}
                        className="px-3 py-1 border rounded text-xs font-medium bg-neutral-700 border-neutral-600 text-neutral-200 hover:bg-neutral-600 hover:text-white disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={isExporting}
                        onClick={beginExport}
                        className="px-4 py-1 rounded text-xs font-semibold bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow hover:opacity-90 disabled:opacity-50"
                    >
                        {isExporting ? 'Starting...' : exportLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RenderModal;

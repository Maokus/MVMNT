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

interface RenderModalProps {
    onClose: () => void;
}

// Simple modal to configure export settings & trigger video export.
const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
    const { exportSettings, exportVideo, exportSequence, setExportSettings, sceneName, exportKind, totalDuration } = useVisualizer();

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

    const exportLabel =
        form.format === 'video'
            ? form.container === 'webm' ? 'Start WebM Render' : 'Start MP4 Render'
            : 'Start PNG Export';

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9700]" role="dialog" aria-modal="true">
            <div className="border rounded-lg w-[560px] max-w-[92vw] p-5 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl relative">
                <h2 className="m-0 text-xl font-semibold mb-2">Render / Export</h2>
                <p className="m-0 mb-4 text-sm opacity-80">Choose output format & advanced settings. Resolution defaults come from Global Properties; you can override FPS here.</p>

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <FormField label="Filename" span2 hint="Do not include extension; it will be added automatically (.mp4, .webm, or .zip).">
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
                            {exportSettings.width}×{exportSettings.height} @ {effectiveFps} fps
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaEllipsisV } from 'react-icons/fa';
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
    const [presets, setPresets] = useState<ExportPreset[]>(() => loadExportPresets());
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [presetMenuOpen, setPresetMenuOpen] = useState(false);
    const presetMenuRef = useRef<HTMLDivElement>(null);

    const applyPreset = useCallback((preset: ExportPreset) => {
        const settings = preset.settings;
        setForm((previous) => ({
            ...previous,
            width: settings.width ?? previous.width,
            height: settings.height ?? previous.height,
            format: settings.format ?? previous.format,
            fpsMode: settings.fps === 24 || settings.fps === 30 || settings.fps === 60 ? String(settings.fps) as FpsMode : settings.fps ? 'custom' : previous.fpsMode,
            customFps: settings.fps ?? previous.customFps,
            fullDuration: settings.fullDuration ?? previous.fullDuration,
            startTime: settings.startTime ?? previous.startTime,
            endTime: settings.endTime ?? previous.endTime,
            includeAudio: settings.includeAudio ?? previous.includeAudio,
            container: settings.transparentBackground ? 'webm' : settings.container === 'webm' ? 'webm' : settings.container === 'mp4' ? 'mp4' : previous.container,
            videoCodec: settings.transparentBackground ? 'vp9' : settings.videoCodec ?? previous.videoCodec,
            videoBitrateSetting: settings.videoBitrateMode === 'manual' ? 'manual' : settings.qualityPreset ?? previous.videoBitrateSetting,
            videoBitrate: settings.videoBitrate ?? previous.videoBitrate,
            audioCodec: settings.transparentBackground ? 'opus' : settings.audioCodec ?? previous.audioCodec,
            audioBitrate: settings.audioBitrate ?? previous.audioBitrate,
            audioSampleRate: settings.audioSampleRate ?? previous.audioSampleRate,
            audioChannels: settings.audioChannels ?? previous.audioChannels,
            transparentBackground: settings.transparentBackground ?? previous.transparentBackground,
            exportManifest: settings.exportManifest ?? previous.exportManifest,
            exportAudioMaster: settings.exportAudioMaster ?? previous.exportAudioMaster,
            exportAudioStems: settings.exportAudioStems ?? previous.exportAudioStems,
            audioWavBitDepth: settings.audioWavBitDepth ?? previous.audioWavBitDepth,
            normalizeAudio: settings.normalizeAudio ?? previous.normalizeAudio,
        }));
    }, []);

    useEffect(() => {
        if (!presetMenuOpen) return;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!presetMenuRef.current?.contains(event.target as Node)) setPresetMenuOpen(false);
        };
        window.addEventListener('mousedown', closeOnOutsideClick);
        return () => window.removeEventListener('mousedown', closeOnOutsideClick);
    }, [presetMenuOpen]);

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

    const handleTransparentBackgroundChange = useCallback((transparentBackground: boolean) => {
        if (!transparentBackground) {
            updateForm({ transparentBackground });
            return;
        }
        setAutoVideoCodec(true);
        setAutoAudioCodec(true);
        updateForm({ transparentBackground, container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' });
    }, [updateForm]);

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
        if (window.mvmntDesktop && !form.outputPath.trim()) {
            alert('Choose an export destination before starting a desktop export.');
            return;
        }
        const baseOverrides: Partial<ExportSettings> = {
            width: form.width,
            height: form.height,
            fullDuration: form.fullDuration,
            startTime: form.startTime,
            endTime: form.endTime,
            includeAudio: form.includeAudio,
            filename: trimmedFilename || undefined,
            outputDirectory: form.outputDirectory.trim() || undefined,
            outputPath: form.outputPath.trim() || undefined,
            fps: effectiveFps,
            videoCodec: form.videoCodec,
            videoBitrateMode: isManualVideoBitrate ? 'manual' : 'auto',
            qualityPreset: resolvedQualityPreset,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
            container: form.container,
            transparentBackground: form.transparentBackground,
            exportManifest: form.exportManifest,
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

    const chooseDestination = async () => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        const extension = form.format === 'video'
            ? (form.transparentBackground || form.container === 'webm' ? '.webm' : '.mp4')
            : undefined;
        const result = await desktop.exports.chooseDestination({
            kind: form.format === 'video' ? 'video' : 'image-sequence',
            suggestedName: form.filename.trim() || sceneName || 'export',
            extension,
        });
        if (result.status === 'selected' && result.outputPath) {
            updateForm({ outputPath: result.outputPath, filename: result.displayName?.replace(/\.[^.]+$/, '') || form.filename });
        } else if (result.status === 'error') {
            alert(result.error || 'Could not choose an export destination.');
        }
    };

    const saveCurrentPreset = () => {
        const name = window.prompt('Preset name');
        if (!name?.trim()) return;
        const preset = saveExportPreset(name, {
            format: form.format,
            width: form.width,
            height: form.height,
            fps: effectiveFps,
            fullDuration: form.fullDuration,
            startTime: form.startTime,
            endTime: form.endTime,
            includeAudio: form.includeAudio,
            container: form.container,
            videoCodec: form.videoCodec,
            videoBitrateMode: isManualVideoBitrate ? 'manual' : 'auto',
            qualityPreset: resolvedQualityPreset,
            videoBitrate: form.videoBitrate,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
            transparentBackground: form.transparentBackground,
            exportManifest: form.exportManifest,
            exportAudioMaster: form.exportAudioMaster,
            exportAudioStems: form.exportAudioStems,
            audioWavBitDepth: form.audioWavBitDepth,
            normalizeAudio: form.normalizeAudio,
        });
        setPresets((current) => [...current, preset]);
        setSelectedPresetId(preset.id);
        setPresetMenuOpen(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9700]" role="dialog" aria-modal="true">
            <div className="border rounded-lg w-[560px] max-w-[92vw] max-h-[90vh] overflow-y-auto p-5 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl relative">
                <h2 className="m-0 text-xl font-semibold mb-2">Render / Export</h2>
                <p className="m-0 mb-4 text-sm opacity-80">Choose output format and settings. Resolution is set in Global Properties.</p>

                <div ref={presetMenuRef} className="absolute top-4 right-4">
                    <button
                        type="button"
                        aria-label="Export presets"
                        aria-haspopup="menu"
                        aria-expanded={presetMenuOpen}
                        title="Export presets"
                        onClick={() => setPresetMenuOpen((open) => !open)}
                        className="flex h-8 w-8 items-center justify-center rounded border border-neutral-600 bg-neutral-700 text-neutral-100 hover:bg-neutral-600"
                    >
                        <FaEllipsisV aria-hidden="true" />
                    </button>
                    {presetMenuOpen && (
                        <div role="menu" aria-label="Export presets" className="absolute right-0 top-10 z-10 w-56 rounded border border-neutral-600 bg-neutral-800 p-1 shadow-xl text-xs">
                            <div className="px-2 py-1.5 text-neutral-400">Presets</div>
                            {presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setSelectedPresetId(preset.id);
                                        applyPreset(preset);
                                        setPresetMenuOpen(false);
                                    }}
                                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-neutral-100 hover:bg-neutral-700"
                                >
                                    <span className="flex-1">{preset.name}</span>
                                    {selectedPresetId === preset.id && <span aria-label="Selected">✓</span>}
                                </button>
                            ))}
                            <div className="my-1 border-t border-neutral-600" />
                            <button type="button" role="menuitem" onClick={saveCurrentPreset} className="w-full rounded px-2 py-1.5 text-left text-neutral-100 hover:bg-neutral-700">Save preset</button>
                            <button
                                type="button"
                                role="menuitem"
                                disabled={!selectedPresetId || presets.find((item) => item.id === selectedPresetId)?.builtin}
                                onClick={() => {
                                    deleteExportPreset(selectedPresetId);
                                    setPresets(loadExportPresets());
                                    setSelectedPresetId('');
                                    setPresetMenuOpen(false);
                                }}
                                className="w-full rounded px-2 py-1.5 text-left text-red-300 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Delete preset
                            </button>
                        </div>
                    )}
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

                    <FormField label="Export destination" span2 hint={window.mvmntDesktop ? 'Choose the filename and location with the native file picker.' : 'Your browser will choose the download location.'}>
                        {window.mvmntDesktop ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    placeholder="No destination selected"
                                    value={form.outputPath}
                                    className={`${inputCls} flex-1 opacity-80`}
                                />
                                <button type="button" className="rounded border border-neutral-600 px-3 text-sm text-neutral-100 hover:bg-neutral-700" onClick={() => void chooseDestination()}>
                                    Choose…
                                </button>
                            </div>
                        ) : null}
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

                    <label className="flex items-center gap-2 col-span-2 select-none">
                        <input
                            type="checkbox"
                            checked={form.transparentBackground}
                            onChange={e => handleTransparentBackgroundChange(e.target.checked)}
                        />
                        <span>Transparent background{form.format === 'video' ? ' (WebM/VP9)' : ''}</span>
                    </label>

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

                <details className="mt-3 text-xs">
                    <summary className="cursor-pointer opacity-80">Advanced settings</summary>
                    <label className="mt-2 flex items-center gap-2 select-none">
                        <input type="checkbox" checked={form.exportManifest} onChange={e => updateForm({ exportManifest: e.target.checked })} />
                        <span>Write export manifest</span>
                    </label>
                </details>

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
                        {isExporting ? 'Starting...' : 'Start export'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RenderModal;

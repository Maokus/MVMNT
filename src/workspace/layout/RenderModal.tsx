import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useVisualizer } from '@context/VisualizerContext';
import type { ExportSettings } from '@context/visualizer/types';
// Capability helpers (mediabunny) – imported dynamically to avoid hard fail if tree-shaken
// We use optional chaining; if unavailable we gracefully degrade.
// @ts-ignore
import { canEncodeVideo, getEncodableVideoCodecs, canEncodeAudio, getEncodableAudioCodecs } from 'mediabunny';
import { ensureMp3EncoderRegistered } from '@export/mp3-encoder-loader';

interface RenderModalProps {
    onClose: () => void;
}

type FpsMode = '24' | '30' | '60' | 'custom';

type VideoFormat = 'png' | 'mp4' | 'webm';

interface FormState {
    format: VideoFormat;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    qualityPreset: 'low' | 'medium' | 'high';
    includeAudio: boolean;
    fpsMode: FpsMode;
    customFps: number;
    videoCodec: string;
    videoBitrateMode: 'auto' | 'manual';
    videoBitrate: number;
    audioCodec: string;
    audioBitrate: number;
    audioSampleRate: 'auto' | 44100 | 48000;
    audioChannels: 1 | 2;
    filename: string;
}

// Simple modal to configure export settings & trigger video export.
const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
    const { exportSettings, exportVideo, exportSequence, setExportSettings, sceneName } = useVisualizer() as any;
    // Local UI state managed via single form object
    const initialFps = exportSettings.fps || 60;
    const initialFpsMode: FpsMode = initialFps === 24 ? '24' : initialFps === 30 ? '30' : initialFps === 60 ? '60' : 'custom';
    const initialFormat: VideoFormat = exportSettings.container === 'webm' ? 'webm' : 'mp4';
    const persistedAudioCodec = exportSettings.audioCodec && exportSettings.audioCodec !== 'aac' ? exportSettings.audioCodec : undefined;
    const [form, setForm] = useState<FormState>(() => ({
        format: initialFormat,
        fullDuration: exportSettings.fullDuration !== false,
        startTime: exportSettings.startTime ?? 0,
        endTime: exportSettings.endTime ?? 0,
        qualityPreset: exportSettings.qualityPreset || 'high',
        includeAudio: exportSettings.includeAudio !== false,
        fpsMode: initialFpsMode,
        customFps: Math.max(1, initialFps || 60),
        videoCodec: exportSettings.videoCodec || (initialFormat === 'webm' ? 'vp9' : 'h264'),
        videoBitrateMode: exportSettings.videoBitrateMode || 'auto',
        videoBitrate: exportSettings.videoBitrate || 0,
        audioCodec: persistedAudioCodec || (initialFormat === 'webm' ? 'opus' : 'pcm-s16'),
        audioBitrate: exportSettings.audioBitrate || 192000,
        audioSampleRate: exportSettings.audioSampleRate || 'auto',
        audioChannels: exportSettings.audioChannels === 1 ? 1 : 2,
        filename: sceneName || '',
    }));
    const updateForm = useCallback((patch: Partial<FormState>) => {
        setForm(prev => ({ ...prev, ...patch }));
    }, []);

    // When sceneName changes and user has not manually customized (empty or previously matched old sceneName), update default.
    useEffect(() => {
        setForm(prev => {
            if (prev.filename && prev.filename !== sceneName) return prev;
            return { ...prev, filename: sceneName || '' };
        });
    }, [sceneName]);
    // Capability lists
    const [videoCodecs, setVideoCodecs] = useState<string[]>([]); // display list (avc shown as h264)
    const [audioCodecs, setAudioCodecs] = useState<string[]>(['pcm-s16', 'mp3']);
    const [capLoaded, setCapLoaded] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [autoVideoCodecSelection, setAutoVideoCodecSelection] = useState(true);
    const [autoAudioCodecSelection, setAutoAudioCodecSelection] = useState(true);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    // Heuristic auto bitrate (bits per pixel per frame * w * h * fps) reused from AV exporter defaults
    function computeHeuristicBitrate(width: number, height: number, fps: number) {
        const BPPPF = 0.09; // visually lossless synthetic graphics baseline
        const MIN = 500_000; const MAX = 80_000_000;
        const est = width * height * fps * BPPPF;
        return Math.round(Math.min(Math.max(est, MIN), MAX));
    }

    // Load supported codecs once
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const vcs = await (getEncodableVideoCodecs?.() || []);
                if (mounted && Array.isArray(vcs)) {
                    // Map internal 'avc' id to user-friendly 'h264'
                    const mapped = vcs.map(c => (c === 'avc' ? 'h264' : c));
                    if (!mapped.includes('h264') && vcs.includes('avc')) mapped.unshift('h264');
                    setVideoCodecs(mapped);
                }
            } catch { /* ignore */ }
            try {
                const acs = await (getEncodableAudioCodecs?.() || []);
                if (mounted) {
                    const normalizeCodec = (codec: unknown) => {
                        if (typeof codec !== 'string') return null;
                        const id = codec.toLowerCase();
                        if (id === 'mp4a.40.2' || id === 'audio/aac' || id === 'aac-lc' || id === 'aac') return null;
                        return codec;
                    };
                    const preferOrder = ['pcm-s16', 'mp3', 'opus', 'vorbis', 'flac'];
                    const discovered = Array.isArray(acs)
                        ? acs.map(normalizeCodec).filter((c): c is string => Boolean(c))
                        : [];
                    const merged = Array.from(new Set(['pcm-s16', 'mp3', ...discovered]));
                    const ordered = [
                        ...preferOrder.filter((c) => merged.includes(c)),
                        ...merged.filter((c) => !preferOrder.includes(c)),
                    ];
                    setAudioCodecs(ordered);
                }
            } catch {
                if (mounted) setAudioCodecs(['pcm-s16', 'mp3']);
            }
            if (mounted) setCapLoaded(true);
        })();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (!audioCodecs.length) return;
        const currentAvailable = audioCodecs.includes(form.audioCodec);
        if (!currentAvailable) {
            setAutoAudioCodecSelection(true);
        }
        if (!autoAudioCodecSelection && currentAvailable) return;
        const priority = form.format === 'webm'
            ? ['opus', 'vorbis', 'flac', 'pcm-s16', 'mp3']
            : ['pcm-s16', 'mp3', 'opus', 'vorbis', 'flac'];
        const preferred = priority.find((c) => audioCodecs.includes(c)) || audioCodecs[0];
        if (preferred && preferred !== form.audioCodec) {
            updateForm({ audioCodec: preferred });
        }
    }, [audioCodecs, autoAudioCodecSelection, form.audioCodec, form.format, updateForm]);

    useEffect(() => {
        if (!videoCodecs.length) return;
        const currentAvailable = videoCodecs.includes(form.videoCodec);
        if (!currentAvailable) {
            setAutoVideoCodecSelection(true);
        }
        if (!autoVideoCodecSelection && currentAvailable) return;
        const mp4Priority = ['h264', 'avc', 'hevc', 'av1', 'vp9'];
        const webmPriority = ['vp9', 'av1', 'h264', 'avc'];
        const priority = form.format === 'webm' ? webmPriority : mp4Priority;
        const preferred = priority.find((c) => videoCodecs.includes(c)) || videoCodecs[0];
        if (preferred && preferred !== form.videoCodec) {
            updateForm({ videoCodec: preferred });
        }
    }, [autoVideoCodecSelection, videoCodecs, form.videoCodec, form.format, updateForm]);
    const handleVideoCodecSelect = useCallback((codec: string) => {
        setAutoVideoCodecSelection(false);
        updateForm({ videoCodec: codec });
    }, [updateForm]);

    const handleAudioCodecSelect = useCallback((codec: string) => {
        setAutoAudioCodecSelection(false);
        updateForm({ audioCodec: codec });
    }, [updateForm]);

    // Prefetch MP3 encoder chunk when user selects mp3 to reduce latency at export time.
    useEffect(() => {
        if (form.audioCodec === 'mp3') {
            ensureMp3EncoderRegistered();
        }
    }, [form.audioCodec]);

    // Recompute auto bitrate estimate when deps change or on mount
    const effectiveFps = useMemo(() => (form.fpsMode === 'custom' ? Math.max(1, form.customFps || 1) : Number(form.fpsMode)), [form.customFps, form.fpsMode]);
    const autoBitrateEstimate = useMemo(() => {
        const w = exportSettings.width; const h = exportSettings.height;
        if (!w || !h || !effectiveFps) return null;
        return computeHeuristicBitrate(w, h, effectiveFps);
    }, [effectiveFps, exportSettings.height, exportSettings.width]);

    const beginExport = async () => {
        const effectiveContainer: 'mp4' | 'webm' = form.format === 'webm' ? 'webm' : 'mp4';
        const trimmedFilename = form.filename.trim();
        const filename = trimmedFilename ? trimmedFilename : undefined;
        const manualVideoBitrate = form.videoBitrateMode === 'manual' ? form.videoBitrate : undefined;
        const baseOverrides: Partial<ExportSettings> = {
            fullDuration: form.fullDuration,
            startTime: form.startTime,
            endTime: form.endTime,
            includeAudio: form.includeAudio,
            filename,
            fps: effectiveFps,
            videoCodec: form.videoCodec,
            videoBitrateMode: form.videoBitrateMode,
            qualityPreset: form.qualityPreset,
            audioCodec: form.audioCodec,
            audioBitrate: form.audioBitrate,
            audioSampleRate: form.audioSampleRate,
            audioChannels: form.audioChannels,
        };

        // Persist duration/range flags globally so future exports use them
        setExportSettings((prev: ExportSettings) => ({
            ...prev,
            ...baseOverrides,
            container: form.format === 'png' ? prev.container : effectiveContainer,
            videoBitrate: manualVideoBitrate ?? prev.videoBitrate,
        }));

        const exportOverrides: Partial<ExportSettings> = {
            ...baseOverrides,
            container: form.format === 'png' ? exportSettings.container : effectiveContainer,
        };
        if (manualVideoBitrate != null) {
            exportOverrides.videoBitrate = manualVideoBitrate;
        }

        setIsExporting(true);
        try {
            if (form.format === 'png') {
                await exportSequence(exportOverrides);
            } else {
                await exportVideo(exportOverrides);
            }
            onClose();
        } catch (e) {
            // surfaced upstream
        } finally {
            setIsExporting(false);
        }
    };

    const resolveDefaultVideoCodec = useCallback((format: VideoFormat) => {
        const priority = format === 'webm' ? ['vp9', 'av1', 'h264', 'avc'] : ['h264', 'avc', 'hevc', 'av1', 'vp9'];
        return priority.find((c) => videoCodecs.includes(c)) || priority[0];
    }, [videoCodecs]);

    const resolveDefaultAudioCodec = useCallback((format: VideoFormat) => {
        const priority = format === 'webm'
            ? ['opus', 'vorbis', 'flac', 'pcm-s16', 'mp3']
            : ['pcm-s16', 'mp3', 'opus', 'vorbis', 'flac'];
        return priority.find((c) => audioCodecs.includes(c)) || priority[0];
    }, [audioCodecs]);

    const handleFormatChange = useCallback((nextFormat: VideoFormat) => {
        setForm((prev) => {
            if (prev.format === nextFormat) return prev;
            const next: FormState = { ...prev, format: nextFormat };
            setAutoVideoCodecSelection(true);
            setAutoAudioCodecSelection(true);
            if (nextFormat === 'png') return next;
            const nextVideoCodec = resolveDefaultVideoCodec(nextFormat);
            const nextAudioCodec = resolveDefaultAudioCodec(nextFormat);
            return {
                ...next,
                videoCodec: nextVideoCodec,
                audioCodec: nextAudioCodec,
            };
        });
    }, [resolveDefaultAudioCodec, resolveDefaultVideoCodec]);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9700]" role="dialog" aria-modal="true">
            <div className="border rounded-lg w-[560px] max-w-[92vw] p-5 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl relative">
                <h2 className="m-0 text-xl font-semibold mb-2">Render / Export</h2>
                <p className="m-0 mb-4 text-sm opacity-80">Choose output format & advanced settings. Resolution defaults come from Global Properties; you can override FPS here.</p>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <label className="flex flex-col gap-1 col-span-2">Filename
                        <input
                            type="text"
                            placeholder={sceneName || 'filename'}
                            value={form.filename}
                            onChange={e => updateForm({ filename: e.target.value })}
                            className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                        />
                        <span className="text-[10px] opacity-60">Do not include extension; it will be added automatically (.mp4 or .zip).</span>
                    </label>
                    <label className="flex flex-col gap-1">Format
                        <select value={form.format} onChange={e => handleFormatChange(e.target.value as FormState['format'])} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="mp4">MP4 Video</option>
                            <option value="webm">WebM Video</option>
                            <option value="png">PNG Sequence</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">Frame Rate
                        <div className="flex gap-2 items-center">
                            <select value={form.fpsMode} onChange={e => updateForm({ fpsMode: e.target.value as FpsMode })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm flex-1">
                                <option value="24">24 fps</option>
                                <option value="30">30 fps</option>
                                <option value="60">60 fps</option>
                                <option value="custom">Custom…</option>
                            </select>
                            {form.fpsMode === 'custom' && (
                                <input type="number" min={1} max={240} value={form.customFps} onChange={e => updateForm({ customFps: Math.max(1, Number(e.target.value) || 1) })} className="w-20 bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            )}
                        </div>
                    </label>
                    <label className="flex flex-col gap-1">Export Range
                        <select value={form.fullDuration ? 'full' : 'range'} onChange={e => updateForm({ fullDuration: e.target.value === 'full' })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="full">Full</option>
                            <option value="range">Range</option>
                        </select>
                    </label>
                    {!form.fullDuration && (
                        <>
                            <label className="flex flex-col gap-1">Start (s)
                                <input type="number" min={0} value={form.startTime} onChange={e => updateForm({ startTime: Number(e.target.value) || 0 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                            <label className="flex flex-col gap-1">End (s)
                                <input type="number" min={0} value={form.endTime} onChange={e => updateForm({ endTime: Number(e.target.value) || 0 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                        </>
                    )}
                    {form.format !== 'png' && (
                        <>
                            <label className="flex flex-col gap-1">Video Codec
                                <select disabled={!capLoaded} value={form.videoCodec} onChange={e => handleVideoCodecSelect(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    {videoCodecs.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </label>
                            {form.videoBitrateMode === 'auto' && (
                                <label className="flex flex-col gap-1">Quality Preset
                                    <select value={form.qualityPreset} onChange={e => updateForm({ qualityPreset: e.target.value as FormState['qualityPreset'] })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </label>
                            )}
                            <label className="flex flex-col gap-1">Video Bitrate Mode
                                <select value={form.videoBitrateMode} onChange={e => updateForm({ videoBitrateMode: e.target.value as FormState['videoBitrateMode'] })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    <option value="auto">Auto</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </label>
                            {form.videoBitrateMode === 'manual' ? (
                                <label className="flex flex-col gap-1">Video Bitrate
                                    <div className="flex items-center gap-2">
                                        <input type="number" min={500000} step={100000} value={form.videoBitrate} onChange={e => updateForm({ videoBitrate: Number(e.target.value) || 0 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm flex-1" />
                                        <span className="text-[10px] opacity-60">bps</span>
                                    </div>
                                </label>
                            ) : (
                                <label className="flex flex-col gap-1">Auto Bitrate
                                    <div className="text-xs opacity-80 h-[32px] flex items-center">{autoBitrateEstimate ? `${Math.round(autoBitrateEstimate / 1_000_000 * 10) / 10} Mbps (est)` : 'Computing…'}</div>
                                </label>
                            )}
                            <label className="flex items-center gap-2 col-span-2 mt-1 select-none">
                                <input type="checkbox" checked={form.includeAudio} onChange={e => updateForm({ includeAudio: e.target.checked })} />
                                <span>Include Audio</span>
                            </label>
                            {form.includeAudio && (
                                <>
                                    <label className="flex flex-col gap-1">Audio Codec
                                        <select disabled={!capLoaded} value={form.audioCodec} onChange={e => handleAudioCodecSelect(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                            {audioCodecs.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-1">Audio Bitrate
                                        <input type="number" min={64000} max={512000} step={16000} value={form.audioBitrate} onChange={e => updateForm({ audioBitrate: Number(e.target.value) || 0 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                                        <span className="text-[10px] opacity-60">bps (typical music 128k–320k)</span>
                                    </label>
                                    <label className="flex flex-col gap-1">Sample Rate
                                        <select value={form.audioSampleRate} onChange={e => updateForm({ audioSampleRate: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 44100 | 48000) })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                            <option value="auto">Auto</option>
                                            <option value={44100}>44.1 kHz</option>
                                            <option value={48000}>48 kHz</option>
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-1">Channels
                                        <select value={form.audioChannels} onChange={e => updateForm({ audioChannels: Number(e.target.value) === 1 ? 1 : 2 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                            <option value={1}>Mono</option>
                                            <option value={2}>Stereo</option>
                                        </select>
                                    </label>
                                </>
                            )}
                        </>
                    )}
                </div>
                <div className="flex gap-2 justify-end mt-2">
                    <button disabled={isExporting} onClick={onClose} className="px-3 py-1 border rounded text-xs font-medium bg-neutral-700 border-neutral-600 text-neutral-200 hover:bg-neutral-600 hover:text-white disabled:opacity-50">Cancel</button>
                    <button disabled={isExporting} onClick={beginExport} className="px-4 py-1 rounded text-xs font-semibold bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow hover:opacity-90 disabled:opacity-50">{isExporting ? 'Starting...' : (form.format === 'mp4' ? 'Start MP4 Render' : form.format === 'webm' ? 'Start WebM Render' : 'Start PNG Export')}</button>
                </div>
            </div>
        </div>
    );
};

export default RenderModal;

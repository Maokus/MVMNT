import React, { useEffect, useState } from 'react';
import { useVisualizer } from '@context/VisualizerContext';
// Capability helpers (mediabunny) – imported dynamically to avoid hard fail if tree-shaken
// We use optional chaining; if unavailable we gracefully degrade.
// @ts-ignore
import { canEncodeVideo, getEncodableVideoCodecs, canEncodeAudio, getEncodableAudioCodecs } from 'mediabunny';

interface RenderModalProps {
    onClose: () => void;
}

// Simple modal to configure export settings & trigger video export.
const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
    const { exportSettings, exportVideo, exportSequence, setExportSettings, sceneName } = useVisualizer() as any;
    // Local UI state: format selection & optional overrides (currently only range + video params)
    const [format, setFormat] = useState<'png' | 'mp4'>('mp4');
    const [rangeMode, setRangeMode] = useState(exportSettings.fullDuration);
    const [startTime, setStartTime] = useState<number>(exportSettings.startTime || 0);
    const [endTime, setEndTime] = useState<number>(exportSettings.endTime || 0);
    const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('high'); // legacy preset (used when videoBitrateMode = auto && no manual override)
    const [bitrate, setBitrate] = useState<number | ''>(''); // legacy custom bitrate (bps)
    const [includeAudio, setIncludeAudio] = useState<boolean>(exportSettings.includeAudio !== false); // default true
    // New UI state
    const [fpsMode, setFpsMode] = useState<'24' | '30' | '60' | 'custom'>(exportSettings.fps === 24 ? '24' : exportSettings.fps === 30 ? '30' : exportSettings.fps === 60 ? '60' : 'custom');
    const [customFps, setCustomFps] = useState<number>(exportSettings.fps);
    const [container, setContainer] = useState<'auto' | 'mp4' | 'webm'>(exportSettings.container || 'auto');
    const [videoCodec, setVideoCodec] = useState<string>(exportSettings.videoCodec || 'auto');
    const [videoBitrateMode, setVideoBitrateMode] = useState<'auto' | 'manual'>(exportSettings.videoBitrateMode || 'auto');
    const [videoBitrate, setVideoBitrate] = useState<number>(exportSettings.videoBitrate || 0);
    const [autoBitrateEstimate, setAutoBitrateEstimate] = useState<number | null>(null);
    // Audio advanced
    const [audioCodec, setAudioCodec] = useState<string>(exportSettings.audioCodec || 'auto');
    const [audioBitrate, setAudioBitrate] = useState<number>(exportSettings.audioBitrate || 192000);
    const [audioSampleRate, setAudioSampleRate] = useState<'auto' | 44100 | 48000>(exportSettings.audioSampleRate || 'auto');
    const [audioChannels, setAudioChannels] = useState<1 | 2>(exportSettings.audioChannels || 2);
    // Filename should default to the current scene name each time the modal opens (user request)
    // We intentionally ignore any persisted exportSettings.filename so user always sees scene name first.
    const [filename, setFilename] = useState<string>(sceneName || '');

    // When sceneName changes and user has not manually customized (empty or previously matched old sceneName), update default.
    useEffect(() => {
        setFilename(prev => {
            // If user already typed a custom (non-empty, non-scene) value this session, keep it.
            if (prev && prev !== sceneName) return prev;
            return sceneName || '';
        });
    }, [sceneName]);
    // Capability lists
    const [videoCodecs, setVideoCodecs] = useState<string[]>([]);
    const [audioCodecs, setAudioCodecs] = useState<string[]>([]);
    const [capLoaded, setCapLoaded] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

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
                if (mounted && Array.isArray(vcs)) setVideoCodecs(vcs);
            } catch { /* ignore */ }
            try {
                const acs = await (getEncodableAudioCodecs?.() || []);
                if (mounted && Array.isArray(acs)) setAudioCodecs(acs);
            } catch { /* ignore */ }
            if (mounted) setCapLoaded(true);
        })();
        return () => { mounted = false; };
    }, []);

    // Recompute auto bitrate estimate when deps change or on mount
    useEffect(() => {
        const w = exportSettings.width; const h = exportSettings.height; const f = fpsMode === 'custom' ? customFps : Number(fpsMode);
        if (w && h && f) setAutoBitrateEstimate(computeHeuristicBitrate(w, h, f));
    }, [exportSettings.width, exportSettings.height, fpsMode, customFps]);

    const effectiveFps = fpsMode === 'custom' ? customFps : Number(fpsMode);

    const beginExport = async () => {
        // Persist duration/range flags globally so future exports use them
        setExportSettings((prev: any) => ({
            ...prev,
            fullDuration: rangeMode,
            startTime,
            endTime,
            includeAudio,
            filename: filename.trim() || undefined,
            fps: effectiveFps,
            container,
            videoCodec,
            videoBitrateMode,
            videoBitrate: videoBitrateMode === 'manual' ? videoBitrate : undefined,
            audioCodec,
            audioBitrate,
            audioSampleRate,
            audioChannels,
        }));
        setIsExporting(true);
        try {
            if (format === 'png') {
                await exportSequence({ fullDuration: rangeMode, startTime, endTime, filename: filename.trim() || undefined });
            } else {
                await exportVideo({
                    fullDuration: rangeMode,
                    startTime,
                    endTime,
                    filename: filename.trim() || undefined,
                    bitrate: bitrate === '' ? undefined : bitrate, // legacy path
                    qualityPreset,
                    includeAudio,
                    fps: effectiveFps,
                    container,
                    videoCodec,
                    videoBitrateMode,
                    videoBitrate: videoBitrateMode === 'manual' ? videoBitrate : undefined,
                    audioCodec,
                    audioBitrate,
                    audioSampleRate,
                    audioChannels,
                });
            }
            onClose();
        } catch (e) {
            // surfaced upstream
        } finally {
            setIsExporting(false);
        }
    };

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
                            value={filename}
                            onChange={e => setFilename(e.target.value)}
                            className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                        />
                        <span className="text-[10px] opacity-60">Do not include extension; it will be added automatically (.mp4 or .zip).</span>
                    </label>
                    <label className="flex flex-col gap-1">Format
                        <select value={format} onChange={e => setFormat(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="mp4">MP4 Video</option>
                            <option value="png">PNG Sequence</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">Frame Rate
                        <div className="flex gap-2 items-center">
                            <select value={fpsMode} onChange={e => setFpsMode(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm flex-1">
                                <option value="24">24 fps</option>
                                <option value="30">30 fps</option>
                                <option value="60">60 fps</option>
                                <option value="custom">Custom…</option>
                            </select>
                            {fpsMode === 'custom' && (
                                <input type="number" min={1} max={240} value={customFps} onChange={e => setCustomFps(Math.max(1, Number(e.target.value) || 1))} className="w-20 bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            )}
                        </div>
                    </label>
                    <label className="flex flex-col gap-1">Export Range
                        <select value={rangeMode ? 'full' : 'range'} onChange={e => setRangeMode(e.target.value === 'full')} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="full">Full</option>
                            <option value="range">Range</option>
                        </select>
                    </label>
                    {!rangeMode && (
                        <>
                            <label className="flex flex-col gap-1">Start (s)
                                <input type="number" min={0} value={startTime} onChange={e => setStartTime(Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                            <label className="flex flex-col gap-1">End (s)
                                <input type="number" min={0} value={endTime} onChange={e => setEndTime(Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                        </>
                    )}
                    {format === 'mp4' && (
                        <>
                            <label className="flex flex-col gap-1">Container
                                <select value={container} onChange={e => setContainer(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    <option value="auto">Auto (Recommended)</option>
                                    <option value="mp4">MP4</option>
                                    <option value="webm">WebM</option>
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">Video Codec
                                <select disabled={!capLoaded} value={videoCodec} onChange={e => setVideoCodec(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    <option value="auto">Auto</option>
                                    {videoCodecs.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <span className="text-[10px] opacity-60">Filtered by container capability.</span>
                            </label>
                            <label className="flex flex-col gap-1">Quality Preset
                                <select value={qualityPreset} onChange={e => setQualityPreset(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">Video Bitrate Mode
                                <select value={videoBitrateMode} onChange={e => setVideoBitrateMode(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    <option value="auto">Auto</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </label>
                            {videoBitrateMode === 'manual' ? (
                                <label className="flex flex-col gap-1">Video Bitrate
                                    <div className="flex items-center gap-2">
                                        <input type="number" min={500000} step={100000} value={videoBitrate} onChange={e => setVideoBitrate(Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm flex-1" />
                                        <span className="text-[10px] opacity-60">bps</span>
                                    </div>
                                </label>
                            ) : (
                                <label className="flex flex-col gap-1">Auto Bitrate
                                    <div className="text-xs opacity-80 h-[32px] flex items-center">{autoBitrateEstimate ? `${Math.round(autoBitrateEstimate / 1_000_000 * 10) / 10} Mbps (est)` : 'Computing…'}</div>
                                </label>
                            )}
                            <label className="flex items-center gap-2 col-span-2 mt-1 select-none">
                                <input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)} />
                                <span>Include Audio</span>
                            </label>
                            {includeAudio && (
                                <>
                                    <label className="flex flex-col gap-1">Audio Codec
                                        <select disabled={!capLoaded} value={audioCodec} onChange={e => setAudioCodec(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                            <option value="auto">Auto</option>
                                            {audioCodecs.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-1">Audio Bitrate
                                        <input type="number" min={64000} max={512000} step={16000} value={audioBitrate} onChange={e => setAudioBitrate(Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                                        <span className="text-[10px] opacity-60">bps (typical music 128k–320k)</span>
                                    </label>
                                    <label className="flex flex-col gap-1">Sample Rate
                                        <select value={audioSampleRate} onChange={e => setAudioSampleRate(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as any))} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                            <option value="auto">Auto</option>
                                            <option value={44100}>44.1 kHz</option>
                                            <option value={48000}>48 kHz</option>
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-1">Channels
                                        <select value={audioChannels} onChange={e => setAudioChannels(Number(e.target.value) === 1 ? 1 : 2)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
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
                    <button disabled={isExporting} onClick={beginExport} className="px-4 py-1 rounded text-xs font-semibold bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow hover:opacity-90 disabled:opacity-50">{isExporting ? 'Starting...' : (format === 'mp4' ? 'Start Video Render' : 'Start PNG Export')}</button>
                </div>
            </div>
        </div>
    );
};

export default RenderModal;

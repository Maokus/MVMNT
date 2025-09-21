/**
 * ExportService (Facade)
 * -------------------------------------------------
 * High-level orchestrator for all export operations. Rather than letting UI code
 * directly juggle multiple exporter classes (each with its own option surface),
 * this facade offers a single entry point that:
 *  • Chooses the appropriate backend (video-only vs audio+video) based on intent & data availability.
 *  • Normalizes overlapping option names (bitrate, fps, codec overrides, etc.).
 *  • Hides heuristics for when A/V is possible (requires tick range) vs when to fallback to video-only.
 *  • Centralizes future branching for additional formats (image sequence, GIF, audio-only, JSON metadata dumps, etc.).
 *
 * Usage Pattern (simplest):
 *  const service = new ExportService(canvas, visualizer);
 *  await service.export({ includeAudio: true, startTick, endTick, sceneName: 'Demo' });
 *
 * When `includeAudio` is true AND both `startTick` & `endTick` provided, the service uses `AVExporter`.
 * Otherwise it falls back to `VideoExporter` (video-only). Consumers receive a unified
 * `ExportServiceResult` object with blobs and metadata.
 *
 * Design Notes:
 *  • Does not internally queue multiple requests; caller should check `isBusy()` if needed.
 *  • `suppressDownload` allows UI to manage download UX (save dialogs, naming, user prompts).
 *  • Raw backend option passthrough (`rawVideoOptions`, `rawAVOptions`) is an escape hatch; prefer
 *    unified top-level fields where possible to keep the façade stable.
 */
import { AVExporter, type AVExportOptions, type AVExportResult } from './av-exporter';
import { VideoExporter, type VideoExportOptions } from './video-exporter';

// Unified request describing what the caller wants. Additional backend-specific
// knobs can still be passed through via `rawVideoOptions` / `rawAVOptions` if needed.
export interface ExportServiceRequest {
    mode?: 'auto' | 'video' | 'av'; // 'auto' chooses based on includeAudio + ticks.
    includeAudio?: boolean; // high-level intent; if true we try AV when possible.
    // Either provide ticks explicitly OR rely on visualizer playback range (auto derivation).
    startTick?: number;
    endTick?: number;
    // Generic shared options
    fps?: number;
    width?: number;
    height?: number;
    sceneName?: string;
    // Bitrate / quality knobs normalized here then forwarded.
    videoBitrateMode?: 'auto' | 'manual';
    videoBitrate?: number;
    bitrate?: number; // legacy fallback for video exporter
    qualityPreset?: 'low' | 'medium' | 'high';
    videoCodec?: string;
    container?: 'auto' | 'mp4' | 'webm';
    // Audio controls (only meaningful for A/V path)
    audioCodec?: string;
    audioBitrate?: number;
    audioSampleRate?: 'auto' | 44100 | 48000;
    audioChannels?: 1 | 2;
    deterministicTiming?: boolean;
    // Progress + completion
    onProgress?: (p: number, text?: string) => void;
    onComplete?: (result: ExportServiceResult) => void;
    // Provide raw, backend-specific overrides (advanced / escape hatch)
    rawVideoOptions?: Partial<VideoExportOptions>;
    rawAVOptions?: Partial<AVExportOptions>;
    // When true, service will not trigger automatic downloads; caller receives blobs.
    suppressDownload?: boolean;
}

export interface ExportServiceResult {
    type: 'video' | 'av';
    videoBlob: Blob | null; // always set for video path; may be null if failure.
    audioBlob?: Blob | null; // separate WAV (when provided by AVExporter and not muxed)
    combinedBlob?: Blob; // MP4 with audio (when available)
    reproducibilityHash?: string | null;
    durationSeconds?: number; // A/V duration or video duration
    mixPeak?: number | null; // A/V path peak
    // Additional raw result reference for advanced inspection
    _raw?: any;
}

export class ExportService {
    private canvas: HTMLCanvasElement;
    private visualizer: any;
    private videoExporter: VideoExporter;
    constructor(canvas: HTMLCanvasElement, visualizer: any) {
        this.canvas = canvas;
        this.visualizer = visualizer;
        this.videoExporter = new VideoExporter(canvas, visualizer);
    }

    isBusy(): boolean {
        return this.videoExporter.isBusy(); // AVExporter created ad-hoc per export
    }

    async export(req: ExportServiceRequest): Promise<ExportServiceResult> {
        const {
            mode = 'auto',
            includeAudio = false,
            startTick,
            endTick,
            fps,
            width,
            height,
            sceneName,
            videoBitrateMode,
            videoBitrate,
            bitrate,
            qualityPreset,
            videoCodec,
            container,
            audioCodec,
            audioBitrate,
            audioSampleRate,
            audioChannels,
            deterministicTiming,
            onProgress = () => {},
            onComplete = () => {},
            rawVideoOptions = {},
            rawAVOptions = {},
            suppressDownload = true,
        } = req;

        // Decide path
        const wantsAV = mode === 'av' || (mode === 'auto' && includeAudio);
        const haveTicks = typeof startTick === 'number' && typeof endTick === 'number';

        if (wantsAV && haveTicks) {
            // A/V path
            const av = new AVExporter(this.canvas, this.visualizer);
            const avOptions: AVExportOptions = {
                startTick: startTick!,
                endTick: endTick!,
                includeAudio: true,
                fps,
                width,
                height,
                sceneName,
                videoBitrateMode,
                videoBitrate,
                bitrate,
                videoCodec,
                container,
                audioCodec,
                audioBitrate,
                audioSampleRate,
                audioChannels,
                deterministicTiming,
                onProgress: (p, t) => onProgress(p, t),
                ...rawAVOptions,
            } as AVExportOptions; // cast allows partial undefined merges
            const result: AVExportResult = await av.export(avOptions);
            const serviceResult: ExportServiceResult = {
                type: 'av',
                videoBlob: result.videoBlob,
                audioBlob: result.audioBlob,
                combinedBlob: result.combinedBlob,
                reproducibilityHash: result.reproducibilityHash,
                mixPeak: result.mixPeak,
                durationSeconds: result.durationSeconds,
                _raw: result,
            };
            onComplete(serviceResult);
            return serviceResult;
        }

        // Video-only path (either explicitly requested or A/V not viable due to missing tick range)
        // Wrap exporter call in a Promise to capture blob deterministically
        let capturedBlob: Blob | null = null;
        const videoOptions: VideoExportOptions = {
            includeAudio: false,
            fps,
            width,
            height,
            sceneName,
            videoBitrateMode,
            videoBitrate,
            bitrate,
            qualityPreset,
            videoCodec,
            container,
            deterministicTiming,
            suppressDownload, // ensure we control download externally
            onProgress: (p, t) => onProgress(p, t),
            onComplete: (blob: Blob) => {
                capturedBlob = blob;
            },
            ...rawVideoOptions,
        } as VideoExportOptions;
        await this.videoExporter.exportVideo(videoOptions);
        const final: ExportServiceResult = { type: 'video', videoBlob: capturedBlob, _raw: capturedBlob };
        onComplete(final);
        return final;
    }
}

declare global {
    interface Window {
        ExportService: typeof ExportService;
    }
}
(window as any).ExportService = ExportService;

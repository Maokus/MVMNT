import type { Target } from 'mediabunny';

export type ExportKind = 'video' | 'png';

export interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    filename?: string;
    outputDirectory?: string;
    outputPath?: string;
    bitrate?: number;
    qualityPreset?: 'low' | 'medium' | 'high';
    includeAudio?: boolean;
    container?: 'auto' | 'mp4' | 'webm';
    videoCodec?: string;
    videoBitrateMode?: 'auto' | 'manual';
    videoBitrate?: number;
    audioCodec?: string;
    audioBitrate?: number;
    audioSampleRate?: 'auto' | 44100 | 48000;
    audioChannels?: 1 | 2;
    transparentBackground?: boolean;
    exportManifest?: boolean;
    exportAudioMaster?: boolean;
    exportAudioStems?: boolean;
    audioWavBitDepth?: 16 | 24 | 32;
    normalizeAudio?: boolean;
}

export interface ExportRequest {
    kind: ExportKind;
    sceneName: string;
    settings: ExportSettings;
    presetName?: string;
}

export interface ResolvedExportPlan extends ExportRequest {
    settings: ExportSettings & {
        container: 'mp4' | 'webm';
        videoCodec: string;
        videoBitrate: number;
        qualityPreset: 'low' | 'medium' | 'high';
        includeAudio: boolean;
        transparentBackground: boolean;
    };
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
    startFrame: number;
    frameCount: number;
    outputName: string;
    extension?: '.mp4' | '.webm';
    estimatedBytes: number;
}

export interface ExportArtifact {
    filename: string;
    blob: Blob;
}

export interface ExportProgress {
    progress: number;
    text: string;
    stage: 'preparing' | 'rendering' | 'encoding' | 'finalizing';
}

export interface ExportPipelineResult {
    frameCount: number;
    durationSeconds: number;
    artifacts: ExportArtifact[];
    reproducibilityHash?: string | null;
    mixPeak?: number | null;
}

export interface ExportRenderAdapter {
    resize(width: number, height: number): void;
    renderAtTime(seconds: number): void;
    prepareFrame(seconds: number, signal?: AbortSignal): Promise<void>;
    beginSimulationExport?(): () => void;
    setTransparentMode?(transparent: boolean): void;
}

export interface ExportEnvironment {
    canvas: HTMLCanvasElement;
    renderer: ExportRenderAdapter;
    prepare(): Promise<void>;
    secondsToTicks(seconds: number): number;
}

export interface ExportOutputSession {
    readonly sessionId: string;
    readonly displayName: string;
    readonly videoTarget?: Target;
    writeFrame(filename: string, blob: Blob): Promise<void>;
    writeArtifact(filename: string, blob: Blob): Promise<void>;
    complete(
        manifest?: Record<string, unknown>,
        expectedFrames?: number
    ): Promise<{
        outputId?: string;
        displayName?: string;
        bytesWritten?: number;
    }>;
    abort(): Promise<void>;
}

export interface ProgressData {
    progress: number;
    text: string;
}

export interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    filename?: string;
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
}

export interface DebugSettings {
    showAnchorPoints: boolean;
    showDevelopmentOverlay: boolean;
}

export interface ProgressData {
    progress: number;
    text: string;
}

export type ExportKind = 'png' | 'video' | null;

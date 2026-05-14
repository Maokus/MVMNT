export type FpsMode = '24' | '30' | '60' | 'custom';
export type ExportFormat = 'video' | 'png';
export type VideoContainer = 'mp4' | 'webm';
export type VideoBitrateSetting = 'low' | 'medium' | 'high' | 'manual';

export interface FormState {
    format: ExportFormat;
    container: VideoContainer;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    includeAudio: boolean;
    fpsMode: FpsMode;
    customFps: number;
    videoCodec: string;
    videoBitrateSetting: VideoBitrateSetting;
    videoBitrate: number;
    audioCodec: string;
    audioBitrate: number;
    audioSampleRate: 'auto' | 44100 | 48000;
    audioChannels: 1 | 2;
    filename: string;
}

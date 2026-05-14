import type { ExportSettings, ExportKind } from '@context/visualizer/types';
import type { FormState, FpsMode, VideoContainer, VideoBitrateSetting } from './types';

export function deriveInitialFormState(
    exportSettings: ExportSettings,
    exportKind: ExportKind,
    sceneName: string,
): FormState {
    const initialFps = exportSettings.fps || 60;
    const initialFpsMode: FpsMode =
        initialFps === 24 ? '24' : initialFps === 30 ? '30' : initialFps === 60 ? '60' : 'custom';
    const initialContainer: VideoContainer = exportSettings.container === 'webm' ? 'webm' : 'mp4';
    const initialFormat = exportKind === 'png' ? 'png' : ('video' as const);
    const persistedAudioCodec =
        exportSettings.audioCodec && exportSettings.audioCodec !== 'aac'
            ? exportSettings.audioCodec
            : undefined;
    const initialQualityPreset = (exportSettings.qualityPreset || 'high') as Exclude<VideoBitrateSetting, 'manual'>;
    const initialVideoBitrateSetting: VideoBitrateSetting =
        exportSettings.videoBitrateMode === 'manual' ? 'manual' : initialQualityPreset;

    return {
        format: initialFormat,
        container: initialContainer,
        fullDuration: exportSettings.fullDuration !== false,
        startTime: exportSettings.startTime ?? 0,
        endTime: exportSettings.endTime ?? 0,
        includeAudio: exportSettings.includeAudio !== false,
        fpsMode: initialFpsMode,
        customFps: Math.max(1, initialFps || 60),
        videoCodec: exportSettings.videoCodec || (initialContainer === 'webm' ? 'vp9' : 'h264'),
        videoBitrateSetting: initialVideoBitrateSetting,
        videoBitrate: exportSettings.videoBitrate || 0,
        audioCodec: persistedAudioCodec || (initialContainer === 'webm' ? 'opus' : 'aac'),
        audioBitrate: exportSettings.audioBitrate || 192000,
        audioSampleRate: exportSettings.audioSampleRate || 'auto',
        audioChannels: exportSettings.audioChannels === 1 ? 1 : 2,
        filename: sceneName || '',
    };
}

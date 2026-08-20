import { calculateAutoBitrate, estimateFileSize } from './file-size-estimator';
import { expandExportFilename } from '../presets';
import type { ExportRequest, ResolvedExportPlan } from '../contracts';

export function resolveExportPlan(
    request: ExportRequest,
    sceneDuration: number,
    sceneStartSeconds = 0
): ResolvedExportPlan {
    const { settings } = request;
    if (!Number.isFinite(sceneDuration) || sceneDuration <= 0) throw new Error('The scene has no exportable duration.');
    if (!Number.isFinite(settings.fps) || settings.fps <= 0) throw new Error('Export frame rate must be positive.');
    if (
        !Number.isFinite(settings.width) ||
        settings.width <= 0 ||
        !Number.isFinite(settings.height) ||
        settings.height <= 0
    )
        throw new Error('Export dimensions must be positive.');

    // startTime/endTime are relative to the scene's playback window (0..sceneDuration);
    // shift by sceneStartSeconds to land on the timeline's absolute time.
    const relativeStart = settings.fullDuration ? 0 : Math.max(0, settings.startTime);
    const relativeEnd = settings.fullDuration ? sceneDuration : Math.min(sceneDuration, settings.endTime);
    const startSeconds = sceneStartSeconds + relativeStart;
    const endSeconds = sceneStartSeconds + relativeEnd;
    if (endSeconds <= startSeconds) throw new Error('Invalid start/end time for export.');

    const transparent = settings.transparentBackground ?? false;
    const container: 'mp4' | 'webm' = transparent || settings.container === 'webm' ? 'webm' : 'mp4';
    const videoCodec = transparent ? 'vp9' : settings.videoCodec || (container === 'webm' ? 'vp9' : 'h264');
    const qualityPreset = settings.qualityPreset ?? 'high';
    const videoBitrate =
        settings.videoBitrate && settings.videoBitrate > 0
            ? settings.videoBitrate
            : settings.bitrate && settings.bitrate > 0
              ? settings.bitrate
              : calculateAutoBitrate(settings.width, settings.height, settings.fps, videoCodec, qualityPreset);
    const durationSeconds = endSeconds - startSeconds;
    const startFrame = Math.floor(startSeconds * settings.fps);
    const frameCount = Math.ceil(durationSeconds * settings.fps);
    const range = settings.fullDuration ? 'full' : `${settings.startTime}-${settings.endTime}s`;
    const outputName = expandExportFilename(settings.filename, {
        scene: request.sceneName,
        preset: request.presetName,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        range,
    });
    const includeAudio = request.kind === 'video' && (settings.includeAudio ?? false);
    const estimatedBytes = estimateFileSize(
        request.kind === 'video'
            ? {
                  format: 'video',
                  width: settings.width,
                  height: settings.height,
                  fps: settings.fps,
                  durationSeconds,
                  videoCodec,
                  videoBitrateMode: 'manual',
                  videoBitrate,
                  qualityPreset,
                  includeAudio,
                  audioCodec: includeAudio ? settings.audioCodec : undefined,
                  audioBitrate: settings.audioBitrate,
                  audioChannels: settings.audioChannels,
                  audioSampleRate: settings.audioSampleRate,
                  container,
              }
            : {
                  format: 'png',
                  width: settings.width,
                  height: settings.height,
                  fps: settings.fps,
                  durationSeconds,
              }
    ).bytes;

    return {
        ...request,
        settings: {
            ...settings,
            container,
            videoCodec,
            videoBitrate,
            qualityPreset,
            includeAudio,
            transparentBackground: transparent,
        },
        startSeconds,
        endSeconds,
        durationSeconds,
        startFrame,
        frameCount,
        outputName,
        extension: request.kind === 'video' ? (container === 'webm' ? '.webm' : '.mp4') : undefined,
        estimatedBytes,
    };
}

import { useMemo } from 'react';
import { calculateAutoBitrate, estimateFileSize } from '@export/fileSizeEstimator';
import type { EstimationParams, FileSizeEstimate } from '@export/fileSizeEstimator';
import type { ExportSettings } from '@context/visualizer/types';
import type { FormState, VideoBitrateSetting } from './types';

export interface ExportEstimates {
    effectiveFps: number;
    isManualVideoBitrate: boolean;
    resolvedQualityPreset: Exclude<VideoBitrateSetting, 'manual'>;
    autoBitrateEstimate: number | null;
    resolvedVideoBitrate: number | null;
    effectiveDuration: number;
    fileSizeEstimate: FileSizeEstimate | null;
}

export function useExportEstimates(
    form: FormState,
    exportSettings: ExportSettings,
    totalDuration: number,
): ExportEstimates {
    const effectiveFps = useMemo(
        () => (form.fpsMode === 'custom' ? Math.max(1, form.customFps || 1) : Number(form.fpsMode)),
        [form.fpsMode, form.customFps],
    );

    const isManualVideoBitrate = form.videoBitrateSetting === 'manual';

    const resolvedQualityPreset = (
        isManualVideoBitrate ? 'high' : form.videoBitrateSetting
    ) as Exclude<VideoBitrateSetting, 'manual'>;

    const autoBitrateEstimate = useMemo(() => {
        const { width: w, height: h } = exportSettings;
        if (!w || !h || !effectiveFps) return null;
        const codec = form.videoCodec || (form.container === 'webm' ? 'vp9' : 'h264');
        return calculateAutoBitrate(w, h, effectiveFps, codec, resolvedQualityPreset);
    }, [effectiveFps, exportSettings, form.container, form.videoCodec, resolvedQualityPreset]);

    const resolvedVideoBitrate = useMemo(() => {
        if (isManualVideoBitrate) {
            const manual = Number(form.videoBitrate);
            return Number.isFinite(manual) && manual > 0 ? manual : null;
        }
        return autoBitrateEstimate ?? null;
    }, [autoBitrateEstimate, form.videoBitrate, isManualVideoBitrate]);

    const effectiveDuration = useMemo(() => {
        if (form.fullDuration) return totalDuration > 0 ? totalDuration : 0;
        const start = Math.max(0, form.startTime);
        return Math.max(start, form.endTime) - start;
    }, [form.fullDuration, form.startTime, form.endTime, totalDuration]);

    const fileSizeEstimate = useMemo((): FileSizeEstimate | null => {
        const { width: w, height: h } = exportSettings;
        if (!w || !h || !effectiveFps || effectiveDuration <= 0) return null;

        const baseParams = { width: w, height: h, fps: effectiveFps, durationSeconds: effectiveDuration };

        if (form.format === 'video') {
            const effectiveSampleRate = form.audioSampleRate === 'auto' ? 48000 : form.audioSampleRate;
            const params: EstimationParams = {
                ...baseParams,
                format: 'video',
                videoCodec: form.videoCodec,
                videoBitrateMode: isManualVideoBitrate ? 'manual' : 'auto',
                videoBitrate: isManualVideoBitrate ? form.videoBitrate : undefined,
                qualityPreset: resolvedQualityPreset,
                includeAudio: form.includeAudio,
                audioCodec: form.includeAudio ? form.audioCodec : undefined,
                audioBitrate: form.includeAudio ? form.audioBitrate : undefined,
                audioChannels: form.audioChannels,
                audioSampleRate: effectiveSampleRate,
                container: form.container,
            };
            return estimateFileSize(params);
        }
        return estimateFileSize({ ...baseParams, format: 'png' });
    }, [
        exportSettings,
        effectiveFps,
        effectiveDuration,
        form.format,
        form.videoCodec,
        form.videoBitrateSetting,
        form.videoBitrate,
        form.includeAudio,
        form.audioCodec,
        form.audioBitrate,
        form.audioChannels,
        form.audioSampleRate,
        form.container,
        isManualVideoBitrate,
        resolvedQualityPreset,
    ]);

    return {
        effectiveFps,
        isManualVideoBitrate,
        resolvedQualityPreset,
        autoBitrateEstimate,
        resolvedVideoBitrate,
        effectiveDuration,
        fileSizeEstimate,
    };
}

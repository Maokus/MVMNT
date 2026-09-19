import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { createTimingContext, ticksToSeconds, type TimelineTimingContext } from '@state/timelineTime';
import { getOverviewPeak, waveformDetailCache } from '@audio/waveform/previewPeaks';
import { PreviewCanvas, type PreviewPainter } from './PreviewCanvas';

interface AudioWaveformProps {
    trackId: string;
    sourceId: string;
    clipOffsetTicks: number;
    sourceStartSeconds: number;
    sourceEndSeconds: number;
    sourceDurationSeconds?: number;
    color?: string;
    regionStartTickAbs: number;
    regionEndTickAbs: number;
    visibleStartTickAbs?: number;
    visibleEndTickAbs?: number;
}

export function getWaveformBinAtTimelineTick({
    tick,
    clipStartTick,
    sourceDurationSeconds,
    binCount,
    timing,
    sampleRate,
    sampleStep,
}: {
    tick: number;
    clipStartTick: number;
    sourceDurationSeconds: number;
    binCount: number;
    timing: TimelineTimingContext;
    sampleRate?: number;
    sampleStep?: number;
}): number {
    if (!Number.isFinite(tick) || !Number.isFinite(clipStartTick) || sourceDurationSeconds <= 0 || binCount <= 0)
        return 0;
    const seconds = ticksToSeconds(timing, tick) - ticksToSeconds(timing, clipStartTick);
    const bin =
        sampleRate && sampleStep ? (seconds * sampleRate) / sampleStep : (seconds / sourceDurationSeconds) * binCount;
    return Math.max(0, Math.min(binCount - 1, Math.floor(bin)));
}

const rehydrations = new Map<string, Promise<boolean>>();

export const AudioWaveform = ({
    trackId,
    sourceId,
    clipOffsetTicks,
    sourceStartSeconds,
    sourceEndSeconds,
    color = '#4ADE80',
    regionStartTickAbs,
    regionEndTickAbs,
    visibleStartTickAbs,
    visibleEndTickAbs,
}: AudioWaveformProps) => {
    const cache = useTimelineStore((state) => state.audioCache[sourceId]);
    const globalBpm = useTimelineStore((state) => state.timeline.globalBpm);
    const beatsPerBar = useTimelineStore((state) => state.timeline.beatsPerBar);
    const masterTempoMap = useTimelineStore((state) => state.timeline.masterTempoMap);
    const timing = useMemo(
        () => createTimingContext({ globalBpm, beatsPerBar, masterTempoMap }),
        [globalBpm, beatsPerBar, masterTempoMap]
    );
    const attempted = useRef(false);
    useEffect(() => {
        attempted.current = false;
    }, [sourceId, cache?.originalFile]);
    const visibleStart = Math.max(regionStartTickAbs, visibleStartTickAbs ?? regionStartTickAbs);
    const visibleEnd = Math.min(regionEndTickAbs, visibleEndTickAbs ?? regionEndTickAbs);
    const draw = useCallback<PreviewPainter>(
        (ctx, area) => {
            const { width, height, scale, pixelX, pixelWidth } = area;
            if (!cache || visibleEnd <= visibleStart) return;
            const peaks = cache.waveform?.channelPeaks;
            const step = cache.waveform?.sampleStep ?? Infinity;
            const placementSeconds = ticksToSeconds(timing, clipOffsetTicks);
            const sourceSampleAtPixel = (pixel: number) => {
                const tick = visibleStart + Math.min(1, pixel / scale / width) * (visibleEnd - visibleStart);
                const seconds = ticksToSeconds(timing, tick) - placementSeconds;
                return Math.min(
                    cache.durationSamples,
                    Math.max(0, Math.min(sourceEndSeconds, Math.max(sourceStartSeconds, seconds)) * cache.sampleRate)
                );
            };
            ctx.fillStyle = color;
            const middle = height / 2;
            const amplitudeHeight = Math.max(0, middle - 2);
            let startSample = sourceSampleAtPixel(pixelX);
            for (let pixel = pixelX; pixel < pixelX + pixelWidth; pixel++) {
                const endSample = sourceSampleAtPixel(pixel + 1);
                let amplitude = peaks ? getOverviewPeak(peaks, step, startSample, endSample) : 0;
                if (endSample > startSample && endSample - startSample < step) {
                    if (cache.audioBuffer) {
                        amplitude =
                            waveformDetailCache.read(cache.audioBuffer, startSample, endSample, area) ?? amplitude;
                    } else if (
                        !attempted.current &&
                        cache.decodedState !== 'failed' &&
                        cache.decodedState !== 'decoding'
                    ) {
                        attempted.current = true;
                        if (!rehydrations.has(sourceId)) {
                            const pending = Promise.resolve().then(() => {
                                const state = useTimelineStore.getState();
                                if (
                                    !area.isCurrent() ||
                                    state.audioCache[sourceId]?.originalFile !== cache.originalFile
                                )
                                    return false;
                                return state.rehydrateAudioSource(sourceId);
                            });
                            rehydrations.set(sourceId, pending);
                            const done = () => {
                                if (rehydrations.get(sourceId) === pending) rehydrations.delete(sourceId);
                            };
                            void pending.then(done, done);
                        }
                    }
                }
                const y = Math.min(1, amplitude) * amplitudeHeight;
                if (y > 0) ctx.fillRect(pixel / scale, middle - y, 1 / scale, y * 2);
                startSample = endSample;
            }
            // Silence and unavailable data have a quiet baseline, never a fabricated envelope.
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.fillRect(pixelX / scale, middle, pixelWidth / scale, 1 / scale);
        },
        [
            cache,
            visibleStart,
            visibleEnd,
            timing,
            clipOffsetTicks,
            sourceStartSeconds,
            sourceEndSeconds,
            color,
            sourceId,
        ]
    );
    return <PreviewCanvas draw={draw} trackId={trackId} />;
};

export default AudioWaveform;

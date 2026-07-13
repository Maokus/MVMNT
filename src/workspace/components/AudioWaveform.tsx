import React, { useEffect, useMemo, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { createTimingContext, ticksToSeconds, type TimelineTimingContext } from '@state/timelineTime';

interface AudioWaveformProps {
    trackId: string;
    sourceId?: string;
    clipOffsetTicks?: number;
    regionStartTick?: number;
    regionEndTick?: number;
    /** Preferred media-time trim values for tempo-aware audio clips. */
    sourceStartSeconds?: number;
    sourceEndSeconds?: number;
    sourceDurationSeconds?: number;
    height?: number;
    color?: string;
    background?: string;
    // Absolute tick domain values for the full region (post trimming) and the currently visible slice.
    // When omitted, component falls back to rendering the entire duration (legacy behavior).
    regionStartTickAbs?: number;
    regionEndTickAbs?: number;
    visibleStartTickAbs?: number;
    visibleEndTickAbs?: number;
}

/**
 * Convert a timeline position into a source waveform bin. Horizontal canvas
 * positions are evenly spaced in ticks, while audio advances in seconds; a
 * tempo map therefore requires this conversion for every position.
 */
export function getWaveformBinAtTimelineTick({
    tick,
    clipStartTick,
    sourceDurationSeconds,
    binCount,
    timing,
}: {
    tick: number;
    clipStartTick: number;
    sourceDurationSeconds: number;
    binCount: number;
    timing: TimelineTimingContext;
}): number {
    if (!Number.isFinite(tick) || !Number.isFinite(clipStartTick) || sourceDurationSeconds <= 0 || binCount <= 0) {
        return 0;
    }
    const sourceSeconds = ticksToSeconds(timing, tick) - ticksToSeconds(timing, clipStartTick);
    const sourceFraction = Math.max(0, Math.min(1, sourceSeconds / sourceDurationSeconds));
    return Math.min(binCount - 1, Math.floor(sourceFraction * binCount));
}

// Lightweight canvas waveform renderer using waveform peak data (mono absolute peaks) from audioCache.
// Assumes waveform extracted asynchronously; will re-render when cache changes via subscription.
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
    trackId,
    sourceId,
    clipOffsetTicks,
    regionStartTick: explicitRegionStartTick,
    regionEndTick: explicitRegionEndTick,
    sourceStartSeconds,
    sourceEndSeconds,
    sourceDurationSeconds,
    height = 40,
    color = '#4ADE80',
    background = 'transparent',
    regionStartTickAbs,
    regionEndTickAbs,
    visibleStartTickAbs,
    visibleEndTickAbs,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const {
        peaks,
        offsetTicks,
        durationTicks,
        regionStartTick,
        regionEndTick,
        sourceDurationTicks,
        cacheDurationSeconds,
    } = useTimelineStore((s) => {
        const t: any = s.tracks[trackId];
        if (!t || t.type !== 'audio')
            return {
                peaks: undefined,
                offsetTicks: 0,
                durationTicks: 0,
                regionStartTick: 0,
                regionEndTick: 0,
            sourceDurationTicks: 0,
                cacheDurationSeconds: 0,
            };
        const cacheKey = sourceId || t.audioSourceId || trackId;
        const cache = s.audioCache[cacheKey];
        const startTick = explicitRegionStartTick ?? t.regionStartTick ?? 0;
        const endTick = explicitRegionEndTick ?? t.regionEndTick ?? cache?.durationTicks ?? 0;
        return {
            peaks: cache?.waveform?.channelPeaks,
            offsetTicks: clipOffsetTicks ?? t.offsetTicks,
            durationTicks: endTick - startTick,
            regionStartTick: startTick,
            regionEndTick: endTick,
            sourceDurationTicks: cache?.durationTicks ?? 0,
            cacheDurationSeconds: cache?.durationSeconds ?? 0,
        };
    });
    const selected = useSelectionStore((s) => s.selectedTrackIds.includes(trackId));
    const timing = useTimelineStore((s) => s.timeline);
    const timingContext = useMemo(() => createTimingContext(timing), [timing]);
    const mediaDurationSeconds = sourceDurationSeconds ?? cacheDurationSeconds;
    const hasSourceTimeBounds =
        typeof sourceStartSeconds === 'number' &&
        typeof sourceEndSeconds === 'number' &&
        Number.isFinite(sourceStartSeconds) &&
        Number.isFinite(sourceEndSeconds) &&
        mediaDurationSeconds > 0;

    const fallbackRegionStart = typeof regionStartTick === 'number' ? regionStartTick : 0;
    const fallbackRegionEnd = typeof regionEndTick === 'number' ? regionEndTick : fallbackRegionStart + Math.max(durationTicks, 0);
    const safeOffsetTicks = typeof offsetTicks === 'number' ? offsetTicks : 0;
    const derivedOffsetTicks = typeof regionStartTickAbs === 'number'
        ? regionStartTickAbs - fallbackRegionStart
        : safeOffsetTicks;
    const effectiveOffsetTicks = Number.isFinite(derivedOffsetTicks) ? derivedOffsetTicks : 0;

    const effectiveRegionStart = typeof regionStartTickAbs === 'number'
        ? Math.max(0, regionStartTickAbs - effectiveOffsetTicks)
        : fallbackRegionStart;

    const effectiveRegionEnd = typeof regionEndTickAbs === 'number'
        ? Math.max(effectiveRegionStart, regionEndTickAbs - effectiveOffsetTicks)
        : Math.max(effectiveRegionStart, fallbackRegionEnd);

    const effectiveVisibleStart = typeof visibleStartTickAbs === 'number'
        ? Math.max(effectiveRegionStart, Math.min(visibleStartTickAbs - effectiveOffsetTicks, effectiveRegionEnd))
        : effectiveRegionStart;

    const effectiveVisibleEnd = typeof visibleEndTickAbs === 'number'
        ? Math.max(effectiveVisibleStart, Math.min(visibleEndTickAbs - effectiveOffsetTicks, effectiveRegionEnd))
        : effectiveRegionEnd;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.clientWidth;
        if (w <= 0) return;
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const maxDimension = 16384; // guard against browsers throwing when exceeding internal canvas size
        const scaleX = Math.min(pixelRatio, maxDimension / Math.max(1, w));
        const internalWidth = Math.max(1, Math.floor(w * scaleX));
        const h = height;
        const scaleY = Math.min(pixelRatio, maxDimension / Math.max(1, h));
        const internalHeight = Math.max(1, Math.floor(h * scaleY));
        canvas.width = internalWidth;
        canvas.height = internalHeight;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scaleX, scaleY);

        ctx.clearRect(0, 0, w, h);
        if (background && background !== 'transparent') {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, w, h);
        }
        if (!peaks || peaks.length === 0 || effectiveRegionEnd <= effectiveRegionStart) {
            ctx.fillStyle = '#999';
            ctx.font = '10px sans-serif';
            ctx.fillText('Loading waveform…', 4, h / 2);
            return;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        const mid = h / 2;
        ctx.beginPath();
        const bins = peaks.length;
        // Peak bins are indexed in source media time. Canvas positions are
        // evenly spaced in timeline ticks, so tempo automation must be applied
        // when resolving each position to a media-time peak bin.
        const sourceStartFraction = hasSourceTimeBounds
            ? Math.max(0, Math.min(1, sourceStartSeconds! / mediaDurationSeconds))
            : undefined;
        const sourceEndFraction = hasSourceTimeBounds
            ? Math.max(sourceStartFraction!, Math.min(1, sourceEndSeconds! / mediaDurationSeconds))
            : undefined;
        const totalDurationTicks = Math.max(
            1,
            sourceDurationTicks > 0 ? sourceDurationTicks : Math.max(effectiveRegionEnd, durationTicks + effectiveRegionStart),
        );
        // Clamp visible window inside region
        const visStartClamped = Math.max(effectiveRegionStart, Math.min(effectiveVisibleStart, effectiveRegionEnd));
        const visEndClamped = Math.max(visStartClamped, Math.min(effectiveVisibleEnd, effectiveRegionEnd));
        const startFrac = sourceStartFraction ?? Math.max(0, Math.min(1, visStartClamped / totalDurationTicks));
        const endFrac = sourceEndFraction ?? Math.max(startFrac, Math.min(1, visEndClamped / totalDurationTicks));
        const startBin = Math.max(0, Math.min(bins - 1, Math.floor(startFrac * bins)));
        const endBin = Math.max(startBin + 1, Math.min(bins, Math.floor(endFrac * bins)));
        const sliceBins = endBin - startBin;
        for (let x = 0; x < w; x++) {
            const timelineFraction = x / (w - 1 || 1);
            const t = sliceBins <= 1 ? 0 : timelineFraction;
            const bin = hasSourceTimeBounds
                ? getWaveformBinAtTimelineTick({
                    tick: effectiveOffsetTicks + visStartClamped + timelineFraction * (visEndClamped - visStartClamped),
                    clipStartTick: effectiveOffsetTicks,
                    sourceDurationSeconds: mediaDurationSeconds,
                    binCount: bins,
                    timing: timingContext,
                })
                : Math.min(bins - 1, startBin + Math.floor(t * sliceBins));
            const amp = peaks[bin] || 0;
            const y = amp * (mid - 1);
            ctx.moveTo(x + 0.5, mid - y);
            ctx.lineTo(x + 0.5, mid + y);
        }
        ctx.stroke();

        if (selected) {
            ctx.strokeStyle = '#FBBF24';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, w - 2, h - 2);
        }
    }, [
        peaks,
        height,
        color,
        background,
        selected,
        durationTicks,
        effectiveRegionStart,
        effectiveRegionEnd,
        effectiveVisibleStart,
        effectiveVisibleEnd,
        sourceDurationTicks,
        sourceStartSeconds,
        sourceEndSeconds,
        mediaDurationSeconds,
        hasSourceTimeBounds,
        timingContext,
    ]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} data-track={trackId} />;
};

export default AudioWaveform;

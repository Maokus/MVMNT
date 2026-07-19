import React, { useEffect, useMemo, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { createTimingContext, ticksToSeconds, type TimelineTimingContext } from '@state/timelineTime';

interface AudioWaveformProps {
    trackId: string;
    sourceId: string;
    clipOffsetTicks: number;
    sourceStartSeconds: number;
    sourceEndSeconds: number;
    sourceDurationSeconds?: number;
    height?: number;
    color?: string;
    background?: string;
    regionStartTickAbs: number;
    regionEndTickAbs: number;
    visibleStartTickAbs?: number;
    visibleEndTickAbs?: number;
}

export function getWaveformBinAtTimelineTick({ tick, clipStartTick, sourceDurationSeconds, binCount, timing }: {
    tick: number;
    clipStartTick: number;
    sourceDurationSeconds: number;
    binCount: number;
    timing: TimelineTimingContext;
}): number {
    if (!Number.isFinite(tick) || !Number.isFinite(clipStartTick) || sourceDurationSeconds <= 0 || binCount <= 0) return 0;
    const sourceSeconds = ticksToSeconds(timing, tick) - ticksToSeconds(timing, clipStartTick);
    const sourceFraction = Math.max(0, Math.min(1, sourceSeconds / sourceDurationSeconds));
    return Math.min(binCount - 1, Math.floor(sourceFraction * binCount));
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
    trackId,
    sourceId,
    clipOffsetTicks,
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
    const cache = useTimelineStore((state) => state.audioCache[sourceId]);
    const selected = useSelectionStore((state) => state.selectedTrackIds.includes(trackId));
    const timeline = useTimelineStore((state) => state.timeline);
    const timing = useMemo(() => createTimingContext(timeline), [timeline]);
    const durationSeconds = sourceDurationSeconds ?? cache?.durationSeconds ?? 0;
    const visibleStart = Math.max(regionStartTickAbs, visibleStartTickAbs ?? regionStartTickAbs);
    const visibleEnd = Math.min(regionEndTickAbs, visibleEndTickAbs ?? regionEndTickAbs);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        const width = canvas.clientWidth;
        if (width <= 0) return;
        const ratio = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.max(1, Math.floor(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        if (background !== 'transparent') {
            context.fillStyle = background;
            context.fillRect(0, 0, width, height);
        }
        const peaks = cache?.waveform?.channelPeaks;
        if (!peaks?.length || durationSeconds <= 0 || sourceEndSeconds <= sourceStartSeconds || visibleEnd <= visibleStart) {
            context.fillStyle = '#999';
            context.font = '10px sans-serif';
            context.fillText('Loading waveform…', 4, height / 2);
            return;
        }
        context.strokeStyle = color;
        context.lineWidth = 1;
        const middle = height / 2;
        context.beginPath();
        for (let x = 0; x < width; x++) {
            const fraction = x / Math.max(1, width - 1);
            const tick = visibleStart + fraction * (visibleEnd - visibleStart);
            const bin = getWaveformBinAtTimelineTick({
                tick,
                clipStartTick: clipOffsetTicks,
                sourceDurationSeconds: durationSeconds,
                binCount: peaks.length,
                timing,
            });
            const amplitude = peaks[bin] ?? 0;
            const y = amplitude * (middle - 1);
            context.moveTo(x + 0.5, middle - y);
            context.lineTo(x + 0.5, middle + y);
        }
        context.stroke();
        if (selected) {
            context.strokeStyle = '#FBBF24';
            context.lineWidth = 2;
            context.strokeRect(1, 1, width - 2, height - 2);
        }
    }, [background, cache?.waveform?.channelPeaks, clipOffsetTicks, color, durationSeconds, height, selected, sourceEndSeconds, sourceStartSeconds, timing, visibleEnd, visibleStart]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} data-track={trackId} />;
};

export default AudioWaveform;

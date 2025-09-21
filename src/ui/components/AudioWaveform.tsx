import React, { useEffect, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';

interface AudioWaveformProps {
    trackId: string;
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

// Lightweight canvas waveform renderer using peakData (mono absolute peaks) from audioCache.
// Assumes peakData extracted asynchronously; will re-render when cache changes via subscription.
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
    trackId,
    height = 40,
    color = '#4ADE80',
    background = 'transparent',
    regionStartTickAbs,
    regionEndTickAbs,
    visibleStartTickAbs,
    visibleEndTickAbs,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { peaks, selected, offsetTicks, durationTicks, regionStartTick, regionEndTick } = useTimelineStore((s) => {
        const t: any = s.tracks[trackId];
        if (!t || t.type !== 'audio') return { peaks: undefined, selected: false, offsetTicks: 0, durationTicks: 0, regionStartTick: 0, regionEndTick: 0 };
        const cacheKey = t.audioSourceId || trackId;
        const cache = s.audioCache[cacheKey];
        return {
            peaks: cache?.peakData,
            selected: s.selection.selectedTrackIds.includes(trackId),
            offsetTicks: t.offsetTicks,
            durationTicks: (t.regionEndTick ?? cache?.durationTicks ?? 0) - (t.regionStartTick ?? 0),
            regionStartTick: t.regionStartTick ?? 0,
            regionEndTick: t.regionEndTick ?? cache?.durationTicks ?? 0,
        };
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.clientWidth;
        const h = canvas.height = height; // ensure internal height matches prop
        canvas.width = w * window.devicePixelRatio;
        canvas.height = h * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        ctx.clearRect(0, 0, w, h);
        if (background && background !== 'transparent') {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, w, h);
        }
        if (!peaks || peaks.length === 0 || durationTicks <= 0) {
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
        // Determine mapping from visible slice to peak bins.
        // Region = trimmed portion of the underlying buffer (regionStartTick .. regionEndTick) relative to buffer start.
        const absRegionStart = typeof regionStartTickAbs === 'number' ? regionStartTickAbs : (offsetTicks + regionStartTick);
        const absRegionEnd = typeof regionEndTickAbs === 'number' ? regionEndTickAbs : (offsetTicks + regionEndTick);
        const absVisibleStart = typeof visibleStartTickAbs === 'number' ? visibleStartTickAbs : absRegionStart;
        const absVisibleEnd = typeof visibleEndTickAbs === 'number' ? visibleEndTickAbs : absRegionEnd;

        const regionDurationTicks = Math.max(1, absRegionEnd - absRegionStart);
        // Clamp visible window inside region
        const visStartClamped = Math.max(absRegionStart, Math.min(absVisibleStart, absRegionEnd));
        const visEndClamped = Math.max(visStartClamped, Math.min(absVisibleEnd, absRegionEnd));
        const visibleDurationTicks = Math.max(1, visEndClamped - visStartClamped);
        const startFrac = (visStartClamped - absRegionStart) / regionDurationTicks;
        const endFrac = (visEndClamped - absRegionStart) / regionDurationTicks;
        const startBin = Math.max(0, Math.min(bins - 1, Math.floor(startFrac * bins)));
        const endBin = Math.max(startBin + 1, Math.min(bins, Math.floor(endFrac * bins)));
        const sliceBins = endBin - startBin;
        for (let x = 0; x < w; x++) {
            const t = sliceBins <= 1 ? 0 : x / (w - 1 || 1);
            const bin = Math.min(bins - 1, startBin + Math.floor(t * sliceBins));
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
    }, [peaks, height, color, background, selected, offsetTicks, durationTicks, regionStartTickAbs, regionEndTickAbs, visibleStartTickAbs, visibleEndTickAbs, regionStartTick, regionEndTick]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} data-track={trackId} />;
};

export default AudioWaveform;

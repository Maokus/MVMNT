import React, { useEffect, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';

interface AudioWaveformProps {
    trackId: string;
    height?: number;
    color?: string;
    background?: string;
}

// Lightweight canvas waveform renderer using peakData (mono absolute peaks) from audioCache.
// Assumes peakData extracted asynchronously; will re-render when cache changes via subscription.
export const AudioWaveform: React.FC<AudioWaveformProps> = ({ trackId, height = 40, color = '#4ADE80', background = 'transparent' }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { peaks, selected, offsetTicks, durationTicks } = useTimelineStore((s) => {
        const t: any = s.tracks[trackId];
        if (!t || t.type !== 'audio') return { peaks: undefined, selected: false, offsetTicks: 0, durationTicks: 0 };
        const cacheKey = t.audioSourceId || trackId;
        const cache = s.audioCache[cacheKey];
        return {
            peaks: cache?.peakData,
            selected: s.selection.selectedTrackIds.includes(trackId),
            offsetTicks: t.offsetTicks,
            durationTicks: (t.regionEndTick ?? cache?.durationTicks ?? 0) - (t.regionStartTick ?? 0),
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
        for (let x = 0; x < w; x++) {
            const bin = Math.floor((x / w) * bins);
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
    }, [peaks, height, color, background, selected, offsetTicks, durationTicks]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} data-track={trackId} />;
};

export default AudioWaveform;

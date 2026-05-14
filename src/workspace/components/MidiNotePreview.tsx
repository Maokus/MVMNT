import React, { useRef, useLayoutEffect } from 'react';
import type { NoteRaw } from '@state/timelineTypes';

interface MidiCacheBoundsRef {
    minNote?: number;
    maxNote?: number;
    maxDurationTicks?: number;
}

interface MidiNotePreviewProps {
    notes: NoteRaw[];
    visibleStartTick: number;
    visibleEndTick: number;
    height: number;
    className?: string;
    bounds?: MidiCacheBoundsRef;
}

const MIN_BAR_THICKNESS = 4;
const MIN_NOTE_WIDTH_PX = 1.5;

const MidiNotePreview: React.FC<MidiNotePreviewProps> = ({
    notes,
    visibleStartTick,
    visibleEndTick,
    height,
    className,
    bounds,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const doRender = () => {
            const width = container.offsetWidth;
            if (width <= 0 || height <= 0) return;

            const dpr = window.devicePixelRatio || 1;
            const physW = Math.round(width * dpr);
            const physH = Math.round(height * dpr);
            if (canvas.width !== physW || canvas.height !== physH) {
                canvas.width = physW;
                canvas.height = physH;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            const hasNotes = Array.isArray(notes) && notes.length > 0;

            if (!hasNotes) {
                ctx.fillStyle = 'rgba(14, 165, 233, 0.05)';
                ctx.fillRect(0, 0, width, height);
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = 'rgba(115, 115, 115, 0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
                ctx.restore();
                return;
            }

            ctx.fillStyle = 'rgba(14, 165, 233, 0.10)';
            ctx.fillRect(0, 0, width, height);

            const windowStart = Math.min(visibleStartTick, visibleEndTick);
            const windowEnd = Math.max(visibleStartTick, visibleEndTick);
            const windowDuration = Math.max(1, windowEnd - windowStart);

            // Binary search for start index (notes sorted by startTick when bounds present)
            const maxDurationTicks = bounds?.maxDurationTicks ?? windowDuration;
            const searchStartTick = windowStart - maxDurationTicks;
            let startIdx = 0;
            if (bounds && notes.length > 32) {
                let lo = 0, hi = notes.length;
                while (lo < hi) {
                    const mid = (lo + hi) >>> 1;
                    if (notes[mid].startTick < searchStartTick) lo = mid + 1;
                    else hi = mid;
                }
                startIdx = lo;
            }

            // Determine pitch range from bounds or scan visible notes
            let minPitch = bounds?.minNote ?? 127;
            let maxPitch = bounds?.maxNote ?? 0;
            if (bounds?.minNote === undefined || bounds?.maxNote === undefined) {
                for (let i = startIdx; i < notes.length; i++) {
                    const n = notes[i];
                    if (n.startTick > windowEnd) break;
                    if (n.endTick <= windowStart) continue;
                    if (n.note < minPitch) minPitch = n.note;
                    if (n.note > maxPitch) maxPitch = n.note;
                }
            }
            if (minPitch > maxPitch) { minPitch = 60; maxPitch = 60; }

            const pitchRange = Math.max(0, maxPitch - minPitch);
            const usableHeight = Math.max(MIN_BAR_THICKNESS, height - 4);
            const baseThickness = pitchRange === 0
                ? Math.min(Math.max(usableHeight * 0.6, MIN_BAR_THICKNESS), usableHeight)
                : Math.min(Math.max(usableHeight / Math.min(pitchRange + 1, 12), MIN_BAR_THICKNESS), usableHeight / 1.5);
            const span = Math.max(usableHeight - baseThickness, 0);
            const yOffset = (height - usableHeight) / 2;

            for (let i = startIdx; i < notes.length; i++) {
                const n = notes[i];
                const rawStart = n.startTick;
                const rawEnd = n.endTick;

                if (rawStart > windowEnd) break;
                if (rawEnd <= windowStart) continue;

                const velocity = typeof n.velocity === 'number' ? n.velocity : 96;
                const normV = Math.min(Math.max(velocity / 127, 0.2), 1);
                const pitch = n.note;
                const relPitch = pitchRange === 0 ? 0.5 : (maxPitch - pitch) / pitchRange;

                const cs = Math.max(rawStart, windowStart) - windowStart;
                const ce = Math.min(rawEnd, windowEnd) - windowStart;
                const x = (cs / windowDuration) * width;
                const w = Math.max((ce - cs) / windowDuration * width, MIN_NOTE_WIDTH_PX);
                const topPx = Math.min(Math.max(2 + relPitch * span, 0), usableHeight - baseThickness) + yOffset;

                ctx.fillStyle = `rgba(56, 189, 248, ${0.25 + normV * 0.55})`;
                ctx.strokeStyle = `rgba(125, 211, 252, ${0.4 + normV * 0.45})`;
                ctx.lineWidth = 1;

                ctx.beginPath();
                if ((ctx as any).roundRect) {
                    (ctx as any).roundRect(x, topPx, w, baseThickness, 2);
                } else {
                    ctx.rect(x, topPx, w, baseThickness);
                }
                ctx.fill();
                ctx.stroke();
            }

            ctx.restore();
        };

        doRender();

        const observer = new ResizeObserver(doRender);
        observer.observe(container);
        return () => observer.disconnect();
    }, [notes, visibleStartTick, visibleEndTick, height, bounds]);

    return (
        <div
            ref={containerRef}
            className={`pointer-events-none absolute inset-1 rounded-sm overflow-hidden ${className || ''}`}
        >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height }} />
        </div>
    );
};

export default MidiNotePreview;

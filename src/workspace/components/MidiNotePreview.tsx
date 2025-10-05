import React, { useMemo } from 'react';
import type { NoteRaw } from '@state/timelineTypes';

interface MidiNotePreviewProps {
    notes: NoteRaw[];
    visibleStartTick: number;
    visibleEndTick: number;
    height: number;
    className?: string;
}

const MIN_BAR_THICKNESS = 4;
const MIN_DURATION_TICKS = 1;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

const MidiNotePreview: React.FC<MidiNotePreviewProps> = ({
    notes,
    visibleStartTick,
    visibleEndTick,
    height,
    className,
}) => {
    const items = useMemo(() => {
        if (!Array.isArray(notes) || notes.length === 0) return [] as Array<{
            id: string;
            leftPct: number;
            widthPct: number;
            topPx: number;
            heightPx: number;
            velocity: number;
        }>;

        const windowStart = Math.min(visibleStartTick, visibleEndTick);
        const windowEnd = Math.max(visibleStartTick, visibleEndTick);
        const windowDuration = Math.max(MIN_DURATION_TICKS, windowEnd - windowStart);

        const overlapping = notes.filter((note) => {
            if (!note) return false;
            const start = typeof note.startTick === 'number' ? note.startTick : 0;
            const end = typeof note.endTick === 'number' ? note.endTick : start;
            if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
            const minStart = Math.min(start, end);
            const maxEnd = Math.max(start, end);
            return maxEnd > windowStart && minStart < windowEnd;
        });
        if (overlapping.length === 0) return [] as Array<{
            id: string;
            leftPct: number;
            widthPct: number;
            topPx: number;
            heightPx: number;
            velocity: number;
        }>;

        let minPitch = Infinity;
        let maxPitch = -Infinity;
        for (const n of overlapping) {
            const pitch = typeof n.note === 'number' ? n.note : 0;
            if (pitch < minPitch) minPitch = pitch;
            if (pitch > maxPitch) maxPitch = pitch;
        }
        if (!Number.isFinite(minPitch) || !Number.isFinite(maxPitch)) {
            minPitch = 60;
            maxPitch = 60;
        }
        const pitchRange = Math.max(0, maxPitch - minPitch);
        const usableHeight = Math.max(MIN_BAR_THICKNESS, height - 4);
        const baseThickness = pitchRange === 0
            ? clamp(usableHeight * 0.6, MIN_BAR_THICKNESS, usableHeight)
            : clamp(usableHeight / Math.min(pitchRange + 1, 12), MIN_BAR_THICKNESS, usableHeight / 1.5);
        const span = Math.max(usableHeight - baseThickness, 0);

        return overlapping.map((note, idx) => {
            const rawStart = typeof note.startTick === 'number' ? note.startTick : 0;
            const rawEnd = typeof note.endTick === 'number' ? note.endTick : rawStart;
            const clampedStart = clamp(Math.max(rawStart, windowStart) - windowStart, 0, windowDuration);
            const clampedEnd = clamp(Math.max(Math.min(rawEnd, windowEnd) - windowStart, clampedStart + MIN_DURATION_TICKS), clampedStart + MIN_DURATION_TICKS, windowDuration);
            const leftPct = (clampedStart / windowDuration) * 100;
            const widthPct = Math.max((clampedEnd - clampedStart) / windowDuration * 100, 0.5);
            const velocity = typeof note.velocity === 'number' ? note.velocity : 96;
            const normVelocity = clamp(velocity / 127, 0.2, 1);
            const pitch = typeof note.note === 'number' ? note.note : minPitch;
            const relativePitch = pitchRange === 0 ? 0.5 : (maxPitch - pitch) / pitchRange;
            const topPx = clamp(2 + relativePitch * span, 0, Math.max(0, usableHeight - baseThickness)) + (height - usableHeight) / 2;
            const heightPx = baseThickness;

            return {
                id: `${rawStart}|${rawEnd}|${pitch}|${idx}`,
                leftPct,
                widthPct,
                topPx,
                heightPx,
                velocity: normVelocity,
            };
        });
    }, [notes, visibleStartTick, visibleEndTick, height]);

    if (items.length === 0) {
        return (
            <div className={`pointer-events-none absolute inset-1 rounded-sm border border-dashed border-neutral-700/40 bg-sky-500/5 ${className || ''}`} />
        );
    }

    return (
        <div className={`pointer-events-none absolute inset-1 rounded-sm bg-sky-500/10 ${className || ''}`}>
            <div className="relative w-full h-full">
                {items.map((item) => {
                    const color = `rgba(56, 189, 248, ${0.25 + item.velocity * 0.55})`;
                    const border = `rgba(125, 211, 252, ${0.4 + item.velocity * 0.45})`;
                    return (
                        <div
                            key={item.id}
                            className="absolute rounded-sm shadow-[0_0_4px_rgba(15,118,110,0.25)]"
                            style={{
                                left: `${item.leftPct}%`,
                                width: `${item.widthPct}%`,
                                top: `${item.topPx}px`,
                                height: `${item.heightPx}px`,
                                minWidth: 3,
                                backgroundColor: color,
                                border: `1px solid ${border}`,
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default MidiNotePreview;

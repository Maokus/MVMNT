import { useCallback, useMemo } from 'react';
import type { NoteRaw } from '@state/timelineTypes';
import { PreviewCanvas, type PreviewPainter } from './PreviewCanvas';
import { getNoteVerticalBounds } from './previewGeometry';

interface MidiNotePreviewProps {
    notes: NoteRaw[];
    visibleStartTick: number;
    visibleEndTick: number;
    bounds?: { minNote?: number; maxNote?: number; maxDurationTicks?: number };
}

export function findFirstPreviewNote(notes: NoteRaw[], startTick: number, maxDuration: number) {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (notes[mid].startTick < startTick - maxDuration) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

const MidiNotePreview = ({ notes, visibleStartTick, visibleEndTick, bounds }: MidiNotePreviewProps) => {
    const pitchBounds = useMemo(() => {
        if (bounds?.minNote !== undefined && bounds.maxNote !== undefined) return [bounds.minNote, bounds.maxNote];
        let min = 127;
        let max = 0;
        for (const note of notes) {
            min = Math.min(min, note.note);
            max = Math.max(max, note.note);
        }
        return min <= max ? [min, max] : [60, 60];
    }, [notes, bounds]);
    const draw = useCallback<PreviewPainter>(
        (ctx, { width, height, scale, pixelX, pixelWidth }) => {
            const duration = visibleEndTick - visibleStartTick;
            if (duration <= 0) return;
            const tileStart = visibleStartTick + (pixelX / scale / width) * duration;
            const tileEnd = visibleStartTick + ((pixelX + pixelWidth) / scale / width) * duration;
            const first =
                bounds?.maxDurationTicks !== undefined
                    ? findFirstPreviewNote(notes, tileStart, bounds.maxDurationTicks)
                    : 0;
            for (let i = first; i < notes.length; i++) {
                const note = notes[i];
                if (note.startTick >= tileEnd) break;
                if (note.endTick <= tileStart) continue;
                const start = Math.max(note.startTick, visibleStartTick);
                const end = Math.min(note.endTick, visibleEndTick);
                if (end <= start) continue;
                const x = ((start - visibleStartTick) / duration) * width;
                const w = Math.min(width - x, Math.max(1 / scale, ((end - start) / duration) * width));
                const vertical = getNoteVerticalBounds(height, note.note, pitchBounds[0], pitchBounds[1]);
                const velocity = Math.max(0.2, Math.min(1, (note.velocity ?? 96) / 127));
                ctx.fillStyle = `rgba(125, 211, 252, ${0.4 + velocity * 0.5})`;
                // Filled bars keep the lowest pitch and the onset inside the drawing bounds.
                ctx.fillRect(x, vertical.y, w, vertical.height);
            }
        },
        [notes, visibleStartTick, visibleEndTick, bounds, pitchBounds]
    );
    return <PreviewCanvas draw={draw} />;
};

export default MidiNotePreview;

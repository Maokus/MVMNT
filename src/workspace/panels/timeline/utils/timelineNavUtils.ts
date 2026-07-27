import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { getMidiClipTimelineBounds, getMidiClipsForTrack } from '@state/timeline/midiClips';
import { getAudioClipTimelineBounds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import { createTimelineTimingContext } from '@state/timeline/timelineShared';

export const MIN_RANGE = 4; // 4 ticks (~1/120 beat at PPQ=480)
export const MAX_RANGE = CANONICAL_PPQ * 60 * 10;

export function isEditableTarget(el: Element | null): boolean {
    if (!el) return false;
    const tag = (el as HTMLElement).tagName;
    return (
        (el as HTMLElement).isContentEditable ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (el as HTMLElement).getAttribute?.('role') === 'textbox'
    );
}

/** Zoom the view around a pivot tick by `factor` (>1 = zoom out, <1 = zoom in). */
export function zoomAround(startTick: number, endTick: number, pivotTick: number, factor: number) {
    const range = Math.max(1, endTick - startTick);
    const newRange = Math.max(MIN_RANGE, Math.min(MAX_RANGE, range * factor));
    const pivotFrac = Math.max(0, Math.min(1, (pivotTick - startTick) / range));
    const newStart = Math.round(pivotTick - pivotFrac * newRange);
    return { newStart, newEnd: Math.round(newStart + newRange) };
}

/** Return the last content tick across all tracks (MIDI + audio). */
export function getContentEndTick(state: ReturnType<typeof useTimelineStore.getState>): number {
    let maxTick = 0;
    const timing = createTimelineTimingContext(state);
    for (const id of state.tracksOrder) {
        const track = state.tracks[id] as any;
        if (!track) continue;
        if (track.type === 'midi') {
            for (const clip of getMidiClipsForTrack(track)) {
                if (clip.enabled === false) continue;
                const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
                if (bounds) {
                    maxTick = Math.max(maxTick, bounds.endTick);
                }
            }
        } else if (track.type === 'audio') {
            for (const clip of getAudioClipsForTrack(track)) {
                if (clip.enabled === false) continue;
                const bounds = getAudioClipTimelineBounds(state.audioCache, clip, timing);
                if (bounds) maxTick = Math.max(maxTick, bounds.endTick);
            }
        }
    }
    return maxTick;
}

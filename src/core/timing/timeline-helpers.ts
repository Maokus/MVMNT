// DEPRECATED: timeline-helpers is superseded by @core/timing/tempo-utils and state/selectors/timing.
// Keeping a thin compatibility layer for the interim to avoid breaking tests.
import type { TempoMapEntry } from '@core/timing/types';
import { secondsToBeats as secondsToBeatsCore, beatsToSeconds as beatsToSecondsCore } from './tempo-utils';
import type { TimelineState } from '@state/timelineStore';

// The mapping helpers below are kept as no-ops or minimal shims; migrate callers to selectors and store data.
export function mapTimelineToTrackSeconds(track: { offsetSec?: number }, timelineSec: number): number | null {
    const offset = track.offsetSec ?? 0;
    const local = timelineSec - offset;
    return local >= 0 ? local : null;
}

export function trackBeatsToTimelineSeconds(
    track: { offsetSec?: number },
    beats: number,
    map?: TempoMapEntry[]
): number {
    const sec = beatsToSecondsCore(map, beats, 0.5); // default 120bpm fallback
    return (track.offsetSec ?? 0) + sec;
}

export function alignAcrossTracks(
    state: TimelineState,
    params: { fromTrackId: string; toTrackId: string; timeInFromTrack: number }
): number {
    const from = (state as any).tracks?.[params.fromTrackId];
    const to = (state as any).tracks?.[params.toTrackId];
    if (!from || !to) return params.timeInFromTrack;
    const timelineTime = (from.offsetSec ?? 0) + params.timeInFromTrack;
    const toLocal = timelineTime - (to.offsetSec ?? 0);
    return toLocal;
}

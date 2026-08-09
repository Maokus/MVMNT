import { migrateTimelineTrackMidiClipsV8, stripLegacyMidiPlacementFields } from '../migrations/midiClipsV8';

/** Shapes runtime timeline tracks into the current persisted clip contract. */
export function serializeTimelineTracks(tracks: Record<string, any>): Record<string, any> {
    const next: Record<string, any> = {};
    for (const [id, track] of Object.entries(tracks || {})) {
        if (track?.type === 'midi') {
            next[id] = stripLegacyMidiPlacementFields(migrateTimelineTrackMidiClipsV8(track));
            continue;
        }
        if (track?.type === 'audio') {
            const {
                offsetTicks: _offsetTicks,
                regionStartTick: _regionStartTick,
                regionEndTick: _regionEndTick,
                audioSourceId: _audioSourceId,
                ...audioTrack
            } = track;
            next[id] = {
                ...audioTrack,
                clips: (Array.isArray(track.clips) ? track.clips : []).map((clip: any) => {
                    const {
                        regionStartTick: _clipRegionStartTick,
                        regionEndTick: _clipRegionEndTick,
                        ...currentClip
                    } = clip ?? {};
                    return currentClip;
                }),
            };
            continue;
        }
        next[id] = track;
    }
    return next;
}

import type { MidiClip } from '@state/timeline/midiClips';

const MIDI_CLIPS_SCHEMA_VERSION = 8;

function cloneClip(track: any, clip: any, index: number): MidiClip | null {
    if (!clip || typeof clip !== 'object') return null;
    const sourceId =
        typeof clip.sourceId === 'string'
            ? clip.sourceId
            : typeof track.midiSourceId === 'string'
              ? track.midiSourceId
              : track.id;
    if (typeof sourceId !== 'string') return null;
    return {
        id: typeof clip.id === 'string' ? clip.id : `${track.id}__clip_${index}`,
        type: 'midi',
        sourceId,
        offsetTicks: typeof clip.offsetTicks === 'number' && Number.isFinite(clip.offsetTicks) ? clip.offsetTicks : 0,
        regionStartTick:
            typeof clip.regionStartTick === 'number' && Number.isFinite(clip.regionStartTick)
                ? clip.regionStartTick
                : undefined,
        regionEndTick:
            typeof clip.regionEndTick === 'number' && Number.isFinite(clip.regionEndTick)
                ? clip.regionEndTick
                : undefined,
        name: typeof clip.name === 'string' ? clip.name : undefined,
        enabled: typeof clip.enabled === 'boolean' ? clip.enabled : undefined,
    };
}

export function migrateTimelineTrackMidiClipsV8(track: any): any {
    if (!track || typeof track !== 'object' || track.type !== 'midi') return track;
    if (Array.isArray(track.clips)) {
        const clips = track.clips
            .map((clip: any, index: number) => cloneClip(track, clip, index))
            .filter((clip: MidiClip | null): clip is MidiClip => Boolean(clip));
        return { ...track, clips };
    }
    const sourceId = typeof track.midiSourceId === 'string' ? track.midiSourceId : track.id;
    const clip: MidiClip = {
        id: `${track.id}__clip`,
        type: 'midi',
        sourceId,
        offsetTicks: typeof track.offsetTicks === 'number' && Number.isFinite(track.offsetTicks) ? track.offsetTicks : 0,
        regionStartTick:
            typeof track.regionStartTick === 'number' && Number.isFinite(track.regionStartTick)
                ? track.regionStartTick
                : undefined,
        regionEndTick:
            typeof track.regionEndTick === 'number' && Number.isFinite(track.regionEndTick)
                ? track.regionEndTick
                : undefined,
        name: typeof track.name === 'string' ? track.name : undefined,
        enabled: true,
    };
    return { ...track, clips: [clip] };
}

export function stripLegacyMidiPlacementFields(track: any): any {
    if (!track || typeof track !== 'object' || track.type !== 'midi') return track;
    const { offsetTicks: _offsetTicks, regionStartTick: _regionStartTick, regionEndTick: _regionEndTick, midiSourceId: _midiSourceId, ...rest } = track;
    return { ...rest, clips: Array.isArray(track.clips) ? track.clips : [] };
}

export function hydrateRuntimeMidiPlacementFields(track: any): any {
    if (!track || typeof track !== 'object' || track.type !== 'midi') return track;
    const migrated = migrateTimelineTrackMidiClipsV8(track);
    const first = Array.isArray(migrated.clips) ? migrated.clips[0] : undefined;
    if (!first) return { ...migrated, clips: [] };
    return {
        ...migrated,
        midiSourceId: migrated.midiSourceId ?? first.sourceId,
        offsetTicks: migrated.offsetTicks ?? first.offsetTicks,
        regionStartTick: migrated.regionStartTick ?? first.regionStartTick,
        regionEndTick: migrated.regionEndTick ?? first.regionEndTick,
    };
}

export function migrateSceneMidiClipsV8<T extends Record<string, any>>(envelope: T): T {
    const schemaVersion = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
    if (schemaVersion >= MIDI_CLIPS_SCHEMA_VERSION) return envelope;
    const timeline = envelope.timeline;
    const tracks = timeline?.tracks;
    if (!tracks || typeof tracks !== 'object') {
        return { ...envelope, schemaVersion: MIDI_CLIPS_SCHEMA_VERSION } as T;
    }
    const nextTracks: Record<string, any> = {};
    for (const [id, track] of Object.entries(tracks)) {
        nextTracks[id] = migrateTimelineTrackMidiClipsV8(track);
    }
    return {
        ...envelope,
        schemaVersion: MIDI_CLIPS_SCHEMA_VERSION,
        timeline: {
            ...timeline,
            tracks: nextTracks,
        },
    } as T;
}

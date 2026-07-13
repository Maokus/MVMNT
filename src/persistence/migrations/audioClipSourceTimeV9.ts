import { createTimingContext, ticksToSeconds } from '@state/timelineTime';

const AUDIO_CLIP_SOURCE_TIME_SCHEMA_VERSION = 9;

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function sourceDurationSeconds(timeline: any, sourceId: string): number | undefined {
    const entry = timeline?.audioCache?.[sourceId];
    return finite(entry?.durationSeconds) && entry.durationSeconds >= 0 ? entry.durationSeconds : undefined;
}

function migrateClip(clip: any, durationSeconds: number | undefined, timing: ReturnType<typeof createTimingContext>): any {
    if (!clip || typeof clip !== 'object' || finite(clip.sourceStartSeconds) || finite(clip.sourceEndSeconds)) return clip;
    const offset = finite(clip.offsetTicks) ? clip.offsetTicks : 0;
    const baseSeconds = ticksToSeconds(timing, offset);
    const startTick = finite(clip.regionStartTick) ? clip.regionStartTick : 0;
    const endTick = finite(clip.regionEndTick) ? clip.regionEndTick : undefined;
    const sourceStartSeconds = Math.max(0, ticksToSeconds(timing, offset + startTick) - baseSeconds);
    const sourceEndSeconds = endTick == null
        ? durationSeconds
        : Math.max(sourceStartSeconds, ticksToSeconds(timing, offset + endTick) - baseSeconds);
    // Packaged scenes may not have decoded audio metadata at migration time. Keep
    // the legacy representation intact in that case; the runtime compatibility
    // projection can still render it and no trim information is discarded.
    if (sourceEndSeconds == null) return clip;
    const next = { ...clip, sourceStartSeconds };
    if (sourceEndSeconds != null) next.sourceEndSeconds = sourceEndSeconds;
    delete next.regionStartTick;
    delete next.regionEndTick;
    return next;
}

/** Convert legacy audio-local tick trims to immutable media-time offsets. */
export function migrateSceneAudioClipSourceTimeV9<T extends Record<string, any>>(envelope: T): T {
    const schemaVersion = finite(envelope.schemaVersion) ? envelope.schemaVersion : 0;
    if (schemaVersion >= AUDIO_CLIP_SOURCE_TIME_SCHEMA_VERSION) return envelope;
    const timelineContainer = envelope.timeline;
    const timeline = timelineContainer?.timeline;
    const tracks = timelineContainer?.tracks;
    if (!timeline || !tracks || typeof tracks !== 'object') {
        return { ...envelope, schemaVersion: AUDIO_CLIP_SOURCE_TIME_SCHEMA_VERSION } as T;
    }
    const timing = createTimingContext(timeline);
    const nextTracks: Record<string, any> = {};
    for (const [id, track] of Object.entries(tracks)) {
        if (!track || typeof track !== 'object' || (track as any).type !== 'audio') {
            nextTracks[id] = track;
            continue;
        }
        const audioTrack = track as any;
        const sourceId = typeof audioTrack.audioSourceId === 'string' ? audioTrack.audioSourceId : id;
        if (Array.isArray(audioTrack.clips)) {
            nextTracks[id] = {
                ...audioTrack,
                clips: audioTrack.clips.map((clip: any) => migrateClip(clip, sourceDurationSeconds(timelineContainer, clip?.sourceId ?? sourceId), timing)),
            };
            continue;
        }
        const migrated = migrateClip(audioTrack, sourceDurationSeconds(timelineContainer, sourceId), timing);
        nextTracks[id] = migrated;
    }
    return {
        ...envelope,
        schemaVersion: AUDIO_CLIP_SOURCE_TIME_SCHEMA_VERSION,
        timeline: { ...timelineContainer, tracks: nextTracks },
    } as T;
}

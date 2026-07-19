import { createTimingContext, ticksToSeconds } from '@state/timelineTime';

const AUDIO_CLIP_SOURCE_TIME_SCHEMA_VERSION = 10;

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function sourceDurationSeconds(envelope: any, sourceId: string): number | undefined {
    const inlineEntry = envelope?.timeline?.audioCache?.[sourceId];
    if (finite(inlineEntry?.durationSeconds) && inlineEntry.durationSeconds >= 0) return inlineEntry.durationSeconds;
    const assetId = envelope?.references?.audioIdMap?.[sourceId] ?? sourceId;
    const asset = envelope?.assets?.audio?.byId?.[assetId];
    return finite(asset?.durationSeconds) && asset.durationSeconds >= 0 ? asset.durationSeconds : undefined;
}

function migrateClip(clip: any, durationSeconds: number | undefined, timing: ReturnType<typeof createTimingContext>): any {
    if (!clip || typeof clip !== 'object') return clip;
    const offset = finite(clip.offsetTicks) ? clip.offsetTicks : 0;
    const baseSeconds = ticksToSeconds(timing, offset);
    const startTick = finite(clip.regionStartTick) ? clip.regionStartTick : 0;
    const endTick = finite(clip.regionEndTick) ? clip.regionEndTick : undefined;
    const sourceStartSeconds = finite(clip.sourceStartSeconds)
        ? Math.max(0, clip.sourceStartSeconds)
        : Math.max(0, ticksToSeconds(timing, offset + startTick) - baseSeconds);
    const projectedEnd = endTick == null
        ? undefined
        : Math.max(sourceStartSeconds, ticksToSeconds(timing, offset + endTick) - baseSeconds);
    const sourceEndSeconds = finite(clip.sourceEndSeconds) ? clip.sourceEndSeconds : projectedEnd;
    const next = { ...clip, offsetTicks: offset, sourceStartSeconds };
    if (sourceEndSeconds != null) {
        next.sourceEndSeconds = Math.max(sourceStartSeconds, durationSeconds == null ? sourceEndSeconds : Math.min(durationSeconds, sourceEndSeconds));
    }
    delete next.regionStartTick;
    delete next.regionEndTick;
    return next;
}

/** Convert legacy audio-local tick trims to immutable media-time offsets. */
export function migrateSceneAudioClipSourceTimeV10<T extends Record<string, any>>(envelope: T): T {
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
        const inputClips = Array.isArray(audioTrack.clips)
            ? audioTrack.clips
            : [{
                  id: `${id}__legacy_audio_clip`,
                  type: 'audio',
                  sourceId,
                  offsetTicks: audioTrack.offsetTicks,
                  regionStartTick: audioTrack.regionStartTick,
                  regionEndTick: audioTrack.regionEndTick,
                  name: audioTrack.name,
                  enabled: audioTrack.enabled,
                  gain: audioTrack.gain,
              }];
        const { offsetTicks: _offsetTicks, regionStartTick: _regionStartTick, regionEndTick: _regionEndTick, audioSourceId: _audioSourceId, ...currentTrack } = audioTrack;
        nextTracks[id] = {
            ...currentTrack,
            clips: inputClips.map((clip: any) =>
                migrateClip(clip, sourceDurationSeconds(envelope, clip?.sourceId ?? sourceId), timing)
            ),
        };
    }
    return {
        ...envelope,
        schemaVersion: AUDIO_CLIP_SOURCE_TIME_SCHEMA_VERSION,
        timeline: { ...timelineContainer, tracks: nextTracks },
    } as T;
}

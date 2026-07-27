import { describe, expect, it } from 'vitest';
import type { AudioClip, AudioTrack } from '@audio/audioTypes';
import type { TimelineState } from '@state/timelineStore';
import {
    enforceNonOverlappingAudioClips,
    findReferencedAudioSourceIds,
    getAudioClipSourceBounds,
    getAudioClipTimelineBounds,
    getAudioClipsForTrack,
    getPrimaryAudioClip,
    resolveAudioClipOverlapWithCache,
} from '../audioClips';
import { createTimingContext } from '@state/timelineTime';

function cacheFor(durationSeconds = 1): TimelineState['audioCache'] {
    return {
        sourceA: {
            sampleRate: 48_000,
            channels: 2,
            durationSeconds,
            durationSamples: durationSeconds * 48_000,
        },
        sourceB: {
            sampleRate: 48_000,
            channels: 2,
            durationSeconds: 0.5,
            durationSamples: 24_000,
        },
    };
}

const timing = createTimingContext({ globalBpm: 120, beatsPerBar: 4 });

function trackWith(clips: AudioClip[]): AudioTrack {
    return {
        id: 'track1',
        name: 'Track',
        type: 'audio',
        enabled: true,
        mute: false,
        solo: false,
        gain: 1,
        clips,
    };
}

describe('audio clip helpers', () => {
    it('uses clips as the only audio-track placement model', () => {
        const clips: AudioClip[] = [
            { id: 'disabled', type: 'audio', sourceId: 'sourceA', offsetTicks: 0, enabled: false },
            { id: 'enabled', type: 'audio', sourceId: 'sourceB', offsetTicks: 480 },
        ];
        const track = trackWith(clips);

        expect(getAudioClipsForTrack(track)).toBe(clips);
        expect(getPrimaryAudioClip(track)?.id).toBe('enabled');
    });

    it('computes source-time trims and derives timeline bounds from timing', () => {
        const cache = cacheFor(1);
        const clip: AudioClip = {
            id: 'clip1',
            type: 'audio',
            sourceId: 'sourceA',
            offsetTicks: 1920,
            sourceStartSeconds: 0.25,
            sourceEndSeconds: 0.75,
        };

        expect(getAudioClipSourceBounds(cache, clip)).toEqual({ startSeconds: 0.25, endSeconds: 0.75 });
        expect(getAudioClipTimelineBounds(cache, clip, timing)).toEqual({ startTick: 2400, endTick: 3360 });
    });

    it('finds every source referenced by clips', () => {
        const state = {
            tracks: {
                first: trackWith([{ id: 'a', type: 'audio', sourceId: 'sourceA', offsetTicks: 0 }]),
                second: {
                    ...trackWith([{ id: 'b', type: 'audio', sourceId: 'sourceB', offsetTicks: 0 }]),
                    id: 'second',
                },
            },
        } as unknown as TimelineState;

        expect([...findReferencedAudioSourceIds(state)].sort()).toEqual(['sourceA', 'sourceB']);
    });

    it('crops and removes overlapping clips using source seconds', () => {
        const cache = cacheFor(1);
        const track = trackWith([
            { id: 'left', type: 'audio', sourceId: 'sourceA', offsetTicks: 0 },
            { id: 'covered', type: 'audio', sourceId: 'sourceA', offsetTicks: 1200, sourceEndSeconds: 0.5 },
            { id: 'right', type: 'audio', sourceId: 'sourceA', offsetTicks: 2400 },
        ]);
        const edited: AudioClip = {
            id: 'edited',
            type: 'audio',
            sourceId: 'sourceA',
            offsetTicks: 960,
            sourceEndSeconds: 1,
        };

        const resolved = resolveAudioClipOverlapWithCache(track, edited, cache, timing);

        expect(resolved.map((clip) => clip.id)).toEqual(['left', 'edited', 'right']);
        expect(resolved.find((clip) => clip.id === 'left')?.sourceEndSeconds).toBeCloseTo(0.5);
        expect(resolved.find((clip) => clip.id === 'right')?.sourceStartSeconds).toBeCloseTo(0.25);
    });

    it('enforces non-overlap from earliest to latest clip', () => {
        const cache = cacheFor(1);
        const track = trackWith([
            { id: 'a', type: 'audio', sourceId: 'sourceA', offsetTicks: 0 },
            { id: 'b', type: 'audio', sourceId: 'sourceA', offsetTicks: 960 },
        ]);

        const resolved = enforceNonOverlappingAudioClips(track, cache, timing);

        expect(resolved.map((clip) => clip.id)).toEqual(['a', 'b']);
        expect(resolved[0].sourceEndSeconds).toBeCloseTo(0.5);
    });

    it('trims in source seconds across a tempo change', () => {
        const cache = cacheFor(4);
        const variableTiming = createTimingContext({
            globalBpm: 120,
            beatsPerBar: 4,
            masterTempoMap: [
                { time: 0, bpm: 120 },
                { time: 2, bpm: 60 },
            ],
        });
        const track = trackWith([
            { id: 'left', type: 'audio', sourceId: 'sourceA', offsetTicks: 0 },
            { id: 'right', type: 'audio', sourceId: 'sourceA', offsetTicks: 3600 },
        ]);
        const edited: AudioClip = {
            id: 'edited',
            type: 'audio',
            sourceId: 'sourceA',
            offsetTicks: 2880,
            sourceStartSeconds: 0,
            sourceEndSeconds: 0.75,
        };

        const resolved = resolveAudioClipOverlapWithCache(track, edited, cache, variableTiming);
        const left = resolved.find((clip) => clip.id === 'left')!;
        const right = resolved.find((clip) => clip.id === 'right')!;

        expect(left.sourceEndSeconds).toBeCloseTo(1.5, 5);
        expect(right.sourceStartSeconds).toBeCloseTo(0.375, 5);
        expect(getAudioClipTimelineBounds(cache, left, variableTiming)?.endTick).toBe(2880);
        expect(getAudioClipTimelineBounds(cache, right, variableTiming)?.startTick).toBe(4080);
    });
});

import { describe, expect, it } from 'vitest';
import type { AudioClip, AudioTrack } from '@audio/audioTypes';
import type { TimelineState } from '@state/timelineStore';
import {
    enforceNonOverlappingAudioClips,
    findReferencedAudioSourceIds,
    getAudioClipLocalBounds,
    getAudioClipTimelineBounds,
    getAudioClipsForTrack,
    getPrimaryAudioClip,
    resolveAudioClipOverlapWithCache,
} from '../audioClips';

function cacheFor(durationTicks: number): TimelineState['audioCache'] {
    return {
        sourceA: {
            durationTicks,
            sampleRate: 48000,
            channels: 2,
            durationSeconds: 1,
            durationSamples: 48000,
        },
        sourceB: {
            durationTicks: 480,
            sampleRate: 48000,
            channels: 2,
            durationSeconds: 0.5,
            durationSamples: 24000,
        },
    };
}

describe('audio clip helpers', () => {
    it('adapts legacy audio track placement to a stable synthetic clip', () => {
        const track: AudioTrack = {
            id: 'track1',
            name: 'Legacy',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            gain: 1,
            offsetTicks: 240,
            regionStartTick: 120,
            regionEndTick: 960,
            audioSourceId: 'sourceA',
        };

        expect(getAudioClipsForTrack(track)).toEqual([
            {
                id: 'track1__legacy_audio_clip',
                type: 'audio',
                sourceId: 'sourceA',
                offsetTicks: 240,
                regionStartTick: 120,
                regionEndTick: 960,
                name: 'Legacy',
                enabled: true,
            },
        ]);
    });

    it('passes through real clips and returns the first enabled clip as primary', () => {
        const clips: AudioClip[] = [
            { id: 'disabled', type: 'audio', sourceId: 'sourceA', offsetTicks: 0, enabled: false },
            { id: 'enabled', type: 'audio', sourceId: 'sourceB', offsetTicks: 480 },
        ];
        const track: AudioTrack = {
            id: 'track1',
            name: 'Track',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            gain: 1,
            clips,
        };

        expect(getAudioClipsForTrack(track)).toBe(clips);
        expect(getPrimaryAudioClip(track)?.id).toBe('enabled');
    });

    it('computes local and timeline clip bounds from cache and regions', () => {
        const cache = cacheFor(900);
        const clip: AudioClip = {
            id: 'clip1',
            type: 'audio',
            sourceId: 'sourceA',
            offsetTicks: 2000,
            regionStartTick: 200,
            regionEndTick: 700,
        };

        expect(getAudioClipLocalBounds(cache, clip)).toEqual({ startTick: 200, endTick: 700 });
        expect(getAudioClipTimelineBounds(cache, clip)).toEqual({ startTick: 2200, endTick: 2700 });
    });

    it('finds all audio source ids referenced by legacy and real clips', () => {
        const state = {
            tracks: {
                legacy: {
                    id: 'legacy',
                    name: 'Legacy',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    audioSourceId: 'sourceA',
                    offsetTicks: 0,
                },
                modern: {
                    id: 'modern',
                    name: 'Modern',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [{ id: 'clip2', type: 'audio', sourceId: 'sourceB', offsetTicks: 0 }],
                },
            },
        } as unknown as TimelineState;

        expect([...findReferencedAudioSourceIds(state)].sort()).toEqual(['sourceA', 'sourceB']);
    });

    it('crops and removes overlapping clips around an edited clip', () => {
        const cache = cacheFor(100);
        const track: AudioTrack = {
            id: 'track1',
            name: 'Track',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            gain: 1,
            clips: [
                { id: 'left', type: 'audio', sourceId: 'sourceA', offsetTicks: 0 },
                { id: 'covered', type: 'audio', sourceId: 'sourceA', offsetTicks: 120 },
                { id: 'right', type: 'audio', sourceId: 'sourceA', offsetTicks: 180 },
            ],
        };
        const edited: AudioClip = {
            id: 'edited',
            type: 'audio',
            sourceId: 'sourceA',
            offsetTicks: 60,
            regionStartTick: 0,
            regionEndTick: 200,
        };

        const resolved = resolveAudioClipOverlapWithCache(track, edited, cache);

        expect(resolved.map((clip) => clip.id)).toEqual(['left', 'edited', 'right']);
        expect(resolved.find((clip) => clip.id === 'left')?.regionEndTick).toBe(60);
        expect(resolved.find((clip) => clip.id === 'right')?.regionStartTick).toBe(80);
    });

    it('enforces non-overlap from earliest to latest clip', () => {
        const cache = cacheFor(100);
        const track: AudioTrack = {
            id: 'track1',
            name: 'Track',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            gain: 1,
            clips: [
                { id: 'a', type: 'audio', sourceId: 'sourceA', offsetTicks: 0 },
                { id: 'b', type: 'audio', sourceId: 'sourceA', offsetTicks: 50 },
            ],
        };

        const resolved = enforceNonOverlappingAudioClips(track, cache);

        expect(resolved.map((clip) => clip.id)).toEqual(['a', 'b']);
        expect(resolved[0].regionEndTick).toBe(50);
    });
});

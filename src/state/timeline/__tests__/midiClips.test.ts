import { describe, expect, it } from 'vitest';
import type { TimelineState, TimelineTrack } from '@state/timelineStore';
import {
    enforceNonOverlappingMidiClips,
    findReferencedMidiSourceIds,
    getMidiClipLocalBounds,
    getMidiClipTimelineBounds,
    getMidiClipsForTrack,
    getPrimaryMidiClip,
    resolveMidiClipOverlapWithCache,
    type MidiClip,
} from '../midiClips';

function cacheFor(bounds: { minTick: number; maxTick: number }): TimelineState['midiCache'] {
    return {
        sourceA: {
            midiData: undefined as any,
            notesRaw: [
                { note: 60, channel: 0, startTick: bounds.minTick, endTick: bounds.maxTick, durationTicks: bounds.maxTick - bounds.minTick },
            ],
            ccRaw: [],
            ticksPerQuarter: 960,
            bounds: { ...bounds, minNote: 60, maxNote: 60, maxDurationTicks: bounds.maxTick - bounds.minTick },
        },
        sourceB: {
            midiData: undefined as any,
            notesRaw: [{ note: 64, channel: 0, startTick: 0, endTick: 480, durationTicks: 480 }],
            ccRaw: [],
            ticksPerQuarter: 960,
            bounds: { minTick: 0, maxTick: 480, minNote: 64, maxNote: 64, maxDurationTicks: 480 },
        },
    };
}

describe('MIDI clip helpers', () => {
    it('adapts legacy MIDI track placement to a stable synthetic clip', () => {
        const track = {
            id: 'track1',
            name: 'Legacy',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: 240,
            regionStartTick: 120,
            regionEndTick: 960,
            midiSourceId: 'sourceA',
        } as TimelineTrack;

        expect(getMidiClipsForTrack(track)).toEqual([
            {
                id: 'track1__legacy_clip',
                type: 'midi',
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
        const clips: MidiClip[] = [
            { id: 'disabled', type: 'midi', sourceId: 'sourceA', offsetTicks: 0, enabled: false },
            { id: 'enabled', type: 'midi', sourceId: 'sourceB', offsetTicks: 480 },
        ];
        const track = {
            id: 'track1',
            name: 'Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            clips,
        } as TimelineTrack;

        expect(getMidiClipsForTrack(track)).toBe(clips);
        expect(getPrimaryMidiClip(track)?.id).toBe('enabled');
    });

    it('computes local and timeline clip bounds from cache and regions', () => {
        const cache = cacheFor({ minTick: 100, maxTick: 900 });
        const clip: MidiClip = {
            id: 'clip1',
            type: 'midi',
            sourceId: 'sourceA',
            offsetTicks: 2000,
            regionStartTick: 200,
            regionEndTick: 700,
        };

        expect(getMidiClipLocalBounds(cache, clip)).toEqual({ startTick: 200, endTick: 700 });
        expect(getMidiClipTimelineBounds(cache, clip)).toEqual({ startTick: 2200, endTick: 2700 });
    });

    it('finds all MIDI source ids referenced by legacy and real clips', () => {
        const state = {
            tracks: {
                legacy: {
                    id: 'legacy',
                    name: 'Legacy',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    midiSourceId: 'sourceA',
                    offsetTicks: 0,
                },
                modern: {
                    id: 'modern',
                    name: 'Modern',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [{ id: 'clip2', type: 'midi', sourceId: 'sourceB', offsetTicks: 0 }],
                },
            },
        } as unknown as TimelineState;

        expect([...findReferencedMidiSourceIds(state)].sort()).toEqual(['sourceA', 'sourceB']);
    });

    it('crops and removes overlapping clips around an edited clip', () => {
        const cache = cacheFor({ minTick: 0, maxTick: 100 });
        const track = {
            id: 'track1',
            name: 'Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            clips: [
                { id: 'left', type: 'midi', sourceId: 'sourceA', offsetTicks: 0 },
                { id: 'covered', type: 'midi', sourceId: 'sourceA', offsetTicks: 120 },
                { id: 'right', type: 'midi', sourceId: 'sourceA', offsetTicks: 180 },
            ],
        } as TimelineTrack;
        const edited: MidiClip = {
            id: 'edited',
            type: 'midi',
            sourceId: 'sourceA',
            offsetTicks: 60,
            regionStartTick: 0,
            regionEndTick: 200,
        };

        const resolved = resolveMidiClipOverlapWithCache(track, edited, cache);

        expect(resolved.map((clip) => clip.id)).toEqual(['left', 'edited', 'right']);
        expect(resolved.find((clip) => clip.id === 'left')?.regionEndTick).toBe(60);
        expect(resolved.find((clip) => clip.id === 'right')?.regionStartTick).toBe(80);
    });

    it('enforces non-overlap from earliest to latest clip', () => {
        const cache = cacheFor({ minTick: 0, maxTick: 100 });
        const track = {
            id: 'track1',
            name: 'Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            clips: [
                { id: 'a', type: 'midi', sourceId: 'sourceA', offsetTicks: 0 },
                { id: 'b', type: 'midi', sourceId: 'sourceA', offsetTicks: 50 },
            ],
        } as TimelineTrack;

        const resolved = enforceNonOverlappingMidiClips(track, cache);

        expect(resolved.map((clip) => clip.id)).toEqual(['a', 'b']);
        expect(resolved[0].regionEndTick).toBe(50);
    });
});

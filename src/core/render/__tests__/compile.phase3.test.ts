import { describe, it, expect } from 'vitest';
import { compileWindow, type CompileMidiCache, type CompileTrack } from '../compile';
import type { TempoMapEntry } from '@core/timing/types';

function mkTrack(id: string, patch: Partial<CompileTrack> = {}): CompileTrack {
    return {
        id,
        enabled: true,
        mute: false,
        solo: false,
        offsetSec: 0,
        ...patch,
    } as CompileTrack;
}

describe('compileWindow (Phase 3)', () => {
    it('schedules noteOn/off within window with offset applied', () => {
        const tracks: CompileTrack[] = [mkTrack('t1', { midiSourceId: 't1', offsetSec: 1 })];
        const midiCache: CompileMidiCache = {
            t1: {
                ticksPerQuarter: 960,
                notesRaw: [{ note: 60, channel: 0, startTime: 0.0, endTime: 0.5, duration: 0.5 }],
            },
        };
        const res = compileWindow({
            tracks,
            midiCache,
            nowSec: 0,
            lookAheadSec: 3,
            bpm: 120,
            beatsPerBar: 4,
        });
        // start at 1.0, end at 1.5 due to offset
        const times = res.events.map((e) => e.timeSec.toFixed(3));
        expect(times).toEqual(['1.000', '1.500']);
        expect(res.events[0].kind).toBe('noteOn');
        expect(res.events[1].kind).toBe('noteOff');
    });

    it('respects region clipping', () => {
        const tracks: CompileTrack[] = [mkTrack('t1', { midiSourceId: 't1', regionStartSec: 0.4, regionEndSec: 0.6 })];
        const midiCache: CompileMidiCache = {
            t1: {
                ticksPerQuarter: 480,
                notesRaw: [{ note: 60, channel: 0, startTime: 0.2, endTime: 0.8, duration: 0.6 }],
            },
        };
        const res = compileWindow({ tracks, midiCache, nowSec: 0, lookAheadSec: 2, bpm: 120, beatsPerBar: 4 });
        // Both noteOn/off inside window but clamped to region means events at 0.4 and 0.6
        expect(res.events.map((e) => e.timeSec)).toEqual([0.4, 0.6]);
    });

    it('gates by solo/mute', () => {
        const tracks: CompileTrack[] = [
            mkTrack('t1', { midiSourceId: 't1', mute: true }),
            mkTrack('t2', { midiSourceId: 't2', solo: true }),
        ];
        const midiCache: CompileMidiCache = {
            t1: { ticksPerQuarter: 480, notesRaw: [{ note: 60, channel: 0, startTime: 0, endTime: 1, duration: 1 }] },
            t2: { ticksPerQuarter: 480, notesRaw: [{ note: 61, channel: 0, startTime: 0, endTime: 1, duration: 1 }] },
        };
        const res = compileWindow({ tracks, midiCache, nowSec: 0, lookAheadSec: 1, bpm: 120, beatsPerBar: 4 });
        expect(res.events.length).toBe(2); // only t2 events
        expect(new Set(res.events.map((e) => e.trackId))).toEqual(new Set(['t2']));
    });

    it('converts beats via tempo map when provided', () => {
        // Map: 0s -> 500000 us/qn (120 bpm, spb=0.5)
        const map: TempoMapEntry[] = [{ time: 0, tempo: 500_000 }];
        const tracks: CompileTrack[] = [mkTrack('t1', { midiSourceId: 't1' })];
        const midiCache: CompileMidiCache = {
            t1: {
                ticksPerQuarter: 960,
                tempoMap: map,
                notesRaw: [{ note: 60, channel: 0, startBeat: 2, endBeat: 3, startTime: 0, endTime: 0, duration: 0 }],
            },
        };
        const res = compileWindow({ tracks, midiCache, nowSec: 0, lookAheadSec: 5, bpm: 100, beatsPerBar: 4 });
        // 2 beats at 0.5 spb -> 1.0 seconds, end at 1.5 seconds
        expect(res.events.map((e) => +e.timeSec.toFixed(3))).toEqual([1.0, 1.5]);
    });
});

import { describe, it, expect } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { diffSchedulerConfig } from '../scheduler-bridge';

const mkCfg = () => ({
    tracks: [{ id: 'a', enabled: true, mute: false, solo: false, offsetSec: 0, midiSourceId: 'a' }] as any,
    midiCache: { a: { ticksPerQuarter: CANONICAL_PPQ, notesRaw: [] } },
    nowSec: 0,
    lookAheadSec: 1,
    tempoMap: undefined,
    bpm: 120,
    beatsPerBar: 4,
});

describe('scheduler-bridge diff', () => {
    it('flags changes in primitives', () => {
        const a = mkCfg();
        const b = { ...a, nowSec: 0.5, bpm: 110 };
        const d = diffSchedulerConfig(a as any, b as any);
        expect(d.nowSec).toBe(0.5);
        expect(d.bpm).toBe(110);
        expect(d.tracksChanged).toBeUndefined();
        expect(d.midiCacheChanged).toBeUndefined();
    });

    it('flags track changes', () => {
        const a = mkCfg();
        const b = mkCfg();
        (b.tracks[0] as any).offsetSec = 2;
        const d = diffSchedulerConfig(a as any, b as any);
        expect(d.tracksChanged).toBe(true);
    });

    it('flags midi cache identity change', () => {
        const a = mkCfg();
        const b = mkCfg();
        b.midiCache = { ...b.midiCache }; // new object ref
        const d = diffSchedulerConfig(a as any, b as any);
        expect(d.midiCacheChanged).toBe(true);
    });
});

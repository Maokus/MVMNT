import { describe, it, expect } from 'vitest';
import { TimelineService } from '@core/timing';
import type { MIDIData, MIDIEvent } from '@core/types';

function makeMidi(events: MIDIEvent[], opts?: Partial<MIDIData>): MIDIData {
    return {
        events,
        duration: events.length ? Math.max(...events.map((e) => e.time)) : 0,
        tempo: 500000,
        ticksPerQuarter: 480,
        timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
        trimmedTicks: 0,
        ...opts,
    } as MIDIData;
}

describe('Timeline mapping helpers', () => {
    it('timelineToTrackSeconds respects offsets and regions', async () => {
        const svc = new TimelineService('map');
        const id = await svc.addMidiTrack({
            midiData: makeMidi([
                { type: 'noteOn', note: 60, velocity: 100, time: 0.0, tick: 0, channel: 0 },
                { type: 'noteOff', note: 60, velocity: 0, time: 1.0, tick: 480, channel: 0 },
            ]),
            name: 'T',
            offsetSec: 1.5,
        });
        const tr = svc.getTrack(id) as any;
        tr.regionStartSec = 0.5;
        tr.regionEndSec = 2.0;

        // Before offset start -> outside region -> null
        expect(svc.map.timelineToTrackSeconds(id, 1.0)).toBeNull();
        // At region start boundary -> allowed
        expect(svc.map.timelineToTrackSeconds(id, 2.0)).toBeCloseTo(0.5, 6);
        // Inside region
        expect(svc.map.timelineToTrackSeconds(id, 3.0)).toBeCloseTo(1.5, 6);
        // After region end -> null
        expect(svc.map.timelineToTrackSeconds(id, 4.0)).toBeNull();
    });

    it('crossSync.align maps times across tracks via beats and tempo maps', async () => {
        const svc = new TimelineService('sync');
        // Track A: 120 BPM constant (500k us/qn)
        const idA = await svc.addMidiTrack({
            midiData: makeMidi(
                [
                    { type: 'noteOn', note: 60, velocity: 100, time: 0, tick: 0, channel: 0 },
                    { type: 'noteOff', note: 60, velocity: 0, time: 1, tick: 480, channel: 0 },
                ],
                { tempoMap: [{ time: 0, tempo: 500000 }] }
            ),
            name: 'A',
            offsetSec: 0,
        });
        // Track B: 60 BPM constant (1,000,000 us/qn)
        const idB = await svc.addMidiTrack({
            midiData: makeMidi(
                [
                    { type: 'noteOn', note: 64, velocity: 100, time: 0, tick: 0, channel: 1 },
                    { type: 'noteOff', note: 64, velocity: 0, time: 2, tick: 960, channel: 1 },
                ],
                { tempoMap: [{ time: 0, tempo: 1_000_000 }] }
            ),
            name: 'B',
            offsetSec: 0,
        });

        // 2 seconds in A (120 BPM) = 4 beats; In B (60 BPM) 4 beats = 4 seconds (timeline seconds)
        const mapped = svc.crossSync.align({ fromTrackId: idA, toTrackId: idB, timeInFromTrack: 2.0 });
        expect(mapped).toBeCloseTo(4.0, 6);
    });
});

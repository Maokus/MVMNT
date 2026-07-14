import { afterEach, describe, expect, it } from 'vitest';
import { AudioEngine } from '@audio/audio-engine';
import { useTimelineStore } from '@state/timelineStore';

class SynthTestContext {
    currentTime = 0;
    state: AudioContextState = 'running';
    oscillators: Array<{ frequency: number; starts: number[]; stops: number[] }> = [];
    get destination() { return {}; }
    resume = async () => {};
    createGain(): any {
        return {
            gain: {
                value: 0,
                setValueAtTime: () => {},
                linearRampToValueAtTime: () => {},
                cancelScheduledValues: () => {},
            },
            connect: () => ({ connect: () => {} }),
            disconnect: () => {},
        };
    }
    createOscillator(): any {
        const entry = { frequency: 0, starts: [] as number[], stops: [] as number[] };
        this.oscillators.push(entry);
        return {
            type: 'sine',
            frequency: { setValueAtTime: (value: number) => { entry.frequency = value; } },
            connect: () => ({ connect: () => {} }),
            disconnect: () => {},
            start: (when: number) => entry.starts.push(when),
            stop: (when: number) => entry.stops.push(when),
            onended: null,
        };
    }
}

afterEach(() => useTimelineStore.getState().resetTimeline());

describe('MIDI preview synth', () => {
    it('schedules enabled MIDI preview notes and releases them when disabled', async () => {
        useTimelineStore.setState({
            tracks: {
                midi1: { id: 'midi1', name: 'MIDI', type: 'midi', enabled: true, mute: false, solo: false, clips: [{ id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: 0, enabled: true }] },
            },
            tracksOrder: ['midi1'],
            midiCache: {
                source1: {
                    midiData: {} as any,
                    ticksPerQuarter: 960,
                    notesRaw: [{ note: 69, channel: 0, startTick: 0, endTick: 960, durationTicks: 960, velocity: 127 }],
                    ccRaw: [],
                    bounds: { minTick: 0, maxTick: 960, minNote: 69, maxNote: 69, maxDurationTicks: 960 },
                },
            },
            midiPreviewTrackIds: { midi1: true },
        } as any);
        const context = new SynthTestContext();
        const engine = new AudioEngine();
        (engine as any).ctx = context;

        await engine.playTick(0);

        expect(context.oscillators).toHaveLength(1);
        expect(context.oscillators[0].frequency).toBe(440);
        expect(context.oscillators[0].starts).toEqual([0]);

        useTimelineStore.getState().setMidiPreviewEnabled('midi1', false);
        expect(context.oscillators[0].stops).toHaveLength(2);
        engine.dispose();
    });
});

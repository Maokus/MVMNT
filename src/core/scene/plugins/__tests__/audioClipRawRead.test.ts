import { describe, expect, it } from 'vitest';
import { createPluginHostServices } from '../host-api/plugin-api';

function buffer(value: number, sampleRate = 8): AudioBuffer {
    const samples = new Float32Array(sampleRate * 3).fill(value);
    return {
        sampleRate,
        length: samples.length,
        numberOfChannels: 1,
        getChannelData: () => samples,
    } as unknown as AudioBuffer;
}

describe('clip-aware raw audio reads', () => {
    it('assembles clip PCM in timeline order and zero-fills gaps', () => {
        const state = {
            timeline: { globalBpm: 120, beatsPerBar: 4, masterTempoMap: undefined },
            tracks: {
                clips: {
                    id: 'clips', type: 'audio', name: 'Clips', enabled: true, mute: false, solo: false, gain: 1,
                    clips: [
                        { id: 'a', type: 'audio', sourceId: 'a', offsetTicks: 0, sourceStartSeconds: 0, sourceEndSeconds: 1 },
                        { id: 'b', type: 'audio', sourceId: 'b', offsetTicks: 3840, sourceStartSeconds: 0, sourceEndSeconds: 1 },
                    ],
                },
            },
            audioCache: {
                a: { durationSeconds: 3, durationTicks: 5760, sampleRate: 8, channels: 1, durationSamples: 24, audioBuffer: buffer(0.5) },
                b: { durationSeconds: 3, durationTicks: 5760, sampleRate: 8, channels: 1, durationSamples: 24, audioBuffer: buffer(-0.5) },
            },
        } as any;
        const host = createPluginHostServices({ timelineStore: { getState: () => state } }).services;

        const samples = host.audio.getRawSamples({ trackId: 'clips', startSec: 0.75, endSec: 2.25, channel: 'left' });

        expect(host.audio.getSampleRate({ trackId: 'clips' })).toBe(8);
        expect(samples).toHaveLength(12);
        expect(Array.from(samples!.slice(0, 2))).toEqual([0.5, 0.5]);
        expect(Array.from(samples!.slice(2, 10))).toEqual(new Array(8).fill(0));
        expect(Array.from(samples!.slice(10))).toEqual([-0.5, -0.5]);
        expect(host.audio.getRmsInWindow({ trackId: 'clips', startSec: 1, endSec: 2 })).toEqual(new Float32Array([0]));
    });

    it('allows raw PCM windows larger than the former fixed request cap', () => {
        const sampleRate = 10_000;
        const state = {
            timeline: { globalBpm: 120, beatsPerBar: 4, masterTempoMap: undefined },
            tracks: {
                clips: {
                    id: 'clips', type: 'audio', name: 'Clips', enabled: true, mute: false, solo: false, gain: 1,
                    clips: [{ id: 'a', type: 'audio', sourceId: 'a', offsetTicks: 0, sourceStartSeconds: 0, sourceEndSeconds: 1 }],
                },
            },
            audioCache: {
                a: {
                    durationSeconds: 3,
                    durationTicks: 5760,
                    sampleRate,
                    channels: 1,
                    durationSamples: sampleRate * 3,
                    audioBuffer: buffer(0.25, sampleRate),
                },
            },
        } as any;
        const host = createPluginHostServices({ timelineStore: { getState: () => state } }).services;

        const samples = host.audio.getRawSamples({ trackId: 'clips', startSec: 0, endSec: 1 });

        expect(samples).toHaveLength(sampleRate);
        expect(samples?.[0]).toBeCloseTo(0.25);
    });

    it('honours cancellation during expensive raw PCM copies', () => {
        const sampleRate = 100_000;
        const state = {
            timeline: { globalBpm: 120, beatsPerBar: 4 },
            tracks: { audio: { id: 'audio', type: 'audio', audioSourceId: 'source', offsetTicks: 0, regionStartTick: 0 } },
            audioCache: { source: { audioBuffer: buffer(0.25, sampleRate) } },
        } as any;
        const host = createPluginHostServices({ timelineStore: { getState: () => state } }).services;
        let checks = 0;
        const signal = { get aborted() { checks += 1; return checks > 3; } } as AbortSignal;

        expect(host.audio.getRawSamples({ trackId: 'audio', startSec: 0, endSec: 1, signal })).toBeNull();
        expect(checks).toBeGreaterThan(3);
    });
});

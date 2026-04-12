import { describe, it, expect } from 'vitest';
import { offlineMix } from '@audio/offline-audio-mixer';
import type { AudioTrack, AudioCacheEntry } from '@audio/audioTypes';

function makeTestAudioBuffer(
    durationSeconds: number,
    sampleRate = 48000,
    channels = 1,
    fillValue = 0.5
): AudioBuffer {
    const frameCount = Math.floor(durationSeconds * sampleRate);
    const data = Array.from({ length: channels }, () => {
        const arr = new Float32Array(frameCount);
        arr.fill(fillValue);
        return arr;
    });
    return {
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: channels,
        length: frameCount,
        getChannelData: (ch: number) => data[ch],
        copyFromChannel: () => {},
        copyToChannel: (src: Float32Array, ch: number) => data[ch].set(src),
    } as unknown as AudioBuffer;
}

describe('offlineMix with tempo map', () => {
    it('uses ticksToSeconds for correct duration under variable tempo', async () => {
        const ppq = 960;
        const sampleRate = 48000;
        const bufferDuration = 10; // 10 second buffer
        const buffer = makeTestAudioBuffer(bufferDuration, sampleRate, 1, 0.3);

        // Simulate a tempo map: 120 BPM (0-2s), 60 BPM (2s+)
        // 120 BPM => 1920 ticks/sec for first 3840 ticks
        // 60 BPM => 960 ticks/sec after that
        // We want to export 0..5760 ticks (6 beats)
        // First 4 beats @ 120BPM = 2.0s, last 2 beats @ 60BPM = 2.0s => total 4.0s
        const startTick = 0;
        const endTick = 6 * ppq; // 5760

        // Build a ticksToSeconds function that matches this tempo map
        function ticksToSeconds(ticks: number): number {
            const beats = ticks / ppq;
            if (beats <= 4) {
                // 120 BPM region: 0.5s per beat
                return beats * 0.5;
            }
            // 60 BPM region: first 4 beats = 2.0s, then 1.0s per beat
            return 2.0 + (beats - 4) * 1.0;
        }

        const track: AudioTrack = {
            id: 'a1',
            name: 'Track',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: 0,
            gain: 1,
        };

        // durationTicks should span the buffer at constant 120BPM for this test
        const flatTicksPerSecond = (120 * ppq) / 60; // 1920
        const durationTicks = Math.round(bufferDuration * flatTicksPerSecond);

        const audioCache: Record<string, AudioCacheEntry> = {
            a1: {
                audioBuffer: buffer,
                durationTicks,
                durationSeconds: bufferDuration,
                durationSamples: buffer.length,
                sampleRate,
                channels: 1,
            } as any,
        };

        // With flat ticksPerSecond (120 BPM), 5760 ticks / 1920 = 3.0s (WRONG)
        const flatResult = await offlineMix({
            tracks: { a1: track },
            tracksOrder: ['a1'],
            audioCache,
            startTick,
            endTick,
            ticksPerSecond: flatTicksPerSecond,
            sampleRate,
            channels: 1,
        });
        expect(flatResult.durationSeconds).toBeCloseTo(3.0, 2);

        // With tempo-aware conversion, 6 beats = 4.0s (CORRECT)
        const tempoResult = await offlineMix({
            tracks: { a1: track },
            tracksOrder: ['a1'],
            audioCache,
            startTick,
            endTick,
            ticksPerSecond: flatTicksPerSecond,
            ticksToSeconds,
            sampleRate,
            channels: 1,
        });
        expect(tempoResult.durationSeconds).toBeCloseTo(4.0, 2);

        // Frame count should reflect the longer duration
        expect(tempoResult.buffer.length).toBeGreaterThan(flatResult.buffer.length);
    });

    it('places clip at correct position under variable tempo', async () => {
        const ppq = 960;
        const sampleRate = 48000;
        const bufferDuration = 1; // 1 second clip
        const buffer = makeTestAudioBuffer(bufferDuration, sampleRate, 1, 0.8);

        // Tempo map: 120 BPM (0-2s), 60 BPM (2s+)
        function ticksToSeconds(ticks: number): number {
            const beats = ticks / ppq;
            if (beats <= 4) return beats * 0.5;
            return 2.0 + (beats - 4) * 1.0;
        }

        // Place clip at beat 5 (tick 4800) → 3.0s under variable tempo, 2.5s under flat 120BPM
        const clipOffsetTicks = 5 * ppq;

        const track: AudioTrack = {
            id: 'b1',
            name: 'Placed',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: clipOffsetTicks,
            gain: 1,
        };

        const flatTicksPerSecond = (120 * ppq) / 60;
        const durationTicks = Math.round(bufferDuration * flatTicksPerSecond);

        const audioCache: Record<string, AudioCacheEntry> = {
            b1: {
                audioBuffer: buffer,
                durationTicks,
                durationSeconds: bufferDuration,
                durationSamples: buffer.length,
                sampleRate,
                channels: 1,
            } as any,
        };

        // Export range: 0 to 8 beats (0 to 6.0s under variable tempo)
        const endTick = 8 * ppq;

        const result = await offlineMix({
            tracks: { b1: track },
            tracksOrder: ['b1'],
            audioCache,
            startTick: 0,
            endTick,
            ticksPerSecond: flatTicksPerSecond,
            ticksToSeconds,
            sampleRate,
            channels: 1,
        });

        // Under variable tempo, clip starts at 3.0s. Check that sample at 2.9s is silent
        // and sample at 3.1s has audio.
        const data = result.buffer.getChannelData(0);
        const silentFrame = Math.floor(2.9 * sampleRate);
        const activeFrame = Math.floor(3.1 * sampleRate);

        expect(Math.abs(data[silentFrame])).toBeLessThan(0.01); // silent before clip
        expect(Math.abs(data[activeFrame])).toBeGreaterThan(0.1); // audio present at clip
    });
});

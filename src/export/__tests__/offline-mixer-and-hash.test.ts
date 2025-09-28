import { describe, it, expect } from 'vitest';
import { offlineMix } from '@audio/offline-audio-mixer';
import { computeReproHash, normalizeTracksForHash } from '@export/repro-hash';

function makeTestAudioBuffer(durationSeconds: number, sampleRate = 48000, channels = 2, seed = 1): AudioBuffer {
    const length = Math.floor(durationSeconds * sampleRate);
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            const buf = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
            for (let ch = 0; ch < channels; ch++) {
                const data = buf.getChannelData(ch);
                let s = seed + ch;
                for (let i = 0; i < data.length; i++) {
                    s = (s * 16807) % 2147483647; // minimal LCG
                    data[i] = ((s / 2147483647) * 2 - 1) * 0.1; // low amplitude
                }
            }
            return buf;
        } catch {}
    }
    // Fallback mock
    const channelData: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(length));
    let s = seed;
    for (let ch = 0; ch < channels; ch++) {
        const data = channelData[ch];
        for (let i = 0; i < length; i++) {
            s = (s * 16807) % 2147483647;
            data[i] = ((s / 2147483647) * 2 - 1) * 0.1;
        }
    }
    return {
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: channels,
        length,
        getChannelData: (ch: number) => channelData[ch],
        copyFromChannel: () => {},
        copyToChannel: (src: Float32Array, ch: number) => channelData[ch].set(src),
    } as unknown as AudioBuffer;
}

describe('Offline mixer & reproducibility hash', () => {
    it('produces deterministic identical buffers for same input', async () => {
        const sampleRate = 32000; // lower for faster test
        const ticksPerSecond = (960 * 120) / 60; // BPM=120, PPQ=960
        const bufferA = makeTestAudioBuffer(1.0, sampleRate, 2, 42);
        const durationTicks = Math.round(bufferA.duration * ticksPerSecond);
        const track = {
            id: 'a1',
            name: 'A',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: 0,
            gain: 1,
        } as any;
        const audioCache = {
            a1: {
                audioBuffer: bufferA,
                durationTicks,
                durationSeconds: bufferA.duration,
                durationSamples: bufferA.length,
                sampleRate,
                channels: 2,
            } as any,
        };
        const tracks = { a1: track };
        const order = ['a1'];
        const res1 = await offlineMix({
            tracks,
            tracksOrder: order,
            audioCache,
            startTick: 0,
            endTick: durationTicks,
            ticksPerSecond,
            sampleRate,
            channels: 2,
        });
        const res2 = await offlineMix({
            tracks,
            tracksOrder: order,
            audioCache,
            startTick: 0,
            endTick: durationTicks,
            ticksPerSecond,
            sampleRate,
            channels: 2,
        });
        expect(res1.buffer.length).toBe(res2.buffer.length);
        for (let ch = 0; ch < res1.buffer.numberOfChannels; ch++) {
            const a = res1.buffer.getChannelData(ch);
            const b = res2.buffer.getChannelData(ch);
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) {
                    throw new Error('Buffers differ at sample ' + i);
                }
            }
        }
    });

    it('reproducibility hash stable for identical state', async () => {
        const tracks: Record<string, any> = {
            a1: {
                id: 'a1',
                type: 'audio',
                offsetTicks: 10,
                regionStartTick: 0,
                regionEndTick: 1000,
                gain: 1,
                mute: false,
                solo: false,
            },
            b2: { id: 'b2', type: 'midi', offsetTicks: 0 },
        };
        const order = ['a1', 'b2'];
        const norm = normalizeTracksForHash(tracks, order);
        const input = {
            version: '1.2.3',
            tempoBPM: 120,
            ppq: 960,
            ticksPerSecond: (120 * 960) / 60,
            exportRange: { start: 0, end: 5000 },
            tracks: norm,
            fps: 60,
        };
        const h1 = await computeReproHash(input);
        const h2 = await computeReproHash({ ...input });
        expect(h1).toBe(h2);
    });

    it('resamples 44.1k source to 48k target correctly', async () => {
        const srcRate = 44100;
        const dstRate = 48000;
        const seconds = 0.5; // short for test
        const ticksPerSecond = (960 * 120) / 60; // BPM=120, PPQ=960
        const buffer = makeTestAudioBuffer(seconds, srcRate, 1, 7); // mono source
        const durationTicks = Math.round(buffer.duration * ticksPerSecond);
        const track = {
            id: 'resample1',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: 0,
            gain: 1,
        } as any;
        const audioCache = {
            resample1: {
                audioBuffer: buffer,
                durationTicks,
                durationSeconds: buffer.duration,
                durationSamples: buffer.length,
                sampleRate: srcRate,
                channels: 1,
            },
        } as any;
        const res = await offlineMix({
            tracks: { resample1: track },
            tracksOrder: ['resample1'],
            audioCache,
            startTick: 0,
            endTick: durationTicks,
            ticksPerSecond,
            sampleRate: dstRate,
            channels: 2, // request stereo (mono should duplicate)
        });
        // Expect output length ~ seconds * dstRate
        expect(res.buffer.sampleRate).toBe(dstRate);
        const expectedLength = Math.ceil(seconds * dstRate);
        expect(Math.abs(res.buffer.length - expectedLength)).toBeLessThanOrEqual(1);
        // Check last 10 samples not all zero (ensures we filled tail, interpolation used)
        const ch0 = res.buffer.getChannelData(0);
        let nonZeroTail = false;
        for (let i = ch0.length - 10; i < ch0.length; i++) {
            if (ch0[i] !== 0) {
                nonZeroTail = true;
                break;
            }
        }
        expect(nonZeroTail).toBe(true);
        // Stereo duplication check (channel 1 matches channel 0 within small epsilon)
        const ch1 = res.buffer.getChannelData(1);
        for (let i = 0; i < 100; i++) {
            // spot check first 100 samples
            expect(Math.abs(ch0[i] - ch1[i])).toBeLessThan(1e-7);
        }
    });
});

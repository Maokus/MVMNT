import { describe, it, expect } from 'vitest';
import { extractPeaks } from '@audio/waveform/peak-extractor';
import { offlineMix } from '@audio/offline-audio-mixer';

// Minimal AudioBuffer polyfill for tests if needed
function makeTestBuffer(
    seconds: number,
    sampleRate = 48000,
    channels = 2,
    fillFn?: (i: number, ch: number) => number
): AudioBuffer {
    const length = Math.floor(seconds * sampleRate);
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            const buf = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
            for (let ch = 0; ch < channels; ch++) {
                const data = buf.getChannelData(ch);
                for (let i = 0; i < length; i++)
                    data[i] = fillFn ? fillFn(i, ch) : Math.sin((i / sampleRate) * 2 * Math.PI * 440);
            }
            return buf;
        } catch {
            /* fall back */
        }
    }
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    for (let ch = 0; ch < channels; ch++) {
        for (let i = 0; i < length; i++)
            data[ch][i] = fillFn ? fillFn(i, ch) : Math.sin((i / sampleRate) * 2 * Math.PI * 440);
    }
    return {
        numberOfChannels: channels,
        sampleRate,
        length,
        duration: length / sampleRate,
        getChannelData: (ch: number) => data[ch],
        copyFromChannel: () => {},
        copyToChannel: (src: Float32Array, ch: number) => data[ch].set(src),
    } as any as AudioBuffer;
}

describe('Waveform peak extraction', () => {
    it('produces expected number of bins and normalized values', () => {
        const buf = makeTestBuffer(1.0); // 1s
        const { peaks, binSize } = extractPeaks(buf, { binSize: 512 });
        expect(binSize).toBeGreaterThan(0);
        expect(peaks.length).toBeGreaterThan(0);
        // All peaks should be within [0,1]
        const max = Math.max(...peaks);
        const min = Math.min(...peaks);
        expect(max).toBeLessThanOrEqual(1.0 + 1e-6);
        expect(min).toBeGreaterThanOrEqual(0);
    });
});

describe('Offline mix normalization', () => {
    it('scales down peak above target when normalize=true', async () => {
        const sampleRate = 48000;
        const seconds = 0.5;
        // Create buffer artificially >1.0 to test scaling (clipped-like)
        const buf = makeTestBuffer(seconds, sampleRate, 1, (i) => 1.2 * Math.sin((i / sampleRate) * 2 * Math.PI * 100));
        const ticksPerSecond = (120 * 960) / 60; // BPM * PPQ / 60 => 120 * 960 / 60 = 1920
        const durationTicks = Math.round(seconds * ticksPerSecond);
        const track: any = {
            id: 'aud1',
            type: 'audio',
            offsetTicks: 0,
            gain: 1,
            mute: false,
            solo: false,
            enabled: true,
        };
        const audioCache: any = {
            aud1: {
                audioBuffer: buf,
                durationTicks,
                durationSeconds: seconds,
                durationSamples: buf.length,
                sampleRate,
                channels: 1,
            },
        };
        const res = await offlineMix({
            tracks: { aud1: track },
            tracksOrder: ['aud1'],
            audioCache,
            startTick: 0,
            endTick: durationTicks,
            ticksPerSecond,
            sampleRate,
            channels: 1,
            normalize: true,
        });
        expect(res.peak).toBeLessThanOrEqual(0.9); // target ~0.891
    });
});

import { describe, expect, it } from 'vitest';
import { audioBufferToWavBlob } from '../av-exporter';

describe('WAV artifact encoding', () => {
    const buffer = {
        numberOfChannels: 2,
        sampleRate: 48_000,
        length: 4,
        getChannelData: () => new Float32Array([0, 0.5, -0.5, 1]),
    } as unknown as AudioBuffer;

    it.each([
        [16, 44 + 4 * 2 * 2],
        [24, 44 + 4 * 2 * 3],
        [32, 44 + 4 * 2 * 4],
    ] as const)('encodes %i-bit PCM with the expected payload size', (bits, expectedSize) => {
        expect(audioBufferToWavBlob(buffer, bits).size).toBe(expectedSize);
    });
});

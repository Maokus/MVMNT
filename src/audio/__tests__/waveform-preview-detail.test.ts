import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOverviewPeak, WaveformDetailCache } from '../waveform/previewPeaks';

function buffer(length: number, impulses: Array<[number, number]> = []): AudioBuffer {
    const data = new Float32Array(length);
    for (const [sample, amplitude] of impulses) data[sample] = amplitude;
    return {
        length,
        numberOfChannels: 2,
        getChannelData: (channel: number) => (channel === 0 ? new Float32Array(length) : data),
    } as AudioBuffer;
}

describe('waveform preview envelopes', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('retains transients between pixel endpoints and respects the last partial bin', () => {
        const peaks = new Float32Array([0, 1, 0, 0.5]);
        expect(getOverviewPeak(peaks, 1024, 0, 3072)).toBe(1);
        expect(getOverviewPeak(peaks, 1024, 3000, 3072)).toBe(0);
        expect(getOverviewPeak(peaks, 1024, 3072, 3100)).toBe(0.5);
    });

    it('reveals exact sample detail across channels and shares completed tiles', async () => {
        const cache = new WaveformDetailCache();
        const source = buffer(3000, [[1050, -1]]);
        const consumer = { invalidate: vi.fn(), isCurrent: () => true };
        expect(cache.read(source, 1050, 1051, consumer)).toBeUndefined();
        await vi.runAllTimersAsync();
        expect(cache.read(source, 1049, 1050, consumer)).toBe(0);
        expect(cache.read(source, 1050, 1051, consumer)).toBe(1);
        expect(cache.read(source, 1051, 1052, consumer)).toBe(0);
        expect(consumer.invalidate).toHaveBeenCalledTimes(1);
        const bytes = cache.byteLength;
        expect(cache.read(source, 1050, 1051, { invalidate: vi.fn(), isCurrent: () => true })).toBe(1);
        expect(cache.byteLength).toBe(bytes);
    });

    it('evicts detail tiles within the budget and isolates replacement sources', async () => {
        const cache = new WaveformDetailCache(4096);
        const source = buffer(4096, [
            [0, 1],
            [2048, 0.5],
        ]);
        const consumer = { invalidate: vi.fn(), isCurrent: () => true };
        cache.read(source, 0, 1, consumer);
        await vi.runAllTimersAsync();
        cache.read(source, 2048, 2049, consumer);
        await vi.runAllTimersAsync();
        expect(cache.byteLength).toBeLessThanOrEqual(4096);
        expect(cache.read(source, 2048, 2049, consumer)).toBe(0.5);
        expect(cache.read(source, 0, 1, consumer)).toBeUndefined();
        expect(cache.read(buffer(4096), 2048, 2049, consumer)).toBeUndefined();
        await vi.runAllTimersAsync();
    });

    it('discards work belonging to an unmounted or replaced preview', async () => {
        const cache = new WaveformDetailCache();
        let current = true;
        const consumer = { invalidate: vi.fn(), isCurrent: () => current };
        cache.read(buffer(4096), 0, 1, consumer);
        current = false;
        await vi.runAllTimersAsync();
        expect(cache.byteLength).toBe(0);
        expect(consumer.invalidate).not.toHaveBeenCalled();
    });
});

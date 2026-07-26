import { describe, expect, it } from 'vitest';
import { buildSpectrogramPixels } from '@core/scene/elements/audio-displays/audio-spectrogram';
import { buildVectorscopePoints } from '@core/scene/elements/audio-displays/audio-vectorscope';

describe('audio spectrogram display helpers', () => {
    it('maps frequency bins vertically and leaves unavailable future columns transparent', () => {
        const pixels = buildSpectrogramPixels(
            [[-80, 0], undefined],
            2,
            -80,
            0,
            'grayscale',
            'linear',
            44100,
            0,
            22050
        );

        // The top pixel represents higher frequencies and is brighter than the low-frequency pixel.
        expect(pixels[0]).toBeGreaterThan(pixels[8]!);
        expect(pixels[3]).toBe(255);
        // The matching future column is transparent rather than fabricated audio data.
        expect(Array.from(pixels.slice(4, 8))).toEqual([0, 0, 0, 0]);
        // The low-frequency bottom pixel remains an opaque measured sample.
        expect(pixels[11]).toBe(255);
    });

    it('supports non-linear frequency scales with valid RGBA output', () => {
        const pixels = buildSpectrogramPixels(
            [[-80, -60, -40, -20, 0]], 8, -80, 0, 'viridis', 'mel', 44100, 20, 20000
        );
        expect(pixels).toHaveLength(8 * 4);
        for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(255);
    });
});

describe('audio vectorscope display helpers', () => {
    it('places equal left/right samples on the vertical mid axis', () => {
        const points = buildVectorscopePoints(
            new Float32Array([0, 0.5, -0.5]), new Float32Array([0, 0.5, -0.5]), 200, 200, 1, 3
        );
        expect(points).toHaveLength(3);
        expect(points.every((point) => point.x === 100)).toBe(true);
        expect(points[1]?.y).toBeCloseTo(50);
    });

    it('places anti-phase stereo samples on the horizontal side axis and bounds density', () => {
        const points = buildVectorscopePoints(
            new Float32Array([1, 1, 1, 1]), new Float32Array([-1, -1, -1, -1]), 200, 200, 1, 64
        );
        expect(points).toHaveLength(4);
        expect(points.every((point) => point.y === 100)).toBe(true);
        expect(points[0]?.x).toBeCloseTo(200);
        expect(points[0]?.age).toBe(0);
        expect(points.at(-1)?.age).toBe(1);
    });
});

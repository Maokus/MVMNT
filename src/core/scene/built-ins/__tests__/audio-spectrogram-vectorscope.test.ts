import { describe, expect, it } from 'vitest';
import {
    buildSpectrogramPixels,
    getSpectrogramFrequencyPosition,
} from '@core/scene/built-ins/audio-displays/audio-spectrogram';
import {
    buildVectorscopePoints,
    buildVectorscopeRgbColors,
    getVectorscopeScaleMarkers,
} from '@core/scene/built-ins/audio-displays/audio-vectorscope';

describe('audio spectrogram display helpers', () => {
    it('maps frequency bins vertically and leaves unavailable future columns transparent', () => {
        const pixels = buildSpectrogramPixels([[-80, 0], undefined], 2, -80, 0, 'grayscale', 'linear', 44100, 0, 22050);

        // The top pixel represents higher frequencies and is brighter than the low-frequency pixel.
        expect(pixels[0]).toBeGreaterThan(pixels[8]!);
        expect(pixels[3]).toBe(255);
        // The matching future column is transparent rather than fabricated audio data.
        expect(Array.from(pixels.slice(4, 8))).toEqual([0, 0, 0, 0]);
        // The low-frequency bottom pixel remains an opaque measured sample.
        expect(pixels[11]).toBe(255);
    });

    it('supports non-linear frequency scales with valid RGBA output', () => {
        const pixels = buildSpectrogramPixels([[-80, -60, -40, -20, 0]], 8, -80, 0, 'viridis', 'mel', 44100, 20, 20000);
        expect(pixels).toHaveLength(8 * 4);
        for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(255);
    });

    it('places frequency guides using the active spectrogram scale', () => {
        expect(getSpectrogramFrequencyPosition(20, 20, 20000, 'log')).toBe(0);
        expect(getSpectrogramFrequencyPosition(20000, 20, 20000, 'log')).toBe(1);
        // A logarithmic scale gives the octave above 20 Hz equal visual distance.
        expect(getSpectrogramFrequencyPosition(40, 20, 20000, 'log')).toBeCloseTo(Math.log10(2) / 3);
        expect(getSpectrogramFrequencyPosition(10010, 20, 20000, 'linear')).toBeCloseTo(0.5);
    });
});

describe('audio vectorscope display helpers', () => {
    it('places equal left/right samples on the vertical mid axis', () => {
        const points = buildVectorscopePoints(
            new Float32Array([0, 0.5, -0.5]),
            new Float32Array([0, 0.5, -0.5]),
            200,
            200,
            1,
            3
        );
        expect(points).toHaveLength(3);
        expect(points.every((point) => point.x === 100)).toBe(true);
        expect(points[1]?.y).toBeCloseTo(50);
    });

    it('places anti-phase stereo samples on the horizontal side axis and bounds density', () => {
        const points = buildVectorscopePoints(
            new Float32Array([1, 1, 1, 1]),
            new Float32Array([-1, -1, -1, -1]),
            200,
            200,
            1,
            64
        );
        expect(points).toHaveLength(4);
        expect(points.every((point) => point.y === 100)).toBe(true);
        expect(points[0]?.x).toBeCloseTo(200);
        expect(points[0]?.age).toBe(0);
        expect(points.at(-1)?.age).toBe(1);
    });

    it('supports unipolar, bipolar, and lissajous coordinate modes', () => {
        const left = new Float32Array([0.5, -0.5]);
        const right = new Float32Array([0.5, 0.5]);
        const bipolar = buildVectorscopePoints(left, right, 200, 200, 1, 2, 'bipolar-scaled');
        const unipolar = buildVectorscopePoints(left, right, 200, 200, 1, 2, 'unipolar-scaled');
        const lissajous = buildVectorscopePoints(left, right, 200, 200, 1, 2, 'lissajous');

        // Unipolar modes use the full positive mid/side quadrant, with a lower-left origin.
        expect(unipolar.every((point) => point.x >= 0 && point.y <= 200)).toBe(true);
        expect(unipolar[0]?.x).toBe(0);
        expect(unipolar[0]?.y).toBeCloseTo(100);
        // Bipolar preserves phase polarity, while Lissajous directly plots left against right.
        expect(bipolar[1]?.x).toBeLessThan(100);
        expect(lissajous[0]).toMatchObject({ x: 150, y: 50 });
        expect(lissajous[1]).toMatchObject({ x: 50, y: 50 });
    });

    it('applies display scale after gain, so it can zoom without changing audio gain', () => {
        const points = buildVectorscopePoints(
            new Float32Array([0, 0.5]),
            new Float32Array([0, 0.5]),
            200,
            200,
            2,
            2,
            'bipolar-scaled',
            2
        );

        // 0.5 × gain 2 ÷ display scale 2 = 0.5, exactly as with unity gain at unity scale.
        expect(points[1]?.x).toBe(100);
        expect(points[1]?.y).toBeCloseTo(50);
        expect(points[1]?.level).toBe(1);
    });

    it('derives grid marker values from both display scale and gain', () => {
        expect(getVectorscopeScaleMarkers(2, 4)).toEqual([-0.5, -0.25, -0.125, 0, 0.125, 0.25, 0.5]);
        expect(getVectorscopeScaleMarkers(1, 0)).toEqual([]);
    });

    it('maps low, mid, and high frequency energy to RGB point components', () => {
        const sampleRate = 48_000;
        const samplesFor = (frequency: number) =>
            Float32Array.from(
                { length: 8_192 },
                (_, index) => 0.8 * Math.sin((2 * Math.PI * frequency * index) / sampleRate)
            );
        const componentsFor = (frequency: number) => {
            const samples = samplesFor(frequency);
            const color = buildVectorscopeRgbColors(samples, samples, sampleRate, 1, samples.length).at(-1)!;
            return color.match(/\d+/g)!.map(Number);
        };

        const [lowRed, lowGreen, lowBlue] = componentsFor(80);
        const [midRed, midGreen, midBlue] = componentsFor(1_000);
        const [highRed, highGreen, highBlue] = componentsFor(8_000);
        expect(lowRed).toBeGreaterThan(lowGreen!);
        expect(lowRed).toBeGreaterThan(lowBlue!);
        expect(midGreen).toBeGreaterThan(midRed!);
        expect(midGreen).toBeGreaterThan(midBlue!);
        expect(highBlue).toBeGreaterThan(highRed!);
        expect(highBlue).toBeGreaterThan(highGreen!);
    });
});

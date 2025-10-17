import { describe, expect, it } from 'vitest';
import { applySmoothingWindow } from '@audio/features/tempoAlignedViewAdapter';

describe('tempoAlignedViewAdapter.applySmoothingWindow', () => {
    it('returns the center sample when smoothing radius is zero or negative', () => {
        const samples = [
            [0, 0.2, 0.4],
            [0.5, 0.6, 0.7],
            [0.9, 1, 1.1],
        ];

        expect(applySmoothingWindow(samples, 0)).toEqual(samples[1]);
        expect(applySmoothingWindow(samples, -2)).toEqual(samples[1]);
    });

    it('averages across the provided window when smoothing radius is positive', () => {
        const samples = [
            [0.25, 0.5, 0.75],
            [0.5, 1, 1.5],
            [0.75, 1.5, 2.25],
        ];

        const smoothed = applySmoothingWindow(samples, 1);
        expect(smoothed).toEqual([
            (0.25 + 0.5 + 0.75) / 3,
            (0.5 + 1 + 1.5) / 3,
            (0.75 + 1.5 + 2.25) / 3,
        ]);
    });

    it('returns an empty vector when samples are missing data', () => {
        expect(applySmoothingWindow([], 2)).toEqual([]);
        expect(applySmoothingWindow([[]], 1)).toEqual([]);
    });
});

import { describe, expect, it } from 'vitest';
import { resolveSpectrogramTemporalFrame } from '@core/scene/built-ins/audio-displays/audio-spectrogram';
import { resolveWaveformTemporalFrame } from '@core/scene/built-ins/audio-displays/audio-waveform';
import { mapTemporalPositionInWindow } from '@core/timing';

describe('audio display temporal windows', () => {
    it('keeps the spectrogram viewport fixed while materializing only visible history', () => {
        const frame = resolveSpectrogramTemporalFrame(10, 6, 0.25, false);

        expect(frame).toMatchObject({
            anchor: { domain: 'seconds', value: 10 },
            viewport: { domain: 'seconds', start: 8.5, end: 14.5 },
            materialization: { domain: 'seconds', start: 8.5, end: 10 },
            cadence: 'continuous',
            reconstruction: 'interpolate',
            mapping: { mode: 'viewport' },
        });
        expect(mapTemporalPositionInWindow(frame.anchor, frame.viewport)).toBe(0.25);
        expect(
            mapTemporalPositionInWindow({ domain: 'seconds', value: frame.materialization.end }, frame.viewport)
        ).toBe(0.25);
    });

    it('materializes the complete spectrogram viewport when future data is visible', () => {
        const frame = resolveSpectrogramTemporalFrame(10, 6, 0.25, true);

        expect(frame.materialization).toBe(frame.viewport);
        expect(frame.materialization).toEqual({ domain: 'seconds', start: 8.5, end: 14.5 });
    });

    it('derives the waveform window from its exact sample extent', () => {
        const frame = resolveWaveformTemporalFrame(2, 4_800, 48_000, 0.75);

        expect(frame.viewport.start).toBeCloseTo(1.925);
        expect(frame.viewport.end).toBeCloseTo(2.025);
        expect(frame.materialization).toBe(frame.viewport);
        expect(mapTemporalPositionInWindow(frame.anchor, frame.viewport)).toBeCloseTo(0.75);
    });
});

import { describe, expect, it } from 'vitest';
import {
    clipTemporalIntervalAcrossWindows,
    convertTemporalWindow,
    createTemporalFrame,
    mapTemporalPosition,
    mapTemporalPositionInWindow,
    resolveAdjacentWindows,
    resolveAlignedWindow,
    resolveAnchoredWindow,
    resolveMaterializationWindow,
    TimingManager,
} from '@core/timing';

const tempoMappedTiming = () => {
    const timing = new TimingManager('temporal-window');
    timing.setTempoMap([
        { time: 0, bpm: 120 },
        { time: 2, bpm: 60 },
    ]);
    return timing;
};

describe('temporal windows', () => {
    it('resolves and maps same-domain sampled windows without a conversion capability', () => {
        const viewport = resolveAnchoredWindow({ domain: 'seconds', value: 10 }, { domain: 'seconds', value: 4 }, 0.25);

        expect(viewport).toEqual({ domain: 'seconds', start: 9, end: 13 });
        expect(mapTemporalPositionInWindow({ domain: 'seconds', value: 10 }, viewport)).toBe(0.25);
        expect(mapTemporalPositionInWindow({ domain: 'seconds', value: 14 }, viewport, { clamp: false })).toBe(1.25);
    });

    it('rejects non-positive or non-finite temporal spans', () => {
        expect(() =>
            resolveAnchoredWindow({ domain: 'seconds', value: 1 }, { domain: 'seconds', value: 0 }, 0.5)
        ).toThrow('Temporal span must be a positive finite number');
        expect(() =>
            mapTemporalPositionInWindow({ domain: 'seconds', value: 1 }, { domain: 'seconds', start: 1, end: 1 })
        ).toThrow('Temporal span must be a positive finite number');
    });

    it('resolves and converts explicit beat and tick coordinate domains across tempo changes', () => {
        const timing = tempoMappedTiming();
        const anchor = { domain: 'seconds' as const, value: 3 };
        const beatWindow = resolveAnchoredWindow(anchor, { domain: 'beats', value: 4 }, 0.5, timing);
        const tickWindow = resolveAnchoredWindow(
            anchor,
            { domain: 'ticks', value: 4 * timing.ticksPerQuarter },
            0.5,
            timing
        );

        expect(beatWindow).toEqual({ domain: 'beats', start: 3, end: 7 });
        expect(tickWindow).toEqual({
            domain: 'ticks',
            start: 3 * timing.ticksPerQuarter,
            end: 7 * timing.ticksPerQuarter,
        });
        expect(convertTemporalWindow(beatWindow, 'seconds', timing)).toEqual({
            domain: 'seconds',
            start: 1.5,
            end: 5,
        });
        expect(mapTemporalPosition(anchor, { mode: 'viewport', window: beatWindow }, timing)).toBe(0.5);
    });

    it('maps numerically equivalent window objects identically', () => {
        const timing = tempoMappedTiming();
        const first = { domain: 'seconds' as const, start: 1.5, end: 5 };
        const second = { ...first };
        const point = { domain: 'seconds' as const, value: 3 };

        expect(mapTemporalPosition(point, { mode: 'viewport', window: first }, timing)).toBe(
            mapTemporalPosition(point, { mode: 'viewport', window: second }, timing)
        );
    });

    it('represents Moving Notes compatibility mapping explicitly in seconds', () => {
        const timing = tempoMappedTiming();
        const anchor = { domain: 'seconds' as const, value: 3 };
        const viewport = { domain: 'seconds' as const, start: 1.5, end: 5 };
        const mapping = {
            mode: 'anchor-relative' as const,
            anchor,
            span: { domain: 'seconds' as const, value: viewport.end - viewport.start },
            anchorPosition: 0.5,
        };

        expect(mapTemporalPosition(anchor, mapping, timing)).toBe(0.5);
        expect(mapTemporalPosition({ domain: 'seconds', value: viewport.start }, mapping, timing)).toBeCloseTo(1 / 14);
        expect(
            mapTemporalPosition({ domain: 'seconds', value: viewport.end }, mapping, timing, { clamp: false })
        ).toBeCloseTo(15 / 14);
    });

    it('keeps cadence and reconstruction independent', () => {
        const window = { domain: 'seconds' as const, start: 0, end: 2 };
        const common = {
            anchor: { domain: 'seconds' as const, value: 1 },
            viewport: window,
            materialization: window,
            mapping: { mode: 'viewport' as const, window },
        };

        const heldContinuous = createTemporalFrame({
            ...common,
            cadence: 'continuous',
            reconstruction: 'hold',
        });
        const interpolatedTransport = createTemporalFrame({
            ...common,
            cadence: 'transport-relative',
            reconstruction: 'interpolate',
        });

        expect(heldContinuous).toMatchObject({ cadence: 'continuous', reconstruction: 'hold' });
        expect(interpolatedTransport).toMatchObject({
            cadence: 'transport-relative',
            reconstruction: 'interpolate',
        });
    });

    it('resolves materialization independently from the viewport and cadence', () => {
        const timing = tempoMappedTiming();
        const viewport = { domain: 'beats' as const, start: 4, end: 8 };

        expect(
            resolveMaterializationWindow(
                viewport,
                {
                    before: { domain: 'beats', value: 4 },
                    after: { domain: 'seconds', value: 0.3 },
                    outputDomain: 'seconds',
                },
                timing
            )
        ).toEqual({ domain: 'seconds', start: 0, end: 6.3 });
        expect(viewport).toEqual({ domain: 'beats', start: 4, end: 8 });
    });

    it('applies exact boundary policy and derives adjacent musical windows without seeking', () => {
        const timing = new TimingManager('boundaries');
        timing.setBPM(120);
        const anchor = { domain: 'seconds' as const, value: 2 };
        const span = { domain: 'beats' as const, value: 4 };

        const previousBoundary = resolveAlignedWindow(anchor, span, timing, 'previous');
        const nextBoundary = resolveAlignedWindow(anchor, span, timing, 'next');

        expect(previousBoundary).toEqual({ domain: 'beats', start: 0, end: 4 });
        expect(nextBoundary).toEqual({ domain: 'beats', start: 4, end: 8 });
        expect(resolveAdjacentWindows(previousBoundary, { before: 1, after: 1 })).toEqual([
            { offset: -1, window: { domain: 'beats', start: -4, end: 0 } },
            { offset: 0, window: { domain: 'beats', start: 0, end: 4 } },
            { offset: 1, window: { domain: 'beats', start: 4, end: 8 } },
        ]);
    });

    it('clips half-open interval events across domain-tagged windows', () => {
        const windows = [
            { domain: 'seconds' as const, start: 0, end: 2 },
            { domain: 'seconds' as const, start: 2, end: 4 },
            { domain: 'seconds' as const, start: 4, end: 6 },
        ];

        expect(clipTemporalIntervalAcrossWindows({ domain: 'seconds', start: 1.5, end: 4.5 }, windows)).toEqual([
            { interval: { domain: 'seconds', start: 1.5, end: 2 }, window: windows[0] },
            { interval: { domain: 'seconds', start: 2, end: 4 }, window: windows[1] },
            { interval: { domain: 'seconds', start: 4, end: 4.5 }, window: windows[2] },
        ]);
        expect(clipTemporalIntervalAcrossWindows({ domain: 'seconds', start: 2, end: 4 }, windows)).toEqual([
            { interval: { domain: 'seconds', start: 2, end: 4 }, window: windows[1] },
        ]);
    });
});

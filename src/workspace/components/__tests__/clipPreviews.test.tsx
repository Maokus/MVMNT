import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import MidiNotePreview from '../MidiNotePreview';
import AudioWaveform from '../AudioWaveform';
import { PreviewCanvas } from '../PreviewCanvas';
import { getClipPreviewLayout, getNoteVerticalBounds, getPreviewTiles, getPreviewViewport } from '../previewGeometry';
import { useTickScale } from '@workspace/panels/timeline/hooks/useTickScale';
import { useTimelineStore } from '@state/timelineStore';

describe('clip preview geometry and raster lifecycle', () => {
    let width = 800;
    let height = 24;
    let resized: () => void;
    let densityChanged: () => void;
    let callbacks: FrameRequestCallback[];
    let fillRect: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        width = 800;
        height = 24;
        callbacks = [];
        fillRect = vi.fn();
        vi.stubGlobal('devicePixelRatio', 1);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callbacks.push(callback);
            return callbacks.length;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: () => void) {
                    resized = callback;
                }
                observe() {}
                disconnect() {}
            }
        );
        vi.stubGlobal('matchMedia', () => ({
            addEventListener: (_: string, callback: () => void) => {
                densityChanged = callback;
            },
            removeEventListener: vi.fn(),
        }));
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
            width,
            height,
            left: 0,
            top: 0,
            right: width,
            bottom: height,
            x: 0,
            y: 0,
            toJSON() {},
        }));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            setTransform: vi.fn(),
            fillRect,
        } as unknown as CanvasRenderingContext2D);
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    const flush = () =>
        act(() => {
            const pending = callbacks.splice(0);
            pending.forEach((callback) => callback(0));
        });

    it.each([1, 1.25, 2])('keeps tiled canvases at density %s for wide viewports', (scale) => {
        const tiles = getPreviewTiles(20_000, 100, scale);
        expect(tiles.reduce((sum, tile) => sum + tile.pixelWidth, 0)).toBe(20_000 * scale);
        expect(tiles.every((tile) => tile.pixelWidth <= 8192)).toBe(true);
        for (let i = 1; i < tiles.length; i++)
            expect(tiles[i].pixelX).toBe(tiles[i - 1].pixelX + tiles[i - 1].pixelWidth);
    });

    it('redraws on layout and density changes without changing the time range', () => {
        const draw = vi.fn();
        const { container } = render(<PreviewCanvas draw={draw} />);
        flush();
        width = 500;
        height = 12;
        resized();
        resized();
        flush();
        let canvas = container.querySelector('canvas')!;
        expect([canvas.width, canvas.height]).toEqual([500, 12]);
        vi.stubGlobal('devicePixelRatio', 2);
        densityChanged();
        flush();
        canvas = container.querySelector('canvas')!;
        expect([canvas.width, canvas.height]).toEqual([1000, 24]);
        expect(draw.mock.calls.at(-1)?.[1]).toMatchObject({ width: 500, height: 12, scale: 2 });
    });

    it('uses the ruler transform when cropping a huge clip, without rounding source ticks', () => {
        useTimelineStore.setState({ timelineView: { startTick: 1200, endTick: 2400 } });
        const { result } = renderHook(useTickScale);
        const scale = result.current;
        const viewport = getPreviewViewport(scale.toX(-100_000, 800), scale.toX(100_000, 800), 800);
        expect(viewport.width).toBe(800);
        const start = scale.toTickExact(viewport.startX, 800);
        const end = scale.toTickExact(viewport.endX, 800);
        const onset = 1600.25;
        expect(((onset - start) / (end - start)) * viewport.width).toBeCloseTo(scale.toX(onset, 800), 10);
        expect(scale.toTickExact(scale.toX(onset, 800), 800)).toBeCloseTo(onset, 10);
        expect(start).toBeLessThan(1200);
    });

    it.each([1, 4, 8, 16, 40])('fits both pitch extremes inside a %spx preview', (h) => {
        for (const pitch of [0, 127]) {
            const rect = getNoteVerticalBounds(h, pitch, 0, 127);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.y + rect.height).toBeLessThanOrEqual(h);
        }
        const single = getNoteVerticalBounds(h, 60, 60, 60);
        expect(single.y + single.height / 2).toBeCloseTo(h / 2);
    });

    it('separates the label header and gives compact rows entirely to the preview', () => {
        expect(getClipPreviewLayout(64)).toEqual({ height: 56, headerHeight: 16 });
        expect(getClipPreviewLayout(24)).toEqual({ height: 16, headerHeight: 0 });
    });

    it('draws low and high notes, sustains entering a crop, and exact onsets after leading silence', () => {
        const note = (pitch: number, startTick: number, endTick: number) => ({
            note: pitch,
            channel: 0,
            velocity: 100,
            startTick,
            endTick,
            durationTicks: endTick - startTick,
        });
        const notes = [note(36, 0, 600), note(84, 600, 1000), note(60, 1000, 1200)];
        const { rerender } = render(
            <MidiNotePreview
                notes={notes}
                visibleStartTick={400}
                visibleEndTick={800}
                bounds={{ minNote: 36, maxNote: 84, maxDurationTicks: 600 }}
            />
        );
        expect(fillRect.mock.calls).toHaveLength(2);
        expect(fillRect.mock.calls[0][0]).toBe(0);
        expect(fillRect.mock.calls[0][2]).toBe(400);
        expect(fillRect.mock.calls[1][0]).toBe(400);
        for (const [, y, , h] of fillRect.mock.calls) expect(y + h).toBeLessThanOrEqual(height - 2);
        fillRect.mockClear();
        rerender(<MidiNotePreview notes={[note(60, 400, 600)]} visibleStartTick={0} visibleEndTick={800} />);
        expect(fillRect.mock.calls[0][0]).toBe(400);
    });

    it('aligns trimmed waveform impulses through tempo changes and keeps cached data for missing media', () => {
        const peaks = new Float32Array(20);
        peaks[10] = 1;
        const rehydrate = vi.fn();
        const originalRehydrate = useTimelineStore.getState().rehydrateAudioSource;
        useTimelineStore.setState({
            timeline: {
                id: 'preview-test',
                name: 'Preview',
                currentTick: 0,
                globalBpm: 120,
                beatsPerBar: 4,
                timeSignature: { numerator: 4, denominator: 4 },
                masterTempoMap: [
                    { time: 0, tempo: 500_000 },
                    { time: 1, tempo: 1_000_000 },
                ],
            },
            audioCache: {
                source: {
                    sampleRate: 1000,
                    durationSamples: 2000,
                    durationSeconds: 2,
                    channels: 1,
                    decodedState: 'failed',
                    waveform: { version: 1, channelPeaks: peaks, sampleStep: 100 },
                },
            },
            rehydrateAudioSource: rehydrate,
        });
        try {
            render(
                <AudioWaveform
                    trackId="audio"
                    sourceId="source"
                    clipOffsetTicks={960}
                    sourceStartSeconds={0.2}
                    sourceEndSeconds={1.5}
                    regionStartTickAbs={1344}
                    regionEndTickAbs={2880}
                />
            );
            // Source second 1 occurs at timeline second 1.5 / tick 2400, after the tempo change.
            const impulse = fillRect.mock.calls.find(([, , , h]) => h > 1)!;
            expect(impulse[0]).toBeCloseTo(550, 0);
            expect(rehydrate).not.toHaveBeenCalled();
            fillRect.mockClear();
            flush();
            fillRect.mockClear();
            act(() => useTimelineStore.setState((state) => ({ timeline: { ...state.timeline, currentTick: 1800 } })));
            expect(fillRect).not.toHaveBeenCalled();
        } finally {
            useTimelineStore.setState({ rehydrateAudioSource: originalRehydrate });
        }
    });
});

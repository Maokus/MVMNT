import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Line, Rectangle } from '@core/render/render-objects';
import type { AudioFeatureCache, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import type { AudioTrack } from '@audio/audioTypes';
import { TimingManager } from '@core/timing';
import type { TimelineState } from '@state/timelineStore';
import {
    applyTransferFunction,
    applyTransferFunctionArray,
    createTransferFunctionProperties,
    channelColorPalette,
    sampleFeatureHistory,
    applyGlowToLine,
    applyGlowToRectangle,
    type GlowStyle,
    type FeatureHistoryHopStrategy,
} from '../audioVisualization';

vi.mock('@core/scene/elements/audioFeatureUtils', () => ({
    resolveFeatureContext: vi.fn(),
    resolveDescriptorProfileId: vi.fn(() => null),
}));

vi.mock('@state/selectors/audioFeatureSelectors', () => ({
    sampleAudioFeatureRange: vi.fn(),
}));

vi.mock('@state/timelineStore', () => ({
    getSharedTimingManager: vi.fn(() => ({
        secondsToTicks: (seconds: number) => Math.round(seconds * 480),
        ticksToSeconds: (ticks: number) => ticks / 480,
    })),
}));

const audioFeatureUtils = await import('@audio/audioFeatureUtils');
const stateSelectors = await import('@state/selectors/audioFeatureSelectors');
const timelineStore = await import('@state/timelineStore');

const resolveFeatureContext = vi.mocked(audioFeatureUtils.resolveFeatureContext);
const resolveDescriptorProfileId = vi.mocked(audioFeatureUtils.resolveDescriptorProfileId);
const sampleAudioFeatureRange = vi.mocked(stateSelectors.sampleAudioFeatureRange);
const getSharedTimingManager = vi.mocked(timelineStore.getSharedTimingManager);

describe('audio visualization utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resolveDescriptorProfileId.mockReturnValue(null);
        const timingMock = new TimingManager();
        timingMock.ticksPerQuarter = 480;
        timingMock.setBPM(120);
        getSharedTimingManager.mockReturnValue(timingMock);
    });

    it('applies transfer functions deterministically', () => {
        expect(applyTransferFunction(0.5, 'linear')).toBeCloseTo(0.5, 5);
        const linearMid = applyTransferFunction(0.5, 'linear');
        const logMid = applyTransferFunction(0.5, 'log');
        expect(logMid).toBeGreaterThan(linearMid);
        expect(logMid).toBeLessThan(1);
        expect(applyTransferFunction(0.5, 'power', { exponent: 2 })).toBeCloseTo(0.25, 5);
        expect(applyTransferFunctionArray([0, 0.5, 1], 'linear')).toEqual([0, 0.5, 1]);
    });

    it('creates inspector property definitions for transfer functions', () => {
        const properties = createTransferFunctionProperties();
        expect(properties).toHaveLength(2);
        expect(properties[0]).toMatchObject({ key: 'transferFunction', type: 'select' });
        expect(properties[1]).toMatchObject({
            key: 'transferExponent',
            type: 'number',
            visibleWhen: [{ key: 'transferFunction', equals: 'power' }],
        });
    });

    it('derives channel palettes from aliases', () => {
        const palette = channelColorPalette(['Left', 'Right', 'Custom']);
        expect(palette).toHaveLength(3);
        expect(palette[0].color).toBe('#38bdf8');
        expect(palette[1].color).toBe('#f472b6');
        expect(palette[2].label).toBe('Custom');
    });

    it('samples feature history using profile hop strategy', () => {
        const cache = {
            hopSeconds: 0.05,
            startTimeSeconds: 0,
        } as unknown as AudioFeatureCache;
        const featureTrack = {
            hopSeconds: 0.05,
        } as unknown as AudioFeatureTrack;
        const track: AudioTrack = {
            id: 'track-a',
            name: 'Track A',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: 0,
            gain: 1,
            audioSourceId: 'track-a',
        };
        resolveFeatureContext.mockReturnValue({
            cache,
            featureTrack,
            state: {} as TimelineState,
            track,
            sourceId: 'track-a',
        });
        sampleAudioFeatureRange.mockReturnValue({
            hopTicks: 24,
            frameCount: 5,
            channels: 1,
            format: 'float32',
            data: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]),
            frameTicks: new Float64Array([432, 456, 480, 504, 528]),
            frameSeconds: new Float64Array([0.9, 0.95, 1.0, 1.05, 1.1]),
            requestedStartTick: 432,
            requestedEndTick: 480,
            windowStartTick: 432,
            windowEndTick: 528,
            trackStartTick: 0,
            trackEndTick: 10_000,
            sourceId: 'source',
        });

        const result = sampleFeatureHistory('track-a', { featureKey: 'spectrogram' }, 1, 3, {
            type: 'profileHop',
        });

        expect(result).toHaveLength(3);
        expect(sampleAudioFeatureRange).toHaveBeenCalled();
        expect(result[0].timeSeconds).toBeCloseTo(0.9, 3);
        expect(result[2].timeSeconds).toBeCloseTo(1.0, 3);
    });

    it('supports equal spacing hop strategy', () => {
        const cache = {
            hopSeconds: 0.05,
            startTimeSeconds: 0,
        } as unknown as AudioFeatureCache;
        const featureTrack = {
            hopSeconds: 0.05,
        } as unknown as AudioFeatureTrack;
        const track: AudioTrack = {
            id: 'track-b',
            name: 'Track B',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: 0,
            gain: 1,
            audioSourceId: 'track-b',
        };
        resolveFeatureContext.mockReturnValue({
            cache,
            featureTrack,
            state: {} as TimelineState,
            track,
            sourceId: 'track-b',
        });
        sampleAudioFeatureRange.mockReturnValue({
            hopTicks: 48,
            frameCount: 4,
            channels: 1,
            format: 'float32',
            data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
            frameTicks: new Float64Array([720, 960, 1200, 1440]),
            frameSeconds: new Float64Array([1.5, 2.0, 2.5, 3.0]),
            requestedStartTick: 720,
            requestedEndTick: 1440,
            windowStartTick: 720,
            windowEndTick: 1440,
            trackStartTick: 0,
            trackEndTick: 10_000,
            sourceId: 'source',
        });

        const strategy: FeatureHistoryHopStrategy = { type: 'equalSpacing', seconds: 0.5 };
        const result = sampleFeatureHistory('track-b', { featureKey: 'rms' }, 3, 2, strategy);
        expect(result).toHaveLength(2);
        expect(result[0].timeSeconds).toBeCloseTo(2.5, 3);
        expect(result[1].timeSeconds).toBeCloseTo(3.0, 3);
    });

    it('returns empty history when context is unavailable', () => {
        resolveFeatureContext.mockReturnValue(null);
        const result = sampleFeatureHistory('missing', { featureKey: 'spectrogram' }, 1, 2);
        expect(result).toEqual([]);
    });

    it('applies glow layers to lines', () => {
        const line = new Line(0, 0, 10, 0, '#ffffff', 2);
        const style: GlowStyle = { color: '#38bdf8', blur: 8, opacity: 0.6, layerCount: 2, layerSpread: 1 };
        const objects = applyGlowToLine(line, style);
        expect(objects).toHaveLength(3);
        expect(objects[0]).instanceof(Line);
        const glowLine = objects[0] as Line;
        expect(glowLine.lineWidth).toBeGreaterThan(line.lineWidth);
        expect(glowLine.color).toContain('rgba');
        expect(line.shadowColor).toBeTruthy();
        expect(glowLine.includeInLayoutBounds).toBe(false);
    });

    it('applies glow layers to rectangles', () => {
        const rect = new Rectangle(0, 0, 20, 10, '#ffffff');
        const style: GlowStyle = { color: '#f472b6', blur: 12, opacity: 0.5, layerCount: 1, layerSpread: 2 };
        const objects = applyGlowToRectangle(rect, style);
        expect(objects).toHaveLength(2);
        const glowRect = objects[0] as Rectangle;
        expect(glowRect.width).toBeGreaterThan(rect.width);
        expect(glowRect.includeInLayoutBounds).toBe(false);
        expect(rect.shadowColor).toBeTruthy();
    });
});

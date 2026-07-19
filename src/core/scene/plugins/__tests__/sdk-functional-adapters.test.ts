import { describe, expect, it, vi } from 'vitest';
import {
    getAudioChannelMetadata,
    getAudioRms,
    getRawAudioSamples,
    registerAudioCalculator,
    requireAudioFeatures,
    sampleAudioFeature,
    sampleAudioFeatureRange,
    type AudioApi,
    type AudioCalculatorsApi,
} from '../../../../../packages/plugin-sdk/src/audio';
import {
    getTimelineMetadata,
    getTimelineSustain,
    getTimelineTrack,
    getTimelineTracks,
    selectTimelineCC,
    selectTimelineNotes,
    type TimelineApi,
} from '../../../../../packages/plugin-sdk/src/timeline';
import {
    beatsToSeconds,
    beatsToTicks,
    getTimeSignature,
    secondsToBeats,
    secondsToTicks,
    ticksToBeats,
    ticksToSeconds,
    type TimingApi,
} from '../../../../../packages/plugin-sdk/src/timing';
import {
    createProjectAssetHandle,
    loadAsset,
    loadBundledGridAtlas,
    loadBundledImage,
    loadBundledSparrow,
    type AssetApi,
} from '../../../../../packages/plugin-sdk/src/visual-assets';

const result = { ok: true as const, value: 'delegated' };

describe('SDK 2 functional adapters', () => {
    it('exposes every timeline operation as a named function', () => {
        const timeline = {
            getMetadata: vi.fn(() => result),
            getTrack: vi.fn(() => result),
            getTracks: vi.fn(() => result),
            selectNotes: vi.fn(() => result),
            selectCC: vi.fn(() => result),
            getSustain: vi.fn(() => result),
        } as unknown as TimelineApi;
        const range = { startSeconds: 1, endSeconds: 2 };

        expect(getTimelineMetadata(timeline)).toBe(result);
        expect(getTimelineTrack(timeline, 'track')).toBe(result);
        expect(getTimelineTracks(timeline, ['track'])).toBe(result);
        expect(selectTimelineNotes(timeline, range)).toBe(result);
        expect(selectTimelineCC(timeline, range)).toBe(result);
        expect(getTimelineSustain(timeline, { timeSeconds: 1 })).toBe(result);
        expect(timeline.getTrack).toHaveBeenCalledWith('track');
        expect(timeline.selectNotes).toHaveBeenCalledWith(range);
    });

    it('exposes every audio operation as a named function', () => {
        const audio = {
            requireFeatures: vi.fn(() => result),
            getChannelMetadata: vi.fn(() => result),
            sampleFeature: vi.fn(() => result),
            sampleFeatureRange: vi.fn(() => result),
            getRawSamples: vi.fn(() => result),
            getRms: vi.fn(() => result),
        } as unknown as AudioApi;
        const calculators = { register: vi.fn(() => result) } as unknown as AudioCalculatorsApi;
        const requirement = [{ feature: 'rms' }];
        const sample = { trackId: 'audio', feature: 'rms', timeSeconds: 1 };
        const range = { ...sample, startSeconds: 0, endSeconds: 1, stepSeconds: 0.1 };
        const rawRange = { trackId: 'audio', startSeconds: 0, endSeconds: 1 };
        const calculator = { id: 'test', version: 1, featureKey: 'rms', calculate: vi.fn() };

        expect(requireAudioFeatures(audio, requirement)).toBe(result);
        expect(getAudioChannelMetadata(audio, 'audio')).toBe(result);
        expect(sampleAudioFeature(audio, sample)).toBe(result);
        expect(sampleAudioFeatureRange(audio, range)).toBe(result);
        expect(getRawAudioSamples(audio, rawRange)).toBe(result);
        expect(getAudioRms(audio, rawRange)).toBe(result);
        expect(registerAudioCalculator(calculators, calculator)).toBe(result);
        expect(audio.sampleFeatureRange).toHaveBeenCalledWith(range);
        expect(calculators.register).toHaveBeenCalledWith(calculator);
    });

    it('exposes every timing operation as a named function', () => {
        const timing = {
            secondsToTicks: vi.fn(() => result),
            ticksToSeconds: vi.fn(() => result),
            secondsToBeats: vi.fn(() => result),
            beatsToSeconds: vi.fn(() => result),
            beatsToTicks: vi.fn(() => result),
            ticksToBeats: vi.fn(() => result),
            getTimeSignature: vi.fn(() => result),
        } as unknown as TimingApi;

        expect(secondsToTicks(timing, 1)).toBe(result);
        expect(ticksToSeconds(timing, 1)).toBe(result);
        expect(secondsToBeats(timing, 1)).toBe(result);
        expect(beatsToSeconds(timing, 1)).toBe(result);
        expect(beatsToTicks(timing, 1)).toBe(result);
        expect(ticksToBeats(timing, 1)).toBe(result);
        expect(getTimeSignature(timing)).toBe(result);
    });

    it('exposes every asset operation as a named function', async () => {
        const assets = {
            load: vi.fn(async () => result),
            project: vi.fn(() => result),
            bundledImage: vi.fn(() => result),
            bundledSparrow: vi.fn(() => result),
            bundledGridAtlas: vi.fn(() => result),
        } as unknown as AssetApi;
        const layout = { columns: 2, rows: 3 };

        await expect(loadAsset(assets, 'image.png')).resolves.toBe(result);
        expect(createProjectAssetHandle(assets)).toBe(result);
        expect(loadBundledImage(assets, 'image.png')).toBe(result);
        expect(loadBundledSparrow(assets, 'image.png', 'atlas.xml', 24)).toBe(result);
        expect(loadBundledGridAtlas(assets, 'image.png', layout)).toBe(result);
        expect(assets.bundledGridAtlas).toHaveBeenCalledWith('image.png', layout);
    });
});

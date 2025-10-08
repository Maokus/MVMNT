import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore, timelineCommandGateway } from '@state/timelineStore';
import { createPatchUndoController } from '@state/undo/patch-undo';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createAudioBufferStub(lengthSeconds: number, sampleRate = 48000): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(lengthSeconds * sampleRate));
    if (typeof AudioBuffer === 'function') {
        try {
            return new AudioBuffer({ length: frameCount, numberOfChannels: 1, sampleRate });
        } catch {}
    }
    const data = new Float32Array(frameCount);
    return {
        length: frameCount,
        duration: lengthSeconds,
        numberOfChannels: 1,
        sampleRate,
        copyFromChannel: () => {},
        copyToChannel: () => {},
        getChannelData: () => data,
    } as unknown as AudioBuffer;
}

function createFeatureCache(sourceId: string): AudioFeatureCache {
    const frameCount = 12;
    const hopTicks = 90;
    return {
        version: 1,
        audioSourceId: sourceId,
        hopTicks,
        hopSeconds: 0.03,
        frameCount,
        analysisParams: {
            windowSize: 512,
            hopSize: 256,
            overlap: 2,
            sampleRate: 48000,
            calculatorVersions: { 'mvmnt.waveform': 1 },
        },
        featureTracks: {
            waveform: {
                key: 'waveform',
                calculatorId: 'mvmnt.waveform',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds: 0.03,
                format: 'waveform-minmax',
                data: { min: new Float32Array(frameCount).fill(-0.25), max: new Float32Array(frameCount).fill(0.25) },
            },
        },
    };
}

describe('audio feature cache undo integration', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));
    });

    it('restores feature caches when undoing track removal', async () => {
        const buffer = createAudioBufferStub(1.0);
        const addResult = await timelineCommandGateway.dispatchById<{ trackId: string }>('timeline.addTrack', {
            type: 'audio',
            name: 'Undo Audio',
            buffer,
        });
        const trackId = addResult.result?.trackId ?? '';
        expect(trackId).toBeTruthy();
        const featureCache = createFeatureCache(trackId);
        useTimelineStore.getState().ingestAudioFeatureCache(trackId, featureCache);
        const controller = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        await timelineCommandGateway.dispatchById('timeline.removeTracks', { trackIds: [trackId] });
        expect(useTimelineStore.getState().audioFeatureCaches[trackId]).toBeUndefined();
        controller.undo();
        expect(useTimelineStore.getState().audioFeatureCaches[trackId]).toBeDefined();
        expect(useTimelineStore.getState().audioFeatureCacheStatus[trackId]?.state).toBe('ready');
        controller.redo();
        expect(useTimelineStore.getState().audioFeatureCaches[trackId]).toBeUndefined();
        controller.dispose();
    });
});

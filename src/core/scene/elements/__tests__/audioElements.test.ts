import { describe, expect, it, beforeEach } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-spectrum';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-volume-meter';
import { AudioOscilloscopeElement } from '@core/scene/elements/audio-oscilloscope';
import { ConstantBinding, AudioFeatureBinding } from '@bindings/property-bindings';
import { Poly } from '@core/render/render-objects';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createWaveformCache(trackId: string): AudioFeatureCache {
    const frameCount = 32;
    const hopTicks = 60;
    const min = new Float32Array(frameCount).fill(-0.5);
    const max = new Float32Array(frameCount).fill(0.5);
    return {
        version: 1,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds: 0.02,
        frameCount,
        analysisParams: {
            windowSize: 128,
            hopSize: 64,
            overlap: 2,
            sampleRate: 44100,
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
                hopSeconds: 0.02,
                format: 'waveform-minmax',
                data: { min, max },
            },
        },
    };
}

describe('audio scene elements', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                testTrack: {
                    id: 'testTrack',
                    name: 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: ['testTrack'],
        }));
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', createWaveformCache('testTrack'));
    });

    it('builds bar geometry for spectrum elements', () => {
        const element = new AudioSpectrumElement('spectrum');
        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [0.2, 0.4, 0.6],
                format: 'float32',
            }),
        );
        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(Array.isArray(container.children)).toBe(true);
        expect(container.children).toHaveLength(4);
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
        expect(container.children.slice(1).every((child: any) => child?.includeInLayoutBounds === false)).toBe(true);
    });

    it('builds volume meter rectangles', () => {
        const element = new AudioVolumeMeterElement('meter');
        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [0.75],
                format: 'float32',
            }),
        );
        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
    });

    it('samples waveform data for oscilloscope element', () => {
        const binding = new AudioFeatureBinding({
            trackId: 'testTrack',
            featureKey: 'waveform',
            calculatorId: 'mvmnt.waveform',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        const element = new AudioOscilloscopeElement('osc');
        element.setBinding('featureBinding', binding);
        const renderObjects = element.buildRenderObjects({}, 0.25);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(Array.isArray(container.children)).toBe(true);
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
        expect(container.children[1]).toBeInstanceOf(Poly);
        expect(container.children[1]?.includeInLayoutBounds).toBe(false);
    });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { buildDescriptorId, buildDescriptorMatchKey } from '@audio/features/analysisIntents';
import type { AnalysisIntent, AnalysisIntentDescriptor } from '@audio/features/analysisIntents';

const TEST_CALCULATORS = [
    {
        id: 'test.calc.featureA',
        featureKey: 'feature-a',
    },
    {
        id: 'test.calc.featureB',
        featureKey: 'feature-b',
    },
] as const;

function registerTestCalculators() {
    for (const calc of TEST_CALCULATORS) {
        audioFeatureCalculatorRegistry.unregister(calc.id);
        audioFeatureCalculatorRegistry.register({
            id: calc.id,
            version: 1,
            featureKey: calc.featureKey,
            label: `Test ${calc.featureKey}`,
            calculate: () => ({
                key: calc.featureKey,
                calculatorId: calc.id,
                version: 1,
                frameCount: 1,
                channels: 1,
                hopSeconds: 1,
                startTimeSeconds: 0,
                data: new Float32Array(1),
                format: 'float32',
            }),
        } as any);
    }
}

function unregisterTestCalculators() {
    for (const calc of TEST_CALCULATORS) {
        audioFeatureCalculatorRegistry.unregister(calc.id);
    }
}

function createTestDescriptor(index = 0): AnalysisIntentDescriptor {
    const calc = TEST_CALCULATORS[index % TEST_CALCULATORS.length];
    const descriptor = {
        featureKey: calc.featureKey,
        calculatorId: calc.id,
        bandIndex: null,
        analysisProfileId: null,
        requestedAnalysisProfileId: null,
        profileOverridesHash: null,
    } as const;
    return {
        id: buildDescriptorId(descriptor),
        descriptor,
        matchKey: buildDescriptorMatchKey(descriptor),
    };
}

function publishTestIntent(descriptors: AnalysisIntentDescriptor[]): void {
    const intent: AnalysisIntent = {
        elementId: 'element-1',
        elementType: 'test-element',
        trackRef: 'audio-track-1',
        analysisProfileId: null,
        descriptors,
        requestedAt: new Date().toISOString(),
        profileRegistryDelta: null,
    };
    useAudioDiagnosticsStore.getState().publishIntent(intent);
}

describe('audio diagnostics missing popup logic', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                'audio-track-1': {
                    id: 'audio-track-1',
                    name: 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: ['audio-track-1'],
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));
        useAudioDiagnosticsStore.getState().reset();
        registerTestCalculators();
    });

    afterEach(() => {
        unregisterTestCalculators();
    });

    it('shows the missing popup when descriptors are missing', () => {
        publishTestIntent([createTestDescriptor(0)]);
        const state = useAudioDiagnosticsStore.getState();
        expect(state.missingPopupVisible).toBe(true);
        expect(state.missingPopupSuppressed).toBe(false);
    });

    it('re-shows the popup when new missing descriptors appear after dismissal', () => {
        publishTestIntent([createTestDescriptor(0)]);
        useAudioDiagnosticsStore.getState().dismissMissingPopup();
        let state = useAudioDiagnosticsStore.getState();
        expect(state.missingPopupVisible).toBe(false);
        expect(state.missingPopupSuppressed).toBe(true);

        publishTestIntent([createTestDescriptor(0), createTestDescriptor(1)]);
        state = useAudioDiagnosticsStore.getState();
        expect(state.missingPopupVisible).toBe(true);
        expect(state.missingPopupSuppressed).toBe(false);
    });
});

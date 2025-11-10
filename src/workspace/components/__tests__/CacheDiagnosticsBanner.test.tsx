import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CacheDiagnosticsBanner } from '@workspace/components/CacheDiagnosticsBanner';
import { useTimelineStore } from '@state/timelineStore';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import {
    publishAnalysisIntent,
    resetAnalysisIntentStateForTests,
    buildDescriptorMatchKey,
} from '@audio/features/analysisIntents';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';

function setupAudioTrack() {
    act(() => {
        useTimelineStore.setState({
            tracks: {
                audioTrack: {
                    id: 'audioTrack',
                    name: 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: ['audioTrack'],
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
            reanalyzeAudioFeatureCalculators: vi.fn() as any,
            restartAudioFeatureAnalysis: vi.fn() as any,
        });
    });
}

describe('CacheDiagnosticsBanner', () => {
    beforeEach(() => {
        act(() => {
            useTimelineStore.getState().resetTimeline();
            useAudioDiagnosticsStore.getState().reset();
        });
        resetAnalysisIntentStateForTests();
        setupAudioTrack();
        audioFeatureCalculatorRegistry.unregister('test.spectrogram');
        audioFeatureCalculatorRegistry.register({
            id: 'test.spectrogram',
            version: 1,
            featureKey: 'spectrogram',
            label: 'Test Spectrogram',
            calculate: () => ({
                key: 'spectrogram',
                calculatorId: 'test.spectrogram',
                version: 1,
                frameCount: 1,
                channels: 1,
                hopSeconds: 1,
                startTimeSeconds: 0,
                data: new Float32Array(1),
                format: 'float32',
            }),
        });
    });

    afterEach(() => {
        act(() => {
            useAudioDiagnosticsStore.getState().reset();
            useTimelineStore.getState().resetTimeline();
        });
        resetAnalysisIntentStateForTests();
        vi.restoreAllMocks();
        audioFeatureCalculatorRegistry.unregister('test.spectrogram');
    });

    it('renders issues summary and triggers actions', () => {
        const descriptor = {
            featureKey: 'spectrogram',
            calculatorId: 'test.spectrogram',
            bandIndex: null,
            channel: null,
            smoothing: null,
        } as const;
        act(() => {
            publishAnalysisIntent(
                'element-banner',
                'audioSpectrum',
                'audioTrack',
                [descriptor],
                { profile: 'default' },
            );
        });

        const regenerateAllSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'regenerateAll');
        render(<CacheDiagnosticsBanner />);

        expect(screen.getByText(/Audio analysis updates recommended/i)).toBeInTheDocument();
        expect(screen.getByText(/1 descriptor requires regeneration/i)).toBeInTheDocument();

        act(() => {
            fireEvent.click(screen.getByRole('button', { name: /Regenerate All/i }));
        });
        expect(regenerateAllSpy).toHaveBeenCalledTimes(1);

        act(() => {
            fireEvent.click(screen.getByRole('button', { name: /Open Diagnostics/i }));
        });
        expect(useAudioDiagnosticsStore.getState().panelOpen).toBe(true);

        const link = screen.getByRole('link', { name: /Learn More/i });
        expect(link).toHaveAttribute('href', 'docs/audio-feature-bindings.md#cache-regeneration');

        const descriptorMatchKey = buildDescriptorMatchKey(descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:default`;
        const diffs = useAudioDiagnosticsStore.getState().diffs;
        expect(diffs[0]?.missing).toContain(descriptorKey);
    });
});

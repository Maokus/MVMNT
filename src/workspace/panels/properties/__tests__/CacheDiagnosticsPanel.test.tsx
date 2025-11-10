import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CacheDiagnosticsPanel } from '@workspace/panels/properties/CacheDiagnosticsPanel';
import { useTimelineStore } from '@state/timelineStore';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import {
    publishAnalysisIntent,
    resetAnalysisIntentStateForTests,
} from '@audio/features/analysisIntents';

function setupTimeline(reanalyzeSpy: ReturnType<typeof vi.fn>, restartSpy: ReturnType<typeof vi.fn>) {
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
            audioFeatureCaches: {
                audioTrack: {
                    version: 1,
                    audioSourceId: 'audioTrack',
                    hopSeconds: 0.01,
                    startTimeSeconds: 0,
                    frameCount: 0,
                    featureTracks: {},
                    analysisParams: {
                        windowSize: 512,
                        hopSize: 256,
                        overlap: 2,
                        sampleRate: 48000,
                        calculatorVersions: {},
                    },
                    analysisProfiles: {
                        default: {
                            id: 'default',
                            windowSize: 512,
                            hopSize: 256,
                            overlap: 2,
                            sampleRate: 48000,
                        },
                    },
                    defaultAnalysisProfileId: 'default',
                    channelAliases: ['Mono'],
                },
            },
            audioFeatureCacheStatus: {
                audioTrack: { state: 'ready', updatedAt: Date.now() },
            },
            reanalyzeAudioFeatureCalculators: reanalyzeSpy as any,
            restartAudioFeatureAnalysis: restartSpy as any,
        });
    });
}

describe('CacheDiagnosticsPanel', () => {
    beforeEach(() => {
        act(() => {
            useTimelineStore.getState().resetTimeline();
            useAudioDiagnosticsStore.getState().reset();
        });
        resetAnalysisIntentStateForTests();
    });

    afterEach(() => {
        act(() => {
            useAudioDiagnosticsStore.getState().reset();
            useTimelineStore.getState().resetTimeline();
        });
        resetAnalysisIntentStateForTests();
        vi.restoreAllMocks();
    });

    it('queues targeted regeneration when selecting a descriptor', async () => {
        const reanalyzeSpy = vi.fn();
        const restartSpy = vi.fn();
        setupTimeline(reanalyzeSpy, restartSpy);

        const spectrogram = {
            featureKey: 'spectrogram',
            calculatorId: 'calc.spectrogram',
            bandIndex: null,
            channel: null,
            smoothing: null,
        } as const;
        const rms = {
            featureKey: 'rms',
            calculatorId: 'calc.rms',
            bandIndex: null,
            channel: null,
            smoothing: null,
        } as const;

        act(() => {
            publishAnalysisIntent(
                'panel-element',
                'audioSpectrum',
                'audioTrack',
                [spectrogram, rms],
                { profile: 'default' },
            );
        });

        render(<CacheDiagnosticsPanel />);

        const toggle = screen.getByRole('button', { name: /Cache diagnostics/i });
        act(() => {
            fireEvent.click(toggle);
        });

        const spectrogramLabel = screen.getByText(/spectrogram/i);
        const spectrogramRow = spectrogramLabel.parentElement?.parentElement;
        expect(spectrogramRow).toBeTruthy();
        const regenerateSpectrogram = within(spectrogramRow as HTMLElement).getByRole('button', { name: /Regenerate/i });

        const rmsLabel = screen.getByText(/rms/i);
        const rmsRow = rmsLabel.parentElement?.parentElement;
        expect(rmsRow).toBeTruthy();
        const regenerateRms = within(rmsRow as HTMLElement).getByRole('button', { name: /Regenerate/i });
        expect(regenerateRms).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(regenerateSpectrogram);
        });

        await waitFor(() => {
            expect(reanalyzeSpy).toHaveBeenCalledTimes(1);
        });
        expect(reanalyzeSpy).toHaveBeenCalledWith('audioTrack', ['calc.spectrogram'], 'default');
        expect(restartSpy).not.toHaveBeenCalled();

        expect(within(rmsRow as HTMLElement).getByRole('button', { name: /Regenerate/i })).toBe(regenerateRms);
    });
});

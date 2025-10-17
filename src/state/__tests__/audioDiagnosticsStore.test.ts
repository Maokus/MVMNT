import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishAnalysisIntent, resetAnalysisIntentStateForTests, buildDescriptorId } from '@audio/features/analysisIntents';
import { useTimelineStore } from '@state/timelineStore';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';

function resetStores() {
    useTimelineStore.getState().resetTimeline();
    useAudioDiagnosticsStore.getState().reset();
    resetAnalysisIntentStateForTests();
}

describe('audio diagnostics store', () => {
    beforeEach(() => {
        resetStores();
    });

    it('computes missing descriptors for published intents', () => {
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
        });

        publishAnalysisIntent(
            'element-1',
            'audioSpectrum',
            'audioTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'default' },
        );

        const diffs = useAudioDiagnosticsStore.getState().diffs;
        expect(diffs).toHaveLength(1);
        const diff = diffs[0];
        expect(diff.trackRef).toBe('audioTrack');
        expect(diff.analysisProfileId).toBe('default');
        const descriptorId = buildDescriptorId({ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' });
        expect(diff.missing).toContain(descriptorId);
    });

    it('queues regeneration jobs and records history', async () => {
        const reanalyzeSpy = vi.fn();
        const restartSpy = vi.fn();
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
            audioCache: {} as any,
            reanalyzeAudioFeatureCalculators: reanalyzeSpy as any,
            restartAudioFeatureAnalysis: restartSpy as any,
        });

        publishAnalysisIntent(
            'element-2',
            'audioSpectrum',
            'audioTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'default' },
        );

        const descriptorId = buildDescriptorId({ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' });
        useAudioDiagnosticsStore
            .getState()
            .regenerateDescriptors('audioTrack', 'default', [descriptorId], 'manual');

        expect(useAudioDiagnosticsStore.getState().jobs.length).toBe(1);
        const queuedJob = useAudioDiagnosticsStore.getState().jobs[0];
        expect(['queued', 'running']).toContain(queuedJob.status);
        const pendingForTrack = useAudioDiagnosticsStore.getState().pendingDescriptors[`audioTrack__default`];
        expect(pendingForTrack).toBeDefined();
        expect(Array.from(pendingForTrack ?? [])).toContain(descriptorId);

        // Allow microtask queue to process the job runner
        await Promise.resolve();
        await Promise.resolve();

        const { jobs, history } = useAudioDiagnosticsStore.getState();
        expect(jobs[0].status === 'succeeded' || jobs[0].status === 'failed').toBe(true);
        expect(history.length).toBeGreaterThan(0);
        const lastHistory = history[history.length - 1];
        expect(lastHistory.descriptorIds).toContain(descriptorId);
        expect(lastHistory.action).toBe('manual_regenerate');
        expect(reanalyzeSpy).toHaveBeenCalledTimes(1);
        expect(restartSpy).not.toHaveBeenCalled();
        expect(useAudioDiagnosticsStore.getState().pendingDescriptors[`audioTrack__default`]).toBeUndefined();
    });
});

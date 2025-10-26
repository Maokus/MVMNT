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
        const detail = diff.descriptorDetails[descriptorId];
        expect(detail.descriptor.featureKey).toBe('spectrogram');
        expect(detail.channelCount).toBeNull();
        expect(detail.channelAliases).toBeNull();
        expect(detail.channelLayout).toBeNull();
    });

    it('includes channel metadata when cache provides it', () => {
        const cacheUpdatedAt = Date.now();
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
                    frameCount: 128,
                    featureTracks: {
                        spectrogram: {
                            key: 'spectrogram',
                            calculatorId: 'test.spectrogram',
                            version: 1,
                            frameCount: 128,
                            channels: 2,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                            format: 'float32',
                            channelLayout: { aliases: ['Left', 'Right'], semantics: 'stereo' },
                        } as any,
                    },
                    analysisParams: {
                        windowSize: 1024,
                        hopSize: 512,
                        overlap: 0.5,
                        smoothing: 0,
                        sampleRate: 44100,
                        calculatorVersions: { 'test.spectrogram': 1 },
                    },
                    analysisProfiles: {
                        default: {
                            id: 'default',
                            windowSize: 1024,
                            hopSize: 512,
                            overlap: 0.5,
                            sampleRate: 44100,
                        },
                    },
                    defaultAnalysisProfileId: 'default',
                    updatedAt: cacheUpdatedAt,
                } as any,
            },
            audioFeatureCacheStatus: {
                audioTrack: { state: 'ready', updatedAt: cacheUpdatedAt },
            },
        });

        publishAnalysisIntent(
            'element-meta',
            'audioSpectrum',
            'audioTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'default' },
        );

        const diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.trackRef === 'audioTrack');
        expect(diff).toBeDefined();
        const descriptorId = buildDescriptorId({ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' });
        const detail = diff?.descriptorDetails[descriptorId];
        expect(detail).toBeDefined();
        expect(detail?.channelCount).toBe(2);
        expect(detail?.channelAliases).toEqual(['Left', 'Right']);
        expect(detail?.channelLayout?.semantics).toBe('stereo');
    });

    it('queues regeneration jobs and records history', async () => {
        const reanalyzeSpy = vi.fn();
        const restartSpy = vi.fn();
        const cacheUpdatedAt = Date.now();
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
            audioFeatureCaches: {
                audioTrack: {
                    version: 1,
                    audioSourceId: 'audioTrack',
                    hopSeconds: 0.01,
                    startTimeSeconds: 0,
                    frameCount: 128,
                    featureTracks: {
                        spectrogram: {
                            key: 'spectrogram',
                            calculatorId: 'test.spectrogram',
                            version: 1,
                            frameCount: 128,
                            channels: 2,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                            format: 'float32',
                            channelLayout: { aliases: ['Left', 'Right'], semantics: 'stereo' },
                        } as any,
                    },
                    analysisParams: {
                        windowSize: 1024,
                        hopSize: 512,
                        overlap: 0.5,
                        smoothing: 0,
                        sampleRate: 44100,
                        calculatorVersions: { 'test.spectrogram': 1 },
                    },
                    analysisProfiles: {
                        default: {
                            id: 'default',
                            windowSize: 1024,
                            hopSize: 512,
                            overlap: 0.5,
                            sampleRate: 44100,
                        },
                    },
                    defaultAnalysisProfileId: 'default',
                    updatedAt: cacheUpdatedAt,
                } as any,
            },
            audioFeatureCacheStatus: {
                audioTrack: { state: 'ready', updatedAt: cacheUpdatedAt },
            },
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

    it('prunes extraneous cached feature tracks', () => {
        const updatedAt = Date.now();
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
                    version: 3,
                    audioSourceId: 'audioTrack',
                    hopSeconds: 0.01,
                    startTimeSeconds: 0,
                    frameCount: 64,
                    featureTracks: {
                        rms: {
                            key: 'rms',
                            calculatorId: 'mvmnt.rms',
                            version: 1,
                            frameCount: 64,
                            channels: 1,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                            format: 'float32',
                        } as any,
                        spectrogram: {
                            key: 'spectrogram',
                            calculatorId: 'mvmnt.spectrogram',
                            version: 1,
                            frameCount: 64,
                            channels: 2,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                            format: 'float32',
                        } as any,
                    },
                    analysisParams: {
                        windowSize: 1024,
                        hopSize: 512,
                        overlap: 0.5,
                        sampleRate: 44100,
                        calculatorVersions: { 'mvmnt.rms': 1, 'mvmnt.spectrogram': 1 },
                    },
                    analysisProfiles: {
                        default: {
                            id: 'default',
                            windowSize: 1024,
                            hopSize: 512,
                            overlap: 0.5,
                            sampleRate: 44100,
                        },
                    },
                    defaultAnalysisProfileId: 'default',
                    updatedAt,
                } as any,
            },
            audioFeatureCacheStatus: {
                audioTrack: { state: 'ready', updatedAt },
            },
        });

        publishAnalysisIntent(
            'element-rms',
            'audioWaveform',
            'audioTrack',
            [{ featureKey: 'rms', calculatorId: 'mvmnt.rms' }],
            { profile: 'default' },
        );

        const extraneousId = buildDescriptorId({ featureKey: 'spectrogram', calculatorId: 'mvmnt.spectrogram' });
        let diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.trackRef === 'audioTrack');
        expect(diff?.extraneous).toContain(extraneousId);

        useAudioDiagnosticsStore.getState().deleteExtraneousCaches();

        const cache = useTimelineStore.getState().audioFeatureCaches['audioTrack'];
        expect(Object.keys(cache?.featureTracks ?? {})).toEqual(['rms']);

        diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.trackRef === 'audioTrack');
        expect(diff?.extraneous ?? []).toHaveLength(0);
    });
});

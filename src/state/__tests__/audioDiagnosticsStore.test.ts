import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    publishAnalysisIntent,
    resetAnalysisIntentStateForTests,
    buildDescriptorMatchKey,
} from '@audio/features/analysisIntents';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { useTimelineStore } from '@state/timelineStore';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { buildFeatureTrackKey, sanitizeAnalysisProfileId } from '@audio/features/featureTrackIdentity';

function resetStores() {
    useTimelineStore.getState().resetTimeline();
    useAudioDiagnosticsStore.getState().reset();
    resetAnalysisIntentStateForTests();
}

describe('audio diagnostics store', () => {
    beforeEach(() => {
        resetStores();
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
        audioFeatureCalculatorRegistry.unregister('test.spectrogram');
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
            { profile: 'default' }
        );

        const diffs = useAudioDiagnosticsStore.getState().diffs;
        expect(diffs).toHaveLength(1);
        const diff = diffs[0];
        expect(diff.trackRefs).toEqual(['audioTrack']);
        expect(diff.analysisProfileId).toBe('default');
        const descriptor = { featureKey: 'spectrogram', calculatorId: 'test.spectrogram' } as const;
        const descriptorMatchKey = buildDescriptorMatchKey(descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:default`;
        expect(diff.missing).toContain(descriptorKey);
        const detail = diff.descriptorDetails[descriptorKey];
        expect(detail.descriptor.featureKey).toBe('spectrogram');
        expect(detail.channelCount).toBeNull();
        expect(detail.channelAliases).toBeNull();
        expect(detail.channelLayout).toBeNull();
        expect(detail.analysisProfileId).toBe('default');
    });

    it('tracks profile override descriptors with unique identities', () => {
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

        const fast = createFeatureDescriptor({
            feature: 'spectrogram',
            profileParams: { windowSize: 512 },
        });
        const slow = createFeatureDescriptor({
            feature: 'spectrogram',
            profileParams: { windowSize: 4096 },
        });

        publishAnalysisIntent('element-adhoc', 'audioSpectrum', 'audioTrack', [fast.descriptor, slow.descriptor]);

        const diff = useAudioDiagnosticsStore.getState().diffs[0];
        expect(diff).toBeDefined();

        const fastMatchKey = buildDescriptorMatchKey(fast.descriptor);
        const slowMatchKey = buildDescriptorMatchKey(slow.descriptor);
        const fastProfileKey = sanitizeAnalysisProfileId(fast.descriptor.analysisProfileId) ?? 'default';
        const slowProfileKey = sanitizeAnalysisProfileId(slow.descriptor.analysisProfileId) ?? 'default';
        const fastKey = `${fastMatchKey}|profile:${fastProfileKey}|hash:${fast.descriptor.profileOverridesHash}`;
        const slowKey = `${slowMatchKey}|profile:${slowProfileKey}|hash:${slow.descriptor.profileOverridesHash}`;

        expect(fastKey).not.toBe(slowKey);
        expect(diff.descriptorsRequested).toEqual(expect.arrayContaining([fastKey, slowKey]));
        expect(diff.missing).toEqual(expect.arrayContaining([fastKey, slowKey]));
        expect(diff.descriptorDetails[fastKey]?.analysisProfileId).toBe(fast.descriptor.analysisProfileId);
        expect(diff.descriptorDetails[slowKey]?.analysisProfileId).toBe(slow.descriptor.analysisProfileId);
    });

    it('matches cached adhoc profile descriptors to pending requests', () => {
        const cacheUpdatedAt = Date.now();
        const adhoc = createFeatureDescriptor({
            feature: 'spectrogram',
            profileParams: { windowSize: 4096, hopSize: 1024 },
        });
        const analysisProfileId = adhoc.descriptor.analysisProfileId ?? 'default';
        const profileKey = sanitizeAnalysisProfileId(analysisProfileId) ?? 'default';
        const descriptorMatchKey = buildDescriptorMatchKey(adhoc.descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:${profileKey}|hash:${adhoc.descriptor.profileOverridesHash}`;

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
                        [adhoc.descriptor.featureKey ?? 'spectrogram']: {
                            key: buildFeatureTrackKey(adhoc.descriptor.featureKey ?? 'spectrogram', analysisProfileId),
                            calculatorId: adhoc.descriptor.calculatorId ?? 'test.spectrogram',
                            version: 1,
                            frameCount: 128,
                            channels: 1,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                            format: 'float32',
                            analysisProfileId,
                        } as any,
                    },
                    analysisParams: {
                        windowSize: 4096,
                        hopSize: 1024,
                        overlap: 4,
                        sampleRate: 44100,
                        calculatorVersions: { [adhoc.descriptor.calculatorId ?? 'test.spectrogram']: 1 },
                    },
                    analysisProfiles: {
                        [analysisProfileId]: {
                            id: analysisProfileId,
                            windowSize: 4096,
                            hopSize: 1024,
                            overlap: 4,
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

        publishAnalysisIntent('element-adhoc', 'audioSpectrum', 'audioTrack', [adhoc.descriptor]);

        const diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.audioSourceId === 'audioTrack');
        expect(diff).toBeDefined();
        expect(diff?.missing).not.toContain(descriptorKey);
        expect(diff?.stale).not.toContain(descriptorKey);
        expect(diff?.badRequest).not.toContain(descriptorKey);
        expect(diff?.descriptorsCached).toContain(descriptorKey);
        expect(diff?.descriptorDetails[descriptorKey]?.analysisProfileId).toBe(analysisProfileId);
        expect(diff?.status).toBe('clear');
    });

    it('flags unsupported descriptors as bad requests', () => {
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
            'element-unsupported',
            'audioSpectrum',
            'audioTrack',
            [{ featureKey: 'mystery-feature', calculatorId: 'com.example.mystery' }],
            { profile: 'alt' }
        );

        const diff = useAudioDiagnosticsStore.getState().diffs[0];
        const descriptor = {
            featureKey: 'mystery-feature',
            calculatorId: 'com.example.mystery',
        } as const;
        const descriptorMatchKey = buildDescriptorMatchKey(descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:alt`;
        expect(diff.badRequest).toContain(descriptorKey);
        expect(diff.missing).not.toContain(descriptorKey);
        expect(diff.stale).not.toContain(descriptorKey);
        const detail = diff.descriptorDetails[descriptorKey];
        expect(detail.analysisProfileId).toBe('alt');
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
            { profile: 'default' }
        );

        const diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.audioSourceId === 'audioTrack');
        expect(diff).toBeDefined();
        const descriptor = { featureKey: 'spectrogram', calculatorId: 'test.spectrogram' } as const;
        const descriptorMatchKey = buildDescriptorMatchKey(descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:default`;
        const detail = diff?.descriptorDetails[descriptorKey];
        expect(detail).toBeDefined();
        expect(detail?.channelCount).toBe(2);
        expect(detail?.channelAliases).toEqual(['Left', 'Right']);
        expect(detail?.channelLayout?.semantics).toBe('stereo');
        expect(detail?.analysisProfileId).toBe('default');
    });

    it('groups cache diffs by audio source when tracks share a source', () => {
        useTimelineStore.setState({
            tracks: {
                sourceTrack: {
                    id: 'sourceTrack',
                    name: 'Source Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
                linkedTrack: {
                    id: 'linkedTrack',
                    name: 'Linked Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                    audioSourceId: 'sourceTrack',
                },
            },
            tracksOrder: ['sourceTrack', 'linkedTrack'],
        });

        publishAnalysisIntent(
            'element-source',
            'audioSpectrum',
            'sourceTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'default' }
        );
        publishAnalysisIntent(
            'element-linked',
            'audioSpectrum',
            'linkedTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'default' }
        );

        const diffs = useAudioDiagnosticsStore.getState().diffs;
        expect(diffs).toHaveLength(1);
        const diff = diffs[0];
        expect(diff.audioSourceId).toBe('sourceTrack');
        expect(diff.trackRefs).toEqual(['linkedTrack', 'sourceTrack']);
        const descriptor = { featureKey: 'spectrogram', calculatorId: 'test.spectrogram' } as const;
        const descriptorMatchKey = buildDescriptorMatchKey(descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:default`;
        expect(diff.missing).toContain(descriptorKey);
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
            { profile: 'default' }
        );

        const descriptor = { featureKey: 'spectrogram', calculatorId: 'test.spectrogram' } as const;
        const descriptorMatchKey = buildDescriptorMatchKey(descriptor);
        const descriptorKey = `${descriptorMatchKey}|profile:default`;
        useAudioDiagnosticsStore.getState().regenerateDescriptors('audioTrack', 'default', [descriptorKey], 'manual');

        expect(useAudioDiagnosticsStore.getState().jobs.length).toBe(1);
        const queuedJob = useAudioDiagnosticsStore.getState().jobs[0];
        expect(['queued', 'running']).toContain(queuedJob.status);
        const pendingForTrack = useAudioDiagnosticsStore.getState().pendingDescriptors[`audioTrack__default`];
        expect(pendingForTrack).toBeDefined();
        expect(Array.from(pendingForTrack ?? [])).toContain(descriptorKey);

        // Allow microtask queue to process the job runner
        await Promise.resolve();
        await Promise.resolve();

        const { jobs, history } = useAudioDiagnosticsStore.getState();
        expect(jobs[0].status === 'succeeded' || jobs[0].status === 'failed').toBe(true);
        expect(history.length).toBeGreaterThan(0);
        const lastHistory = history[history.length - 1];
        expect(lastHistory.descriptorIds).toContain(descriptorKey);
        expect(lastHistory.action).toBe('manual_regenerate');
        expect(reanalyzeSpy).toHaveBeenCalledWith('audioTrack', ['test.spectrogram'], 'default');
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
            { profile: 'default' }
        );

        const extraneousDescriptor = {
            featureKey: 'spectrogram',
            calculatorId: 'mvmnt.spectrogram',
        } as const;
        const extraneousMatchKey = buildDescriptorMatchKey(extraneousDescriptor);
        const extraneousKey = `${extraneousMatchKey}|profile:default`;
        let diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.audioSourceId === 'audioTrack');
        expect(diff?.extraneous).toContain(extraneousKey);

        useAudioDiagnosticsStore.getState().deleteExtraneousCaches();

        const cache = useTimelineStore.getState().audioFeatureCaches['audioTrack'];
        expect(Object.keys(cache?.featureTracks ?? {})).toEqual(['rms']);

        diff = useAudioDiagnosticsStore.getState().diffs.find((entry) => entry.audioSourceId === 'audioTrack');
        expect(diff?.extraneous ?? []).toHaveLength(0);
    });

    it('marks cached descriptors as extraneous when no elements reference the audio source', () => {
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
                    version: 1,
                    audioSourceId: 'audioTrack',
                    hopSeconds: 0.01,
                    startTimeSeconds: 0,
                    frameCount: 32,
                    featureTracks: {
                        spectrogram: {
                            key: 'spectrogram',
                            calculatorId: 'mvmnt.spectrogram',
                            version: 1,
                            frameCount: 32,
                            channels: 1,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                            format: 'float32',
                        } as any,
                    },
                    analysisParams: {
                        windowSize: 512,
                        hopSize: 256,
                        overlap: 0.5,
                        sampleRate: 44100,
                        calculatorVersions: { 'mvmnt.spectrogram': 1 },
                    },
                    analysisProfiles: {
                        default: {
                            id: 'default',
                            windowSize: 512,
                            hopSize: 256,
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

        useAudioDiagnosticsStore.getState().recomputeDiffs();

        const diff = useAudioDiagnosticsStore
            .getState()
            .diffs.find((entry) => entry.audioSourceId === 'audioTrack' && entry.analysisProfileId === 'default');

        expect(diff).toBeDefined();
        expect(diff?.descriptorsRequested).toEqual([]);
        const descriptor = {
            featureKey: 'spectrogram',
            calculatorId: 'mvmnt.spectrogram',
        } as const;
        const extraneousKey = `${buildDescriptorMatchKey(descriptor)}|profile:default`;
        expect(diff?.extraneous).toContain(extraneousKey);
        expect(diff?.status).toBe('issues');
        expect(diff?.trackRefs).toEqual(['audioTrack']);
    });

    it('clears dismissed extraneous entries when descriptors become required', () => {
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
                    version: 1,
                    audioSourceId: 'audioTrack',
                    hopSeconds: 0.01,
                    startTimeSeconds: 0,
                    frameCount: 32,
                    featureTracks: {
                        spectrogram: {
                            key: 'spectrogram',
                            calculatorId: 'test.spectrogram',
                            version: 1,
                            frameCount: 32,
                            channels: 1,
                            hopSeconds: 0.01,
                            startTimeSeconds: 0,
                            data: new Float32Array(0),
                        } as any,
                    },
                    defaultAnalysisProfileId: 'default',
                    analysisParams: {
                        windowSize: 512,
                        hopSize: 256,
                        overlap: 0.5,
                        sampleRate: 44100,
                        calculatorVersions: { 'test.spectrogram': 1 },
                    },
                    updatedAt,
                } as any,
            },
            audioFeatureCacheStatus: {
                audioTrack: { state: 'ready', updatedAt },
            },
        });

        publishAnalysisIntent(
            'element-initial',
            'audioSpectrum',
            'audioTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'alt' }
        );

        const initialDiff = useAudioDiagnosticsStore
            .getState()
            .diffs.find((entry) => entry.audioSourceId === 'audioTrack');
        expect(initialDiff?.extraneous.length).toBeGreaterThan(0);
        const extraneousKey = initialDiff?.extraneous[0];
        expect(extraneousKey).toBeDefined();

        if (extraneousKey) {
            useAudioDiagnosticsStore
                .getState()
                .dismissExtraneous('audioTrack', initialDiff?.analysisProfileId ?? null, extraneousKey);
        }

        useTimelineStore.setState((state) => ({
            ...state,
            audioFeatureCaches: {
                ...state.audioFeatureCaches,
                audioTrack: {
                    ...(state.audioFeatureCaches?.audioTrack as any),
                    featureTracks: {},
                },
            },
        }));

        publishAnalysisIntent(
            'element-requires-spectrogram',
            'audioSpectrum',
            'audioTrack',
            [{ featureKey: 'spectrogram', calculatorId: 'test.spectrogram' }],
            { profile: 'default' }
        );

        const nextState = useAudioDiagnosticsStore.getState();
        const dismissalKey = `${buildDescriptorMatchKey({
            featureKey: 'spectrogram',
            calculatorId: 'test.spectrogram',
        } as const)}|profile:default`;
        const dismissalSet = nextState.dismissedExtraneous['audioTrack__default'];
        expect(dismissalSet).toBeUndefined();
        const diff = nextState.diffs.find(
            (entry) => entry.audioSourceId === 'audioTrack' && entry.analysisProfileId === 'default'
        );
        expect(diff?.missing).toContain(dismissalKey);
    });
});

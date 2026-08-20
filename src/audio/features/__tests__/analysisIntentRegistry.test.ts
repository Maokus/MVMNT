import { afterEach, describe, expect, it } from 'vitest';
import {
    beginAnalysisIntentRestore,
    getAnalysisIntentSnapshot,
    mergePersistedAnalysisIntents,
    publishAnalysisIntent,
    resetAnalysisIntentStateForTests,
} from '../analysisIntents';
import { createFeatureDescriptor } from '../descriptorBuilder';

afterEach(() => resetAnalysisIntentStateForTests());

describe('analysis intent registry', () => {
    it('round-trips custom-profile demands as a retained fallback', () => {
        const custom = createFeatureDescriptor({
            feature: 'spectrogram',
            profileParams: { windowSize: 4096, hopSize: 256 },
        });
        publishAnalysisIntent(
            'element-1::audio-feature::spectrogram',
            'plugin:spectrogram',
            'audio-track',
            [custom.descriptor],
            {
                ownerElementId: 'element-1',
                requestId: 'spectrogram',
                declarative: true,
                profile: custom.profile,
                profileRegistryDelta: custom.profileRegistryDelta,
            }
        );
        const persisted = getAnalysisIntentSnapshot();

        beginAnalysisIntentRestore();
        expect(getAnalysisIntentSnapshot()).toEqual([]);
        mergePersistedAnalysisIntents(persisted);

        expect(getAnalysisIntentSnapshot()).toEqual([
            expect.objectContaining({
                ownerElementId: 'element-1',
                requestId: 'spectrogram',
                declarative: true,
                trackRef: 'audio-track',
                descriptors: [
                    expect.objectContaining({
                        descriptor: expect.objectContaining({
                            profileOverridesHash: custom.descriptor.profileOverridesHash,
                        }),
                    }),
                ],
            }),
        ]);
    });

    it('does not overwrite an authoritative runtime declaration with a persisted fallback', () => {
        const fallback = createFeatureDescriptor({ feature: 'spectrogram', profileParams: { windowSize: 4096 } });
        const runtime = createFeatureDescriptor({ feature: 'spectrogram', profileParams: { windowSize: 8192 } });
        const persisted = [
            {
                elementId: 'element-1::audio-feature::spectrogram',
                ownerElementId: 'element-1',
                requestId: 'spectrogram',
                declarative: true,
                elementType: 'plugin:spectrogram',
                trackRef: 'old-track',
                analysisProfileId: fallback.profile,
                descriptors: [
                    { id: 'spectrogram', descriptor: fallback.descriptor, matchKey: 'match:feature:spectrogram' },
                ],
            },
        ];

        publishAnalysisIntent(
            'element-1::audio-feature::spectrogram',
            'plugin:spectrogram',
            'new-track',
            [runtime.descriptor],
            {
                ownerElementId: 'element-1',
                requestId: 'spectrogram',
                declarative: true,
                profile: runtime.profile,
            }
        );
        mergePersistedAnalysisIntents(persisted);

        expect(getAnalysisIntentSnapshot()[0]).toMatchObject({
            trackRef: 'new-track',
            descriptors: [{ descriptor: { profileOverridesHash: runtime.descriptor.profileOverridesHash } }],
        });
    });
});

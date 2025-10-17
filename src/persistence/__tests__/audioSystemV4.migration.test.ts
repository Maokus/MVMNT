import { describe, it, expect } from 'vitest';
import { migrateSceneAudioSystemV4, verifySceneAudioSystemV4 } from '../migrations/audioSystemV4';

describe('audioSystemV4 migration', () => {
    it('migrates binding descriptors into smoothing bindings', () => {
        const before = {
            elements: {
                spectrum: { id: 'spectrum', type: 'audioSpectrum' },
            },
            bindings: {
                byElement: {
                    spectrum: {
                        features: {
                            type: 'constant',
                            value: [
                                {
                                    featureKey: 'spectrogram',
                                    calculatorId: 'calc',
                                    smoothing: 4,
                                    channelIndex: 1,
                                },
                            ],
                        },
                    },
                },
            },
        };

        const after = migrateSceneAudioSystemV4(before);
        const migrated = (after.bindings as any).byElement.spectrum;
        expect(migrated.features.value[0]).not.toHaveProperty('smoothing');
        expect(migrated.features.value[0].channel).toBe(1);
        expect(migrated.smoothing).toEqual({ type: 'constant', value: 4 });
    });

    it('removes config audioFeatures and normalizes smoothing', () => {
        const before = {
            scene: {
                elements: [
                    {
                        id: 'osc',
                        type: 'audioOscilloscope',
                        config: {
                            audioFeatures: [
                                { featureKey: 'waveform', smoothing: 2.5, channelAlias: 'Left' },
                                { featureKey: 'waveform', smoothing: 8 },
                            ],
                        },
                    },
                ],
            },
        };

        const after = migrateSceneAudioSystemV4(before);
        const element = (after.scene as any).elements[0];
        expect(element.config.audioFeatures).toBeUndefined();
        expect(element.config.smoothing).toBe(2.5);
        expect(Array.isArray(element.config.features)).toBe(true);
        expect(element.config.features[0]).not.toHaveProperty('smoothing');
    });

    it('verifies migration invariants', () => {
        const before = {
            elements: [
                {
                    id: 'meter',
                    type: 'audioVolumeMeter',
                    bindings: {
                        features: {
                            type: 'constant',
                            value: [{ featureKey: 'loudness', smoothing: 6 }],
                        },
                    },
                },
            ],
        };

        const after = migrateSceneAudioSystemV4(before);
        expect(verifySceneAudioSystemV4(before, after)).toBe(true);
        expect(verifySceneAudioSystemV4(before, before)).toBe(false);
    });
});

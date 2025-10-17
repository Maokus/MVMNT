import { describe, expect, it } from 'vitest';
import { deserializeElementBindings, type SceneSerializedElement } from '@state/sceneStore';

describe('sceneStore descriptor smoothing migration', () => {
    it('moves descriptor smoothing to the element smoothing binding', () => {
        const raw: SceneSerializedElement = {
            id: 'spectrum',
            type: 'audioSpectrum',
            features: {
                type: 'constant',
                value: [
                    {
                        featureKey: 'spectrogram',
                        calculatorId: 'calc.spectrogram',
                        bandIndex: null,
                        channel: null,
                        smoothing: 6,
                    },
                ],
            },
        };

        const bindings = deserializeElementBindings(raw);

        expect(bindings.features).toEqual({
            type: 'constant',
            value: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'calc.spectrogram',
                    bandIndex: null,
                    channel: null,
                },
            ],
        });
        expect(bindings.smoothing).toEqual({ type: 'constant', value: 6 });
    });

    it('does not override an explicit smoothing binding', () => {
        const raw: SceneSerializedElement = {
            id: 'meter',
            type: 'audioVolumeMeter',
            features: {
                type: 'constant',
                value: [
                    {
                        featureKey: 'rms',
                        smoothing: 8,
                    },
                ],
            },
            smoothing: { type: 'constant', value: 2 },
        };

        const bindings = deserializeElementBindings(raw);

        expect(bindings.features).toEqual({
            type: 'constant',
            value: [
                {
                    featureKey: 'rms',
                    calculatorId: null,
                    bandIndex: null,
                    channel: null,
                },
            ],
        });
        expect(bindings.smoothing).toEqual({ type: 'constant', value: 2 });
    });
});

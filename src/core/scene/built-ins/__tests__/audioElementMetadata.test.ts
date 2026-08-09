import { afterEach, describe, expect, it } from 'vitest';
import {
    getFeatureRequirements,
    registerFeatureRequirements,
    registerFeatureRequirementsForElement,
    resetFeatureRequirementsForTests,
} from '@audio/audioElementMetadata';

describe('audioElementMetadata', () => {
    afterEach(() => {
        resetFeatureRequirementsForTests();
    });

    it('returns registered requirements for an element type', () => {
        registerFeatureRequirements('testElement', [
            { feature: 'spectrogram' },
            { feature: 'waveform', calculatorId: 'custom.wave' },
        ]);

        const requirements = getFeatureRequirements('testElement');
        expect(requirements).toEqual([
            { feature: 'spectrogram' },
            { feature: 'waveform', calculatorId: 'custom.wave' },
        ]);
    });

    it('clones requirements to avoid mutation leaks', () => {
        const requirement = { feature: 'rms' } as const;
        registerFeatureRequirements('meter', [requirement]);

        const [resolved] = getFeatureRequirements('meter');
        expect(resolved).toEqual(requirement);

        (resolved as any).feature = 'mutated';
        const [next] = getFeatureRequirements('meter');
        expect(next).toEqual(requirement);
    });

    it('registers requirements from an element constructor type', () => {
        class TestElement {
            static readonly elementType = 'typedElement' as const;
        }
        registerFeatureRequirementsForElement(TestElement, [{ feature: 'rms' }]);
        expect(getFeatureRequirements('typedElement')).toEqual([{ feature: 'rms' }]);
    });
});

import { describe, expect, it } from 'vitest';
import { migrateSceneAudioSystemV5, verifySceneAudioSystemV5 } from '../migrations/audioSystemV5';
import legacyProject from '../__fixtures__/legacyProjects/scene.audio-channel-selector.json';
import midSideFrame from '@audio/features/__fixtures__/mid-side-frame.json';
import { selectChannelSample } from '@audio/audioFeatureUtils';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';

type AnyRecord = Record<string, any>;

describe('audioSystemV5 migration', () => {
    function clone<T>(value: T): T {
        return JSON.parse(JSON.stringify(value));
    }

    function readConstant(binding: unknown): unknown {
        if (!binding || typeof binding !== 'object') {
            return binding;
        }
        const payload = binding as { type?: unknown; value?: unknown };
        if (payload.type === 'constant') {
            return payload.value;
        }
        return binding;
    }

    function readDescriptorArray(binding: unknown): AnyRecord[] {
        const resolved = readConstant(binding);
        if (!Array.isArray(resolved)) {
            return [];
        }
        return resolved as AnyRecord[];
    }

    it('migrates channel selectors into element configuration', () => {
        const before = clone(legacyProject);
        const after = migrateSceneAudioSystemV5(before);

        expect(after).not.toBe(before);
        expect(verifySceneAudioSystemV5(before, after)).toBe(true);

        const elements = (after.scene?.elements as AnyRecord[]) ?? [];
        const spectrum = elements.find((entry) => entry.id === 'spectrum') as AnyRecord | undefined;
        expect(spectrum).toBeDefined();
        const spectrumDescriptor = readDescriptorArray(spectrum?.features)[0];
        expect(spectrumDescriptor).toBeDefined();
        expect(spectrumDescriptor).not.toHaveProperty('channel');
        expect(readConstant(spectrum?.channelSelector)).toBe('Right');

        const meter = elements.find((entry) => entry.id === 'meter') as AnyRecord | undefined;
        expect(meter).toBeDefined();
        const meterDescriptor = readDescriptorArray(meter?.features)[0];
        expect(meterDescriptor).toBeDefined();
        expect(meterDescriptor).not.toHaveProperty('channelAlias');
        expect(readConstant(meter?.channelSelector)).toBe('Left');

        const scope = elements.find((entry) => entry.id === 'scope') as AnyRecord | undefined;
        expect(scope).toBeDefined();
        const scopeDescriptor = readDescriptorArray(scope?.features)[0];
        expect(scopeDescriptor).toBeDefined();
        expect(scopeDescriptor).not.toHaveProperty('channel');
        const scopeSelector = readConstant(scope?.channelSelector);
        expect(scopeSelector).toBe('side');

        const bindings = (after.bindings as { byElement?: Record<string, AnyRecord> })?.byElement ?? {};
        const meterBindings = bindings.meter as AnyRecord;
        expect(meterBindings).toBeDefined();
        const meterBindingDescriptor = readDescriptorArray(meterBindings.features)[0];
        expect(meterBindingDescriptor).toBeDefined();
        expect(meterBindingDescriptor).not.toHaveProperty('channelIndex');

        const scopeBindings = bindings.scope as AnyRecord;
        expect(scopeBindings).toBeDefined();
        const scopeBindingDescriptor = readDescriptorArray(scopeBindings.features)[0];
        expect(scopeBindingDescriptor).toBeDefined();
        expect(scopeBindingDescriptor).not.toHaveProperty('channel');

        const migratedTwice = migrateSceneAudioSystemV5(after);
        expect(migratedTwice).toEqual(after);

        const sample = midSideFrame as AudioFeatureFrameSample;
        const sideSelection = selectChannelSample(sample, scopeSelector as string);
        expect(sideSelection?.channelIndex).toBe(1);
        expect(sideSelection?.values?.[0]).toBeCloseTo(-0.2, 5);
    });

    it('fails verification when descriptors retain channel fields', () => {
        const before = clone(legacyProject);
        expect(verifySceneAudioSystemV5(before, before)).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import { elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import {
    descriptorForTarget,
    elementPropertyDescriptors,
    fallbackDescriptor,
    hostPropertyDescriptors,
} from '../propertyCatalog';

describe('property catalog', () => {
    it('describes host values with canonical display codecs', () => {
        const descriptors = hostPropertyDescriptors('node:one');
        const rotation = descriptors.find((descriptor) => descriptor.definition.key === 'rotation')!;
        const scaleX = descriptors.find((descriptor) => descriptor.definition.key === 'scaleX')!;
        const scaleY = descriptors.find((descriptor) => descriptor.definition.key === 'scaleY')!;

        expect(rotation.target).toEqual(nodePropertyTarget('node:one', 'rotation'));
        expect(rotation.presentation.toDisplay(Math.PI)).toBeCloseTo(180);
        expect(rotation.presentation.fromDisplay(90)).toBeCloseTo(Math.PI / 2);
        expect(scaleX.presentation.toDisplay(1.25)).toBe(125);
        expect(scaleX.presentation.fromDisplay(50)).toBe(0.5);
        expect(scaleX.presentation.fromDisplay(-50)).toBe(-0.5);
        expect(scaleY.presentation.toDisplay(0.75)).toBe(75);
    });

    it('normalizes registered element schemas without changing plugin ownership', () => {
        const descriptors = elementPropertyDescriptors('element:one', 'textOverlay');
        const text = descriptors.find((descriptor) => descriptor.definition.key === 'text');
        expect(text?.target).toEqual(elementPropertyTarget('element:one', 'text'));
        expect(text?.tab.order).toBeGreaterThanOrEqual(1);
    });

    it('marks schema select fields as automatable stepped-string properties', () => {
        const descriptors = elementPropertyDescriptors('element:one', 'textOverlay');
        const blendMode = descriptors.find((descriptor) => descriptor.definition.key === 'blendMode');

        expect(blendMode?.definition.type).toBe('select');
        expect(blendMode?.capabilities.automatable).toBe(true);
    });

    it('provides safe metadata for unknown properties', () => {
        const target = nodePropertyTarget('missing', 'futureProperty');
        expect(descriptorForTarget(target)).toBeNull();
        expect(fallbackDescriptor(target, 'number').definition).toMatchObject({
            key: 'futureProperty',
            label: 'futureProperty',
            type: 'number',
        });
    });
});

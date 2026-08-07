import { describe, expect, it } from 'vitest';
import { readFiniteTransformInput, unwrapTransformInputValue } from './nodeTransformInput';

describe('node transform input normalization', () => {
    it('unwraps form-input values and rejects non-finite values', () => {
        expect(unwrapTransformInputValue({ value: '12.5' })).toBe('12.5');
        expect(readFiniteTransformInput({ value: '12.5' })).toBe(12.5);
        expect(readFiniteTransformInput({ value: 'nope' })).toBeNull();
        expect(readFiniteTransformInput(Infinity)).toBeNull();
    });
});

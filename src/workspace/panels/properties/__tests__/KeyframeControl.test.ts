import { describe, expect, it } from 'vitest';
import { isAutomatableType, resolveAutomationValueType } from '../KeyframeControl';

describe('KeyframeControl automation type resolution', () => {
    it('maps select controls to stepped string automation', () => {
        expect(isAutomatableType('select')).toBe(true);
        expect(resolveAutomationValueType('select')).toBe('string');
    });
});

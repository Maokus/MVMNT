import { describe, expect, it } from 'vitest';
import { resolveNodeTransformValue } from './nodeTransformValue';

describe('node transform value resolution', () => {
    it('prefers transient values and resolves each persisted binding kind', () => {
        const common = {
            fallback: 3,
            macroValue: (id: string) => (id === 'm' ? 4 : undefined),
            evaluateChannel: () => 5,
        };
        expect(
            resolveNodeTransformValue({ ...common, transientValue: 2, binding: { type: 'constant', value: 1 } })
        ).toBe(2);
        expect(resolveNodeTransformValue({ ...common, binding: { type: 'constant', value: 1 } })).toBe(1);
        expect(resolveNodeTransformValue({ ...common, binding: { type: 'macro', macroId: 'm' } })).toBe(4);
        expect(resolveNodeTransformValue({ ...common, binding: { type: 'keyframes', channelId: 'c' } })).toBe(5);
    });
});

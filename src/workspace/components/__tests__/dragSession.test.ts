import { describe, expect, it } from 'vitest';
import { createDragSessionId } from '../dragSession';

describe('createDragSessionId', () => {
    it('prefixes ids with the caller domain', () => {
        expect(createDragSessionId('color-drag')).toMatch(/^color-drag-[a-z0-9]+-[a-z0-9]+$/);
        expect(createDragSessionId('number-drag')).toMatch(/^number-drag-/);
    });

    it('generates unique ids', () => {
        const ids = new Set(Array.from({ length: 100 }, () => createDragSessionId('test')));
        expect(ids.size).toBe(100);
    });
});

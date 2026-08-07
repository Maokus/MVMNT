import { describe, expect, it } from 'vitest';
import { createDuplicateName } from '../naming';

describe('createDuplicateName', () => {
    it('adds a numbered suffix to the first duplicate', () => {
        expect(createDuplicateName('title', ['title'])).toBe('title_1');
    });

    it('uses the first available numbered suffix', () => {
        expect(createDuplicateName('title_3', ['title_1', 'title_3'])).toBe('title_2');
    });

    it('uses the original base when duplicating a numbered copy', () => {
        expect(createDuplicateName('title_1', ['title', 'title_1'])).toBe('title_2');
    });

    it('uses the base of any numeric suffix when allocating a duplicate', () => {
        expect(createDuplicateName('layer_2026', ['layer_2026'])).toBe('layer_1');
    });

    it('preserves special characters in names', () => {
        expect(createDuplicateName('shape[1]', ['shape[1]', 'shape[1]_1'])).toBe('shape[1]_2');
    });
});

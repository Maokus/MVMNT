import { describe, expect, it } from 'vitest';
import { createDuplicateElementId } from './duplicateElementName';

describe('createDuplicateElementId', () => {
    it('adds a numbered suffix to the first duplicate', () => {
        expect(createDuplicateElementId('title', ['title'])).toBe('title_1');
    });

    it('uses the first available numbered suffix', () => {
        expect(createDuplicateElementId('title_3', ['title_1', 'title_3'])).toBe('title_2');
    });

    it('uses the original base when duplicating a numbered copy', () => {
        expect(createDuplicateElementId('title_1', ['title', 'title_1'])).toBe('title_2');
    });

    it('does not treat a standalone numeric suffix as a duplicate marker', () => {
        expect(createDuplicateElementId('layer_2026', ['layer_2026'])).toBe('layer_2026_1');
    });

    it('escapes special characters in element ids', () => {
        expect(createDuplicateElementId('shape[1]', ['shape[1]', 'shape[1]_1'])).toBe('shape[1]_2');
    });
});

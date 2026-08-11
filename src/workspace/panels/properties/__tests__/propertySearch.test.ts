import { describe, expect, it } from 'vitest';
import { propertyVisibleForSearch, sectionVisibleForSearch } from '../propertySearch';

describe('multi-selection property search', () => {
    it('matches individual properties without keeping unrelated rows in the same section', () => {
        expect(sectionVisibleForSearch('width', 'Position & Bounds', ['X', 'Y', 'Width', 'Height'])).toBe(true);
        expect(propertyVisibleForSearch('width', 'Position & Bounds', 'Width')).toBe(true);
        expect(propertyVisibleForSearch('width', 'Position & Bounds', 'Height')).toBe(false);
    });

    it('keeps every property visible when its section name matches', () => {
        expect(propertyVisibleForSearch('pivot', 'Selection Pivot', 'Pivot X')).toBe(true);
        expect(propertyVisibleForSearch('pivot', 'Selection Pivot', 'Pivot Y')).toBe(true);
        expect(sectionVisibleForSearch('state', 'Node State', ['Visible', 'Locked'])).toBe(true);
    });

    it('treats blank and mixed-case searches consistently', () => {
        expect(propertyVisibleForSearch('  ', 'Node State', 'Visible')).toBe(true);
        expect(propertyVisibleForSearch('ViSi', 'Node State', 'Visible')).toBe(true);
    });
});

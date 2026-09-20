import { describe, expect, it } from 'vitest';
import { formatClipStartLabel } from './clipLabelUtils';

describe('formatClipStartLabel', () => {
    it('uses the shared MIDI and audio clip start convention', () => {
        expect(formatClipStartLabel(0, 960, { numerator: 4, denominator: 4 })).toBe('Start 1.1.0');
        expect(formatClipStartLabel(5 * 960, 960, { numerator: 4, denominator: 4 })).toBe('Start 2.2.0');
    });
});

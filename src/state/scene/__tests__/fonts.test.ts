import { describe, expect, it } from 'vitest';
import { collectMissingFontReferences } from '@state/scene/fonts';

describe('missing font references', () => {
    it('deduplicates missing families while retaining their download source', () => {
        expect(
            collectMissingFontReferences({
                binding: 'MissingGoogle:Roboto|700',
                macro: ['MissingGoogle:roboto|400', 'MissingProject:Brand Sans|400'],
                automation: { value: 'MissingProject:Brand Sans|700i' },
            })
        ).toEqual([
            { family: 'Brand Sans', source: 'project' },
            { family: 'Roboto', source: 'google' },
        ]);
    });
});

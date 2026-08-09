import { describe, expect, it } from 'vitest';
import { insertElementConfig } from '@core/scene/runtime/schema-builders';

describe('insertElementConfig', () => {
    it('does not duplicate the shared element tab from a legacy schema', () => {
        const schema = insertElementConfig(
            {
                name: 'Base',
                description: 'Base element schema',
                tabs: [{ id: 'element', label: 'Element', groups: [] }],
            },
            { name: 'Legacy element' },
            [
                { id: 'element', label: 'Element', groups: [] },
                { id: 'appearance', label: 'Appearance', groups: [] },
            ]
        );

        expect(schema.tabs.map((tab) => tab.id)).toEqual(['element', 'appearance']);
    });
});

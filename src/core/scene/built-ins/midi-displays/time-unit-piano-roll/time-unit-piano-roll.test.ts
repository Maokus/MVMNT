import { describe, expect, it } from 'vitest';
import { TimeUnitPianoRollElement } from './time-unit-piano-roll';

describe('Time Unit Piano Roll annotation presets', () => {
    it('toggles every annotation visibility property without changing appearance settings', () => {
        const schema = TimeUnitPianoRollElement.getConfigSchema();
        const annotation = schema.tabs.find((tab) => tab.id === 'annotation');
        const visibilityKeys = annotation?.groups.flatMap((group) =>
            group.properties.filter((property) => property.key.startsWith('show')).map((property) => property.key)
        );
        expect(visibilityKeys).toHaveLength(6);

        for (const [id, value] of [
            ['all-annotations-on', true],
            ['all-annotations-off', false],
        ] as const) {
            const preset = schema.presets?.find((candidate) => candidate.id === id);
            expect(preset).toBeDefined();
            expect(preset?.values).toEqual(Object.fromEntries(visibilityKeys!.map((key) => [key, value])));
        }
    });
});

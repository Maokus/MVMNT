import { describe, expect, it } from 'vitest';
import { sceneCommandDefinitions } from '../commandDefinitions';

describe('scene command definitions', () => {
    it('declares persistence, rollback, and boundaries for every command', () => {
        expect(Object.keys(sceneCommandDefinitions)).not.toHaveLength(0);
        for (const definition of Object.values(sceneCommandDefinitions)) {
            expect(['none', 'scene', 'multi-store']).toContain(definition.persistenceImpact);
            expect(['inverse-patch', 'snapshot', 'transaction']).toContain(definition.rollback);
            expect(definition.boundaries.length).toBeGreaterThan(0);
            if (definition.rollback === 'transaction') {
                expect(definition.persistenceImpact).toBe('multi-store');
                expect(definition.boundaries.length).toBeGreaterThan(1);
            }
        }
    });
});

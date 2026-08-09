import { describe, expect, it } from 'vitest';
import {
    sceneCommandDefinition,
    validateSceneCommandDefinition,
    type SceneCommandDefinition,
} from '../commandDefinitions';

describe('scene command definitions', () => {
    it('declares a persistence and rollback contract for every command', () => {
        const definition = sceneCommandDefinition({ type: 'clearScene' });

        expect(definition).toEqual({
            persistenceImpact: 'multi-store',
            rollback: 'transaction',
            boundaries: ['scene', 'timeline', 'metadata', 'assets', 'runtime'],
        });
    });

    it('rejects incomplete transactional metadata', () => {
        const incomplete: SceneCommandDefinition = {
            persistenceImpact: 'multi-store',
            rollback: 'transaction',
            boundaries: ['scene'],
        };

        expect(() => validateSceneCommandDefinition('test', incomplete)).toThrow(/every transactional boundary/);
    });
});

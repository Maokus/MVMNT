import { describe, expect, it } from 'vitest';
import { nodePropertyTarget } from '@automation/types';
import {
    batchSceneCommands,
    transformCommandOptions,
    transformNodesCommand,
    updateTargetBindingCommand,
} from './nodeTransformCommands';

describe('node transform command construction', () => {
    it('builds aggregate commands and merge-session options', () => {
        const command = transformNodesCommand(['a', 'b'], [1, 0, 0, 1, 12, 4]);
        expect(batchSceneCommands([command])).toBe(command);
        expect(transformCommandOptions('panel', 'position', { id: 'drag-1', finalize: false })).toEqual({
            source: 'panel',
            mergeKey: 'position:drag-1',
            transient: true,
        });
    });

    it('builds host-property binding commands', () => {
        expect(
            updateTargetBindingCommand(nodePropertyTarget('node-1', 'localOpacity'), {
                type: 'constant',
                value: 0.5,
            })
        ).toMatchObject({ type: 'updatePropertyTargetBinding', binding: { type: 'constant', value: 0.5 } });
    });
});

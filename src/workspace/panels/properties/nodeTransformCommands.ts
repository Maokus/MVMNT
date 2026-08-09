import type { BindingState } from '@state/sceneStore';
import type { PropertyTarget } from '@automation/types';
import type { Matrix2D } from '@state/scene-graph';
import type { SceneCommand, SceneCommandOptions } from '@state/scene';

export interface TransformMergeSession {
    id: string;
    finalize: boolean;
}

export function batchSceneCommands(commands: SceneCommand[]): SceneCommand {
    if (!commands.length) throw new Error('A transform command batch must not be empty');
    return commands.length === 1 ? commands[0] : { type: 'batch', commands };
}

export function transformNodesCommand(nodeIds: string[], worldDelta: Matrix2D): SceneCommand {
    return { type: 'transformNodes', nodeIds, worldDelta };
}

export function updateTargetBindingCommand(target: PropertyTarget, binding: BindingState): SceneCommand {
    return { type: 'updatePropertyTargetBinding', target, binding };
}

export function transformCommandOptions(
    source: string,
    mergeKey?: string,
    session?: TransformMergeSession
): SceneCommandOptions {
    return {
        source,
        mergeKey: session && mergeKey ? `${mergeKey}:${session.id}` : mergeKey,
        transient: session ? !session.finalize : undefined,
    };
}

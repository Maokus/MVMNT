import { AutomationCurve } from '@automation/automation-curve';
import {
    identityMatrix,
    invertMatrix,
    multiplyMatrices,
    nodeTransformToMatrix,
    type Matrix2D,
    type NodeTransform,
} from '@state/scene-graph';
import type { SceneStoreState } from './storeTypes';

export type ReparentMode = 'keepTransform' | 'keepLocal';

export function hasAnimatedReparentHierarchy(
    state: SceneStoreState,
    nodeIds: readonly string[],
    newParentId: string
): boolean {
    const affected = new Set<string>();
    for (const start of [...nodeIds, newParentId]) {
        let id: string | null = start;
        while (id) {
            affected.add(id);
            id = state.graph.nodesById[id]?.parentId ?? null;
        }
    }
    return Object.values(state.automation.channels).some(
        (channel) => channel.target.owner.kind === 'node' && affected.has(channel.target.owner.id)
    );
}

function evaluatedTransform(state: SceneStoreState, nodeId: string, tick: number): NodeTransform {
    const node = state.graph.nodesById[nodeId];
    const transform = { ...node.userNodeTransform };
    for (const [path, binding] of Object.entries(state.nodeBindings[nodeId] ?? {})) {
        if (!(path in transform)) continue;
        const value =
            binding.type === 'constant'
                ? binding.value
                : binding.type === 'macro'
                  ? state.macros.byId[binding.macroId]?.value
                  : (() => {
                        const channel = state.automation.channels[binding.channelId];
                        return channel ? new AutomationCurve(channel).evaluate(tick) : undefined;
                    })();
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        transform[path as keyof NodeTransform] =
            path === 'scaleX' || path === 'scaleY'
                ? Math.abs(value) < 0.001
                    ? value < 0
                        ? -0.001
                        : 0.001
                    : value
                : value;
    }
    return transform;
}

export function evaluatedReparentMatrices(
    state: SceneStoreState,
    tick: number
): { worlds: Map<string, Matrix2D>; userMatrices: Map<string, Matrix2D> } {
    const worlds = new Map<string, Matrix2D>();
    const userMatrices = new Map<string, Matrix2D>();
    const stack: Array<{ id: string; parentWorld: Matrix2D }> = [
        { id: state.graph.rootId, parentWorld: identityMatrix() },
    ];
    while (stack.length) {
        const { id, parentWorld } = stack.pop()!;
        const node = state.graph.nodesById[id];
        if (!node) continue;
        const userMatrix = nodeTransformToMatrix(evaluatedTransform(state, id, tick));
        const world = multiplyMatrices(parentWorld, multiplyMatrices(node.parentCompensation, userMatrix));
        userMatrices.set(id, userMatrix);
        worlds.set(id, world);
        if ('children' in node) {
            for (const childId of node.children) stack.push({ id: childId, parentWorld: world });
        }
    }
    return { worlds, userMatrices };
}

export function compensationAtPlayhead(oldWorld: Matrix2D, newParentWorld: Matrix2D, userMatrix: Matrix2D): Matrix2D {
    const inverseParent = invertMatrix(newParentWorld);
    const inverseUser = invertMatrix(userMatrix);
    if (!inverseParent || !inverseUser) throw new Error('Cannot preserve transform through a singular matrix');
    return multiplyMatrices(multiplyMatrices(inverseParent, oldWorld), inverseUser);
}

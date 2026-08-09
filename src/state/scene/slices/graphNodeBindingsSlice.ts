import type { SceneStoreState } from '../storeTypes';

export type GraphNodeBindingsSlice = Pick<
    SceneStoreState,
    | 'graph'
    | 'nodeIdByElementId'
    | 'elementIdByNodeId'
    | 'nodeBindings'
    | 'transientNodeTransforms'
    | 'updateNodeBindings'
    | 'removeNodeBindings'
    | 'replaceGraph'
    | 'updateNodeTransform'
    | 'setTransientNodeTransform'
    | 'clearTransientNodeTransforms'
    | 'setNodeVisibility'
    | 'setNodeOpacity'
    | 'setNodeLocked'
    | 'setNodeName'
>;

/** Selects scene-graph and host-node binding behavior from the composed store. */
export function createGraphNodeBindingsSlice(state: SceneStoreState): GraphNodeBindingsSlice {
    const {
        graph,
        nodeIdByElementId,
        elementIdByNodeId,
        nodeBindings,
        transientNodeTransforms,
        updateNodeBindings,
        removeNodeBindings,
        replaceGraph,
        updateNodeTransform,
        setTransientNodeTransform,
        clearTransientNodeTransforms,
        setNodeVisibility,
        setNodeOpacity,
        setNodeLocked,
        setNodeName,
    } = state;
    return {
        graph,
        nodeIdByElementId,
        elementIdByNodeId,
        nodeBindings,
        transientNodeTransforms,
        updateNodeBindings,
        removeNodeBindings,
        replaceGraph,
        updateNodeTransform,
        setTransientNodeTransform,
        clearTransientNodeTransforms,
        setNodeVisibility,
        setNodeOpacity,
        setNodeLocked,
        setNodeName,
    };
}

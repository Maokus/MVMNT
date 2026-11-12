import type { SceneClipboard } from '@state/sceneEditorStore';
import type { SceneStoreState } from '@state/sceneStore';
import { normalizeNodeSelection, buildSceneGraphNavigationIndex, type SceneGraphState } from '@state/scene-graph';
import { createSceneSubtreeBundle, withoutSubtreeAutomation } from './subtreeBundle';

export function createSceneClipboard(state: SceneStoreState, nodeIds: readonly string[], tick: number): SceneClipboard {
    const index = buildSceneGraphNavigationIndex(state.graph);
    const roots = normalizeNodeSelection(state.graph, nodeIds).sort(
        (a, b) => index.byNodeId.get(a)!.preorder - index.byNodeId.get(b)!.preorder
    );
    const full = createSceneSubtreeBundle(state, roots);
    return { full, withoutAutomation: withoutSubtreeAutomation(full, tick) };
}

export function scenePasteDestination(graph: SceneGraphState, activeNodeId: string | null) {
    const node = activeNodeId ? graph.nodesById[activeNodeId] : undefined;
    if (node?.kind === 'group') return { parentId: node.id, targetIndex: node.children.length };
    const parent = node?.parentId ? graph.nodesById[node.parentId] : undefined;
    if (node && parent && 'children' in parent) {
        return { parentId: parent.id, targetIndex: parent.children.indexOf(node.id) + 1 };
    }
    const root = graph.nodesById[graph.rootId];
    return { parentId: graph.rootId, targetIndex: root && 'children' in root ? root.children.length : 0 };
}

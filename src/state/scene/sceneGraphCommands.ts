import { cloneChannel, nodePropertyTarget } from '@automation/types';
import {
    cloneSceneGraph,
    cloneSubtrees,
    groupSceneNodes,
    normalizeNodeSelection,
    removeSubtrees,
    reparentSceneNodes,
    reorderSceneNodes,
    subtreeNodeIds,
    transformSceneNodes,
    ungroupSceneNode,
} from '@state/scene-graph';
import { useSceneStore, type ElementBindings, type SceneStoreState } from '@state/sceneStore';
import type { SceneCommand } from './commandTypes';
import { compensationAtPlayhead, evaluatedReparentMatrices } from './reparenting';

/** Applies graph-only commands and reports whether the command was handled. */
export function applySceneGraphCommand(
    store: SceneStoreState,
    command: SceneCommand,
    getState: () => SceneStoreState = () => useSceneStore.getState()
): boolean {
    switch (command.type) {
        case 'replaceGraph':
            if (command.expectedRevision != null && store.graph.revision !== command.expectedRevision) {
                throw new Error(
                    `Scene command revision conflict: expected ${command.expectedRevision}, received ${store.graph.revision}`
                );
            }
            store.replaceGraph(command.graph);
            return true;
        case 'updateNodeTransform':
            store.updateNodeTransform(command.nodeId, command.transform);
            return true;
        case 'setNodeVisibility':
            store.setNodeVisibility(command.nodeId, command.visible);
            return true;
        case 'setNodeOpacity':
            store.setNodeOpacity(command.nodeId, command.opacity);
            return true;
        case 'setNodeOutputBlendMode':
            store.setNodeOutputBlendMode(command.nodeId, command.mode);
            return true;
        case 'setNodeLocked':
            store.setNodeLocked(command.nodeId, command.locked);
            return true;
        case 'setNodeName':
            store.setNodeName(command.nodeId, command.name);
            return true;
        case 'groupNodes':
            store.replaceGraph(
                groupSceneNodes(store.graph, command.nodeIds, command.groupId, command.name, command.worldPivot)
            );
            return true;
        case 'ungroupNode':
            store.replaceGraph(ungroupSceneNode(store.graph, command.nodeId));
            getState().removeNodeBindings([command.nodeId]);
            return true;
        case 'reorderNodes':
            store.replaceGraph(reorderSceneNodes(store.graph, command.parentId, command.nodeIds, command.targetIndex));
            return true;
        case 'reparentNodes': {
            const selected = normalizeNodeSelection(store.graph, command.nodeIds);
            const parent = store.graph.nodesById[command.newParentId];
            if (
                selected.length > 0 &&
                parent &&
                'children' in parent &&
                selected.every((id) => store.graph.nodesById[id]?.parentId === command.newParentId)
            ) {
                const boundedIndex = Math.max(0, Math.min(parent.children.length, Math.floor(command.targetIndex)));
                const selectedSet = new Set(selected);
                const removedBeforeTarget = parent.children
                    .slice(0, boundedIndex)
                    .filter((id) => selectedSet.has(id)).length;
                store.replaceGraph(
                    reorderSceneNodes(store.graph, command.newParentId, selected, boundedIndex - removedBeforeTarget)
                );
                return true;
            }
            const mode = command.mode ?? 'keepTransform';
            if (mode !== 'keepTransform' && mode !== 'keepLocal') throw new Error('Unknown reparent mode');
            if (mode === 'keepTransform' && !Number.isFinite(command.atTick)) {
                throw new Error('Reparent playhead tick is required');
            }
            const matrices = mode === 'keepTransform' ? evaluatedReparentMatrices(store, command.atTick!) : null;
            const next = reparentSceneNodes(store.graph, command.nodeIds, command.newParentId, command.targetIndex, {
                preserveWorld: false,
            });
            for (const id of selected) {
                const node = next.nodesById[id];
                if (mode === 'keepLocal') continue;
                const oldWorld = matrices!.worlds.get(id);
                const newParentWorld = matrices!.worlds.get(command.newParentId);
                const userMatrix = matrices!.userMatrices.get(id);
                if (!oldWorld || !newParentWorld || !userMatrix) throw new Error('Reparent transform is unavailable');
                node.parentCompensation = compensationAtPlayhead(oldWorld, newParentWorld, userMatrix);
            }
            store.replaceGraph(next);
            return true;
        }
        case 'transformNodes':
            store.replaceGraph(transformSceneNodes(store.graph, command.nodeIds, command.worldDelta));
            return true;
        case 'deleteSubtrees': {
            const graph = store.graph;
            const removedIds = new Set(subtreeNodeIds(graph, command.nodeIds));
            const elementIds = [...removedIds]
                .map((id) => graph.nodesById[id])
                .filter((node): node is Extract<typeof node, { kind: 'element' }> => node?.kind === 'element')
                .map((node) => node.elementId);
            const nextGraph = removeSubtrees(graph, command.nodeIds);
            getState().removeNodeBindings([...removedIds]);
            for (const elementId of elementIds) getState().removeElement(elementId);
            getState().replaceGraph(nextGraph);
            return true;
        }
        case 'duplicateSubtrees': {
            for (const [sourceElementId, newElementId] of Object.entries(command.mappings.elementIdMap)) {
                getState().duplicateElement(sourceElementId, newElementId);
            }
            const current = getState();
            const base = cloneSceneGraph(current.graph);
            for (const newElementId of Object.values(command.mappings.elementIdMap)) {
                const generatedNodeId = current.nodeIdByElementId[newElementId];
                const generated = generatedNodeId ? base.nodesById[generatedNodeId] : undefined;
                if (generated?.parentId) {
                    const parent = base.nodesById[generated.parentId];
                    if (parent && 'children' in parent)
                        parent.children = parent.children.filter((id) => id !== generatedNodeId);
                    delete base.nodesById[generatedNodeId];
                }
            }
            current.replaceGraph(cloneSubtrees(base, command.nodeIds, command.mappings));
            const afterGraph = getState();
            const occupied = new Set(Object.keys(afterGraph.automation.channels));
            for (const [sourceNodeId, clonedNodeId] of Object.entries(command.mappings.nodeIdMap)) {
                const sourceBindings = store.nodeBindings[sourceNodeId];
                if (!sourceBindings) continue;
                const clonedBindings: ElementBindings = {};
                for (const [path, binding] of Object.entries(sourceBindings)) {
                    if (binding.type !== 'keyframes') {
                        clonedBindings[path] = { ...binding };
                        continue;
                    }
                    const sourceChannel = store.automation.channels[binding.channelId];
                    if (!sourceChannel) continue;
                    const clonedChannel = cloneChannel(sourceChannel, nodePropertyTarget(clonedNodeId, path), occupied);
                    occupied.add(clonedChannel.id);
                    getState().setAutomationChannel(clonedChannel);
                    clonedBindings[path] = { type: 'keyframes', channelId: clonedChannel.id };
                }
                getState().updateNodeBindings(clonedNodeId, clonedBindings);
            }
            return true;
        }
        default:
            return false;
    }
}

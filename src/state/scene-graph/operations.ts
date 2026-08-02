import { identityMatrix, invertMatrix, multiplyMatrices, nodeTransformToMatrix } from './math';
import { cloneSceneGraph, createNodeBase, type Matrix2D, type SceneGraphState, type SceneNode } from './types';

export interface DuplicateMappings {
    nodeIdMap: Record<string, string>;
    elementIdMap: Record<string, string>;
}

function worldMatrices(graph: SceneGraphState): Map<string, Matrix2D> {
    const result = new Map<string, Matrix2D>();
    const root = graph.nodesById[graph.rootId];
    if (!root || root.kind !== 'root') return result;
    const stack: Array<{ node: SceneNode; parentWorld: Matrix2D }> = [{ node: root, parentWorld: identityMatrix() }];
    while (stack.length) {
        const { node, parentWorld } = stack.pop()!;
        const world = multiplyMatrices(
            parentWorld,
            multiplyMatrices(node.parentCompensation, nodeTransformToMatrix(node.userNodeTransform))
        );
        result.set(node.id, world);
        if ('children' in node) {
            for (let index = node.children.length - 1; index >= 0; index -= 1) {
                const child = graph.nodesById[node.children[index]];
                if (child) stack.push({ node: child, parentWorld: world });
            }
        }
    }
    return result;
}

export function subtreeNodeIds(graph: SceneGraphState, rootIds: readonly string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const stack = [...rootIds].reverse();
    while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = graph.nodesById[id];
        if (!node) continue;
        result.push(id);
        if ('children' in node) {
            for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
        }
    }
    return result;
}

export function isNodeAncestor(graph: SceneGraphState, ancestorId: string, nodeId: string): boolean {
    let current = graph.nodesById[nodeId];
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.id)) {
        if (current.parentId === ancestorId) return true;
        visited.add(current.id);
        current = graph.nodesById[current.parentId];
    }
    return false;
}

export function normalizeNodeSelection(graph: SceneGraphState, nodeIds: readonly string[]): string[] {
    const unique = [...new Set(nodeIds)].filter((id) => id !== graph.rootId && Boolean(graph.nodesById[id]));
    const selected = new Set(unique);
    return unique.filter(
        (id) =>
            !unique.some(
                (candidate) => candidate !== id && selected.has(candidate) && isNodeAncestor(graph, candidate, id)
            )
    );
}

function uniqueId(base: string, occupied: Set<string>): string {
    if (!occupied.has(base)) {
        occupied.add(base);
        return base;
    }
    let suffix = 2;
    while (occupied.has(`${base} ${suffix}`)) suffix += 1;
    const id = `${base} ${suffix}`;
    occupied.add(id);
    return id;
}

export function createDuplicateMappings(
    graph: SceneGraphState,
    elementIds: Iterable<string>,
    rootIds: readonly string[]
): DuplicateMappings {
    const nodeIdMap: Record<string, string> = {};
    const elementIdMap: Record<string, string> = {};
    const occupiedNodes = new Set(Object.keys(graph.nodesById));
    const occupiedElements = new Set(elementIds);
    for (const id of subtreeNodeIds(graph, normalizeNodeSelection(graph, rootIds))) {
        const node = graph.nodesById[id];
        nodeIdMap[id] = uniqueId(`${id}:copy`, occupiedNodes);
        if (node.kind === 'element')
            elementIdMap[node.elementId] = uniqueId(`${node.elementId} copy`, occupiedElements);
    }
    return { nodeIdMap, elementIdMap };
}

function compensationForWorld(parentWorld: Matrix2D, world: Matrix2D, userMatrix: Matrix2D): Matrix2D {
    const inverseParent = invertMatrix(parentWorld);
    const inverseUser = invertMatrix(userMatrix);
    if (!inverseParent || !inverseUser) throw new Error('Cannot preserve appearance through a singular transform');
    return multiplyMatrices(multiplyMatrices(inverseParent, world), inverseUser);
}

export function groupSceneNodes(
    graph: SceneGraphState,
    nodeIds: readonly string[],
    groupId: string,
    name = 'Group'
): SceneGraphState {
    const selected = normalizeNodeSelection(graph, nodeIds);
    if (selected.length < 1) throw new Error('Select at least one node to group');
    if (graph.nodesById[groupId]) throw new Error(`Node '${groupId}' already exists`);
    const parentId = graph.nodesById[selected[0]]?.parentId;
    if (!parentId || selected.some((id) => graph.nodesById[id]?.parentId !== parentId)) {
        throw new Error('Grouped nodes must be siblings');
    }
    const parent = graph.nodesById[parentId];
    if (!parent || parent.kind !== 'root' || selected.some((id) => graph.nodesById[id]?.kind !== 'element')) {
        throw new Error('Only root-level elements can be grouped');
    }
    if (parent.localLocked || selected.some((id) => graph.nodesById[id]?.localLocked)) {
        throw new Error('Locked nodes cannot be grouped');
    }
    const selectedSet = new Set(selected);
    const ordered = parent.children.filter((id) => selectedSet.has(id));
    const frontmostIndex = Math.max(...ordered.map((id) => parent.children.indexOf(id)));
    const insertionIndex = frontmostIndex - ordered.filter((id) => parent.children.indexOf(id) < frontmostIndex).length;
    const next = cloneSceneGraph(graph);
    const nextParent = next.nodesById[parentId];
    if (!nextParent || nextParent.kind !== 'root') throw new Error('Group parent is invalid');
    nextParent.children = nextParent.children.filter((id) => !selectedSet.has(id));
    nextParent.children.splice(insertionIndex, 0, groupId);
    next.nodesById[groupId] = { ...createNodeBase(groupId, parentId, name), kind: 'group', children: ordered };
    for (const id of ordered) next.nodesById[id] = { ...next.nodesById[id], parentId: groupId } as SceneNode;
    next.revision += 1;
    return next;
}

export function ungroupSceneNode(graph: SceneGraphState, groupId: string): SceneGraphState {
    const group = graph.nodesById[groupId];
    if (!group || group.kind !== 'group' || !group.parentId) throw new Error('Node is not a group');
    const parent = graph.nodesById[group.parentId];
    if (!parent || !('children' in parent)) throw new Error('Group parent is invalid');
    const worlds = worldMatrices(graph);
    const parentWorld = worlds.get(parent.id);
    if (!parentWorld) throw new Error('Group parent could not be resolved');
    const next = cloneSceneGraph(graph);
    const nextParent = next.nodesById[parent.id];
    const nextGroup = next.nodesById[groupId];
    if (!nextParent || !('children' in nextParent) || nextGroup.kind !== 'group') throw new Error('Group changed');
    const index = nextParent.children.indexOf(groupId);
    nextParent.children.splice(index, 1, ...nextGroup.children);
    for (const childId of nextGroup.children) {
        const child = next.nodesById[childId];
        const world = worlds.get(childId);
        if (!child || !world) continue;
        child.parentId = nextParent.id;
        child.parentCompensation = compensationForWorld(
            parentWorld,
            world,
            nodeTransformToMatrix(child.userNodeTransform)
        );
    }
    delete next.nodesById[groupId];
    next.revision += 1;
    return next;
}

export function reorderSceneNodes(
    graph: SceneGraphState,
    parentId: string,
    nodeIds: readonly string[],
    targetIndex: number
): SceneGraphState {
    const parent = graph.nodesById[parentId];
    const selected = normalizeNodeSelection(graph, nodeIds);
    if (!parent || !('children' in parent) || selected.some((id) => graph.nodesById[id]?.parentId !== parentId)) {
        throw new Error('Reordered nodes must be siblings');
    }
    const selectedSet = new Set(selected);
    const moving = parent.children.filter((id) => selectedSet.has(id));
    const remaining = parent.children.filter((id) => !selectedSet.has(id));
    const bounded = Math.max(0, Math.min(remaining.length, Math.floor(targetIndex)));
    const next = cloneSceneGraph(graph);
    const nextParent = next.nodesById[parentId];
    if (!nextParent || !('children' in nextParent)) throw new Error('Parent changed');
    nextParent.children = [...remaining.slice(0, bounded), ...moving, ...remaining.slice(bounded)];
    next.revision += 1;
    return next;
}

export function transformSceneNodes(
    graph: SceneGraphState,
    nodeIds: readonly string[],
    worldDelta: Matrix2D
): SceneGraphState {
    const selected = normalizeNodeSelection(graph, nodeIds);
    const worlds = worldMatrices(graph);
    const next = cloneSceneGraph(graph);
    for (const id of selected) {
        const node = next.nodesById[id];
        const currentWorld = worlds.get(id);
        const parentWorld = node?.parentId ? worlds.get(node.parentId) : undefined;
        if (!currentWorld || !node || !parentWorld) continue;
        const nextWorld = multiplyMatrices(worldDelta, currentWorld);
        node.parentCompensation = compensationForWorld(
            parentWorld,
            nextWorld,
            nodeTransformToMatrix(node.userNodeTransform)
        );
    }
    next.revision += 1;
    return next;
}

export function cloneSubtrees(
    graph: SceneGraphState,
    rootIds: readonly string[],
    mappings: DuplicateMappings
): SceneGraphState {
    const selected = normalizeNodeSelection(graph, rootIds);
    const next = cloneSceneGraph(graph);
    const allCloneIds = new Set(Object.values(mappings.nodeIdMap));
    for (const id of allCloneIds) delete next.nodesById[id];
    for (const sourceId of subtreeNodeIds(graph, selected)) {
        const source = graph.nodesById[sourceId];
        const cloneId = mappings.nodeIdMap[sourceId];
        if (!source || !cloneId) throw new Error('Duplicate mapping is incomplete');
        next.nodesById[cloneId] = {
            ...source,
            id: cloneId,
            name: `${source.name} copy`,
            parentCompensation: [...source.parentCompensation],
            userNodeTransform: { ...source.userNodeTransform },
            parentId: mappings.nodeIdMap[source.parentId ?? ''] ?? source.parentId,
            ...(source.kind === 'element' ? { elementId: mappings.elementIdMap[source.elementId] } : {}),
            ...('children' in source ? { children: source.children.map((id) => mappings.nodeIdMap[id]) } : {}),
        } as SceneNode;
    }
    const selectedSet = new Set(selected);
    for (const node of Object.values(next.nodesById)) {
        if (!('children' in node)) continue;
        const sourceChildren = graph.nodesById[node.id];
        if (!sourceChildren || !('children' in sourceChildren)) continue;
        node.children = sourceChildren.children.flatMap((id) =>
            selectedSet.has(id) && mappings.nodeIdMap[id] ? [id, mappings.nodeIdMap[id]] : [id]
        );
    }
    next.revision += 1;
    return next;
}

export function removeSubtrees(graph: SceneGraphState, rootIds: readonly string[]): SceneGraphState {
    const selected = normalizeNodeSelection(graph, rootIds);
    const removed = new Set(subtreeNodeIds(graph, selected));
    const next = cloneSceneGraph(graph);
    for (const id of removed) delete next.nodesById[id];
    for (const node of Object.values(next.nodesById)) {
        if ('children' in node) node.children = node.children.filter((id) => !removed.has(id));
    }
    next.revision += 1;
    return next;
}

export const IDENTITY_WORLD_DELTA = identityMatrix();

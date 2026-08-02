import { isFiniteMatrix, matricesEqual } from './math';
import {
    createNodeBase,
    IDENTITY_MATRIX,
    IDENTITY_NODE_TRANSFORM,
    SCENE_ROOT_ID,
    type SceneElementNode,
    type SceneGraphState,
    type SceneNode,
    type SceneNodeId,
} from './types';

export type SceneGraphErrorCode =
    | 'ROOT_INVALID'
    | 'NODE_ID_MISMATCH'
    | 'NODE_KIND_INVALID'
    | 'PARENT_MISSING'
    | 'REFERENCE_NOT_RECIPROCAL'
    | 'DUPLICATE_CHILD'
    | 'ELEMENT_REFERENCE_INVALID'
    | 'ELEMENT_REFERENCE_DUPLICATE'
    | 'CYCLE'
    | 'UNREACHABLE'
    | 'TRANSFORM_INVALID'
    | 'TRAVERSAL_BUDGET';

export interface SceneGraphValidationError {
    code: SceneGraphErrorCode;
    message: string;
    nodeId?: string;
}
export interface SceneGraphValidationResult {
    ok: boolean;
    errors: SceneGraphValidationError[];
}

export const MAX_SCENE_GRAPH_TRAVERSAL = 100_000;

export interface SceneGraphNavigationRecord {
    nodeId: string;
    parentId: string | null;
    depth: number;
    preorder: number;
    subtreeEnd: number;
}

export interface SceneGraphNavigationIndex {
    graphRevision: number;
    preorderNodeIds: string[];
    byNodeId: Map<string, SceneGraphNavigationRecord>;
}

const navigationIndexCache = new WeakMap<SceneGraphState, SceneGraphNavigationIndex>();

/** Iterative ancestry/subtree index. Preorder intervals make ancestor checks O(1). */
export function buildSceneGraphNavigationIndex(graph: SceneGraphState): SceneGraphNavigationIndex {
    const cached = navigationIndexCache.get(graph);
    if (cached?.graphRevision === graph.revision) return cached;
    const preorderNodeIds: string[] = [];
    const byNodeId = new Map<string, SceneGraphNavigationRecord>();
    const root = graph.nodesById[graph.rootId];
    if (root?.kind === 'root') {
        const stack: Array<{ id: string; depth: number; exit: boolean }> = [{ id: root.id, depth: 0, exit: false }];
        const visited = new Set<string>();
        while (stack.length) {
            const entry = stack.pop()!;
            const node = graph.nodesById[entry.id];
            if (!node) continue;
            if (entry.exit) {
                const record = byNodeId.get(entry.id);
                if (record) record.subtreeEnd = preorderNodeIds.length;
                continue;
            }
            if (visited.has(entry.id)) continue;
            visited.add(entry.id);
            const preorder = preorderNodeIds.length;
            preorderNodeIds.push(entry.id);
            byNodeId.set(entry.id, {
                nodeId: entry.id,
                parentId: node.parentId,
                depth: entry.depth,
                preorder,
                subtreeEnd: preorder + 1,
            });
            stack.push({ ...entry, exit: true });
            if ('children' in node) {
                for (let index = node.children.length - 1; index >= 0; index -= 1) {
                    stack.push({ id: node.children[index], depth: entry.depth + 1, exit: false });
                }
            }
        }
    }
    const index = { graphRevision: graph.revision, preorderNodeIds, byNodeId };
    navigationIndexCache.set(graph, index);
    return index;
}

export function elementNodeId(elementId: string, occupied: ReadonlySet<string> = new Set()): SceneNodeId {
    const base = `element:${encodeURIComponent(elementId)}`;
    if (!occupied.has(base)) return base;
    let suffix = 2;
    while (occupied.has(`${base}:${suffix}`)) suffix += 1;
    return `${base}:${suffix}`;
}

export function createFlatSceneGraph(elementIds: readonly string[]): SceneGraphState {
    const occupied = new Set<string>([SCENE_ROOT_ID]);
    const children: string[] = [];
    const nodesById: Record<string, SceneNode> = {};
    for (const elementId of elementIds) {
        const id = elementNodeId(elementId, occupied);
        occupied.add(id);
        children.push(id);
        nodesById[id] = { ...createNodeBase(id, SCENE_ROOT_ID, elementId), kind: 'element', elementId };
    }
    nodesById[SCENE_ROOT_ID] = { ...createNodeBase(SCENE_ROOT_ID, null, 'Scene'), kind: 'root', children };
    return { rootId: SCENE_ROOT_ID, nodesById, revision: 0 };
}

export function traverseSceneGraph(graph: SceneGraphState): SceneNode[] {
    const result: SceneNode[] = [];
    const root = graph.nodesById[graph.rootId];
    if (!root || !('children' in root)) return result;
    const stack = [...root.children].reverse();
    const visited = new Set<string>([root.id]);
    result.push(root);
    while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = graph.nodesById[id];
        if (!node) continue;
        result.push(node);
        if ('children' in node)
            for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
    }
    return result;
}

export function deriveElementOrder(graph: SceneGraphState): string[] {
    return traverseSceneGraph(graph)
        .filter((node): node is SceneElementNode => node.kind === 'element')
        .map((node) => node.elementId);
}

export function buildSceneGraphIndexes(graph: SceneGraphState) {
    const nodeIdByElementId: Record<string, string> = {};
    const elementIdByNodeId: Record<string, string> = {};
    for (const node of Object.values(graph.nodesById))
        if (node.kind === 'element') {
            nodeIdByElementId[node.elementId] = node.id;
            elementIdByNodeId[node.id] = node.elementId;
        }
    return { nodeIdByElementId, elementIdByNodeId };
}

export function validateSceneGraph(graph: SceneGraphState, elementIds: Iterable<string>): SceneGraphValidationResult {
    const errors: SceneGraphValidationError[] = [];
    const expectedElements = new Set(elementIds);
    if (
        !graph ||
        typeof graph !== 'object' ||
        typeof graph.rootId !== 'string' ||
        !graph.nodesById ||
        typeof graph.nodesById !== 'object' ||
        Array.isArray(graph.nodesById) ||
        !Number.isFinite(graph.revision)
    ) {
        return { ok: false, errors: [{ code: 'ROOT_INVALID', message: 'Scene graph shape is invalid.' }] };
    }
    const root = graph.nodesById[graph.rootId];
    const roots = Object.values(graph.nodesById).filter((node) => node.kind === 'root');
    if (!root || root.kind !== 'root' || root.parentId !== null || roots.length !== 1 || root.id !== SCENE_ROOT_ID)
        errors.push({
            code: 'ROOT_INVALID',
            message: 'The graph must contain exactly one reserved root with no parent.',
        });
    if (
        root?.kind === 'root' &&
        (!isFiniteMatrix(root.parentCompensation) ||
            !root.userNodeTransform ||
            typeof root.userNodeTransform !== 'object' ||
            !matricesEqual(root.parentCompensation, IDENTITY_MATRIX) ||
            Object.entries(IDENTITY_NODE_TRANSFORM).some(
                ([key, value]) => root.userNodeTransform[key as keyof typeof IDENTITY_NODE_TRANSFORM] !== value
            ) ||
            !root.localVisible ||
            root.localLocked)
    ) {
        errors.push({
            code: 'ROOT_INVALID',
            message: 'The reserved root must use identity transforms and neutral flags.',
            nodeId: root.id,
        });
    }
    const referencedElements = new Set<string>();
    for (const [key, node] of Object.entries(graph.nodesById)) {
        if (key !== node.id)
            errors.push({ code: 'NODE_ID_MISMATCH', message: `Node key '${key}' does not match its id.`, nodeId: key });
        if (!['root', 'group', 'element'].includes(node.kind)) {
            errors.push({ code: 'NODE_KIND_INVALID', message: 'Node kind is invalid.', nodeId: node.id });
            continue;
        }
        if (node.kind === 'element' && ('children' in node || typeof node.elementId !== 'string')) {
            errors.push({
                code: 'NODE_KIND_INVALID',
                message: 'Element nodes require an elementId and cannot have children.',
                nodeId: node.id,
            });
        }
        if (
            !isFiniteMatrix(node.parentCompensation) ||
            !node.userNodeTransform ||
            typeof node.userNodeTransform !== 'object' ||
            Object.values(node.userNodeTransform).length !== Object.keys(IDENTITY_NODE_TRANSFORM).length ||
            Object.values(node.userNodeTransform).some((value) => typeof value !== 'number' || !Number.isFinite(value))
        )
            errors.push({
                code: 'TRANSFORM_INVALID',
                message: 'Node transform values must be finite and complete.',
                nodeId: node.id,
            });
        if (node.kind !== 'root') {
            const parent = node.parentId ? graph.nodesById[node.parentId] : undefined;
            if (!parent || !('children' in parent))
                errors.push({
                    code: 'PARENT_MISSING',
                    message: 'Node parent is missing or is not a container.',
                    nodeId: node.id,
                });
            else if (!parent.children.includes(node.id))
                errors.push({
                    code: 'REFERENCE_NOT_RECIPROCAL',
                    message: 'Parent does not reference child.',
                    nodeId: node.id,
                });
        }
        if ('children' in node) {
            if (!Array.isArray(node.children)) {
                errors.push({
                    code: 'REFERENCE_NOT_RECIPROCAL',
                    message: 'Container children must be an array.',
                    nodeId: node.id,
                });
                continue;
            }
            if (new Set(node.children).size !== node.children.length)
                errors.push({
                    code: 'DUPLICATE_CHILD',
                    message: 'Container has duplicate child references.',
                    nodeId: node.id,
                });
            for (const childId of node.children)
                if (graph.nodesById[childId]?.parentId !== node.id)
                    errors.push({
                        code: 'REFERENCE_NOT_RECIPROCAL',
                        message: 'Child does not reference its container.',
                        nodeId: childId,
                    });
        }
        if (node.kind === 'element') {
            if (!expectedElements.has(node.elementId))
                errors.push({
                    code: 'ELEMENT_REFERENCE_INVALID',
                    message: `Element '${node.elementId}' is missing.`,
                    nodeId: node.id,
                });
            if (referencedElements.has(node.elementId))
                errors.push({
                    code: 'ELEMENT_REFERENCE_DUPLICATE',
                    message: `Element '${node.elementId}' has multiple nodes.`,
                    nodeId: node.id,
                });
            referencedElements.add(node.elementId);
        }
    }
    for (const elementId of expectedElements)
        if (!referencedElements.has(elementId))
            errors.push({ code: 'ELEMENT_REFERENCE_INVALID', message: `Element '${elementId}' has no node.` });

    if (root?.kind === 'root') {
        const colors = new Map<string, 0 | 1 | 2>();
        const stack: Array<{ id: string; exit: boolean }> = [{ id: root.id, exit: false }];
        let traversalCount = 0;
        while (stack.length) {
            const entry = stack.pop()!;
            traversalCount += 1;
            if (traversalCount > MAX_SCENE_GRAPH_TRAVERSAL) {
                errors.push({
                    code: 'TRAVERSAL_BUDGET',
                    message: `Scene graph exceeds the ${MAX_SCENE_GRAPH_TRAVERSAL}-step validation budget.`,
                });
                break;
            }
            if (entry.exit) {
                colors.set(entry.id, 2);
                continue;
            }
            if (colors.get(entry.id) === 1) {
                errors.push({ code: 'CYCLE', message: 'Graph contains a cycle.', nodeId: entry.id });
                continue;
            }
            if (colors.get(entry.id) === 2) continue;
            colors.set(entry.id, 1);
            stack.push({ ...entry, exit: true });
            const node = graph.nodesById[entry.id];
            if (node && 'children' in node && Array.isArray(node.children))
                for (const childId of [...node.children].reverse()) stack.push({ id: childId, exit: false });
        }
        for (const id of Object.keys(graph.nodesById))
            if (!colors.has(id))
                errors.push({ code: 'UNREACHABLE', message: 'Node is unreachable from root.', nodeId: id });
    }
    return { ok: errors.length === 0, errors };
}

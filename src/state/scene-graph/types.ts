export type SceneNodeId = string;
export type SceneElementId = string;

/** Canvas-compatible affine matrix. Points are column vectors and matrices compose left-to-right. */
export type Matrix2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export interface NodeTransform {
    translationX: number;
    translationY: number;
    /** Clockwise radians in the canvas coordinate system. */
    rotation: number;
    uniformScale: number;
    pivotX: number;
    pivotY: number;
}

export interface SceneNodeBase {
    id: SceneNodeId;
    parentId: SceneNodeId | null;
    name: string;
    localVisible: boolean;
    localLocked: boolean;
    parentCompensation: Matrix2D;
    userNodeTransform: NodeTransform;
}

export interface SceneRootNode extends SceneNodeBase {
    kind: 'root';
    children: SceneNodeId[];
}

export interface SceneGroupNode extends SceneNodeBase {
    kind: 'group';
    children: SceneNodeId[];
}

export interface SceneElementNode extends SceneNodeBase {
    kind: 'element';
    elementId: SceneElementId;
}

export type SceneNode = SceneRootNode | SceneGroupNode | SceneElementNode;

export interface SceneGraphState {
    rootId: SceneNodeId;
    nodesById: Record<SceneNodeId, SceneNode>;
    revision: number;
}

export const SCENE_ROOT_ID = '__mvmnt_scene_root__';
export const IDENTITY_MATRIX: Matrix2D = Object.freeze([1, 0, 0, 1, 0, 0]);
export const IDENTITY_NODE_TRANSFORM: Readonly<NodeTransform> = Object.freeze({
    translationX: 0,
    translationY: 0,
    rotation: 0,
    uniformScale: 1,
    pivotX: 0,
    pivotY: 0,
});

export function createNodeBase(id: SceneNodeId, parentId: SceneNodeId | null, name: string): SceneNodeBase {
    return {
        id,
        parentId,
        name,
        localVisible: true,
        localLocked: false,
        parentCompensation: [...IDENTITY_MATRIX],
        userNodeTransform: { ...IDENTITY_NODE_TRANSFORM },
    };
}

export function cloneSceneGraph(graph: SceneGraphState): SceneGraphState {
    const nodesById: Record<SceneNodeId, SceneNode> = {};
    for (const [id, node] of Object.entries(graph.nodesById)) {
        nodesById[id] = {
            ...node,
            parentCompensation: [...node.parentCompensation],
            userNodeTransform: { ...node.userNodeTransform },
            ...('children' in node ? { children: [...node.children] } : {}),
        } as SceneNode;
    }
    return { rootId: graph.rootId, nodesById, revision: graph.revision };
}

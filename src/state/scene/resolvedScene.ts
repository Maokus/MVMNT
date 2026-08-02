import type { SceneElement } from '@core/scene/elements';
import { PerspectiveElementRoot } from '@core/render/render-objects/perspective-element-root';
import {
    applyMatrixToPoint,
    identityMatrix,
    matricesEqual,
    multiplyMatrices,
    nodeTransformToMatrix,
    type Matrix2D,
    type SceneGraphState,
    type SceneNode,
    type NodeTransform,
} from '@state/scene-graph';

export interface SceneStructureRecord {
    node: SceneNode;
    depth: number;
    paintIndex: number;
    effectiveVisible: boolean;
    effectiveOpacity: number;
    effectiveLocked: boolean;
    parentWorldTransform: Matrix2D;
    nodeWorldTransform: Matrix2D;
}

export interface SceneStructureIndex {
    graphRevision: number;
    records: SceneStructureRecord[];
    byNodeId: Map<string, SceneStructureRecord>;
}

export interface ResolvedSceneRecord extends SceneStructureRecord {
    elementId?: string;
    element?: SceneElement;
    renderObjects: any[];
    artworkBounds?: { x: number; y: number; width: number; height: number };
    artworkHull?: Array<{ x: number; y: number }>;
}

export interface ResolvedSceneFrame {
    time: number;
    graphRevision: number;
    runtimeVersion: number;
    records: ResolvedSceneRecord[];
    elements: ResolvedSceneRecord[];
    renderObjects: any[];
    byNodeId: Map<string, ResolvedSceneRecord>;
    byElementId: Map<string, ResolvedSceneRecord>;
}

class AffineRenderPayload {
    _worldCorners?: Array<{ x: number; y: number }>;
    constructor(
        private readonly source: any,
        private readonly matrix: Matrix2D,
        private readonly opacity: number
    ) {}

    get fillColor() {
        return this.source.fillColor;
    }

    get baseBounds() {
        return this.source.baseBounds;
    }

    render(ctx: CanvasRenderingContext2D, config: any, time: number) {
        ctx.save();
        ctx.transform(...this.matrix);
        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;
        this.source.render?.(ctx, config, time);
        ctx.restore();
    }

    getVisualBounds() {
        const bounds = this.source.getVisualBounds?.() ?? this.source.getBounds?.();
        if (!bounds) return undefined;
        const corners = [
            applyMatrixToPoint(this.matrix, { x: bounds.x, y: bounds.y }),
            applyMatrixToPoint(this.matrix, { x: bounds.x + bounds.width, y: bounds.y }),
            applyMatrixToPoint(this.matrix, { x: bounds.x + bounds.width, y: bounds.y + bounds.height }),
            applyMatrixToPoint(this.matrix, { x: bounds.x, y: bounds.y + bounds.height }),
        ];
        this._worldCorners = corners;
        const xs = corners.map((point) => point.x);
        const ys = corners.map((point) => point.y);
        return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
        };
    }

    getBounds() {
        return this.getVisualBounds();
    }
}

function transformedPayload(source: any, matrix: Matrix2D, nodeTransform: NodeTransform, opacity: number): any {
    if (source instanceof PerspectiveElementRoot) {
        source.setResolvedNodeTransform(matrix, {
            x: nodeTransform.pivotX,
            y: nodeTransform.pivotY,
        });
        source.setOpacity(source.opacity * opacity);
        return source;
    }
    if (matricesEqual(matrix, identityMatrix()) && opacity === 1) return source;
    return new AffineRenderPayload(source, matrix, opacity);
}

function boundsAndHull(payload: any) {
    const bounds = payload?.getVisualBounds?.() ?? payload?.getBounds?.();
    if (!bounds || Object.values(bounds).some((value) => !Number.isFinite(value))) return {};
    const hull = payload?._worldCorners
        ? payload._worldCorners.map((point: any) => ({ x: point.x, y: point.y }))
        : [
              { x: bounds.x, y: bounds.y },
              { x: bounds.x + bounds.width, y: bounds.y },
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
              { x: bounds.x, y: bounds.y + bounds.height },
          ];
    return { artworkBounds: { ...bounds }, artworkHull: hull };
}

/** Static parent-first traversal cached independently from per-frame plugin evaluation. */
export function buildSceneStructureIndex(graph: SceneGraphState): SceneStructureIndex {
    const records: SceneStructureRecord[] = [];
    const byNodeId = new Map<string, SceneStructureRecord>();
    const root = graph.nodesById[graph.rootId];
    if (!root || root.kind !== 'root') return { graphRevision: graph.revision, records, byNodeId };
    const stack: Array<{
        node: SceneNode;
        depth: number;
        parentWorld: Matrix2D;
        visible: boolean;
        opacity: number;
        locked: boolean;
    }> = [{ node: root, depth: 0, parentWorld: identityMatrix(), visible: true, opacity: 1, locked: false }];
    const visited = new Set<string>();
    let paintIndex = 0;
    while (stack.length) {
        const entry = stack.pop()!;
        if (visited.has(entry.node.id)) continue;
        visited.add(entry.node.id);
        const local = multiplyMatrices(
            entry.node.parentCompensation,
            nodeTransformToMatrix(entry.node.userNodeTransform)
        );
        const nodeWorldTransform = multiplyMatrices(entry.parentWorld, local);
        const effectiveVisible = entry.visible && entry.node.localVisible;
        const effectiveOpacity = entry.opacity * entry.node.localOpacity;
        const effectiveLocked = entry.locked || entry.node.localLocked;
        const record: SceneStructureRecord = {
            node: entry.node,
            depth: entry.depth,
            paintIndex: entry.node.kind === 'element' ? paintIndex++ : -1,
            effectiveVisible,
            effectiveOpacity,
            effectiveLocked,
            parentWorldTransform: entry.parentWorld,
            nodeWorldTransform,
        };
        records.push(record);
        byNodeId.set(entry.node.id, record);
        if ('children' in entry.node) {
            for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
                const child = graph.nodesById[entry.node.children[index]];
                if (child) {
                    stack.push({
                        node: child,
                        depth: entry.depth + 1,
                        parentWorld: nodeWorldTransform,
                        visible: effectiveVisible,
                        opacity: effectiveOpacity,
                        locked: effectiveLocked,
                    });
                }
            }
        }
    }
    return { graphRevision: graph.revision, records, byNodeId };
}

/** Resolve hierarchy, inherited state, content, rendering, and geometry in one parent-first pass. */
export function resolveSceneFrame(options: {
    graph: SceneGraphState;
    time: number;
    runtimeVersion: number;
    config: any;
    getElement: (elementId: string) => SceneElement | undefined;
    structure?: SceneStructureIndex;
    evaluateNode?: (node: SceneNode) => SceneNode;
}): ResolvedSceneFrame {
    const { graph, time, runtimeVersion, config, getElement } = options;
    const records: ResolvedSceneRecord[] = [];
    const elements: ResolvedSceneRecord[] = [];
    const renderObjects: any[] = [];
    const byNodeId = new Map<string, ResolvedSceneRecord>();
    const byElementId = new Map<string, ResolvedSceneRecord>();
    const structure =
        options.structure?.graphRevision === graph.revision ? options.structure : buildSceneStructureIndex(graph);
    for (const entry of structure.records) {
        const node = options.evaluateNode?.(entry.node) ?? entry.node;
        const parentRecord = node.parentId ? byNodeId.get(node.parentId) : undefined;
        const parentWorldTransform = parentRecord?.nodeWorldTransform ?? identityMatrix();
        const nodeWorldTransform = multiplyMatrices(
            parentWorldTransform,
            multiplyMatrices(node.parentCompensation, nodeTransformToMatrix(node.userNodeTransform))
        );
        const effectiveVisible = (parentRecord?.effectiveVisible ?? true) && node.localVisible;
        const effectiveOpacity = (parentRecord?.effectiveOpacity ?? 1) * node.localOpacity;
        const effectiveLocked = (parentRecord?.effectiveLocked ?? false) || node.localLocked;
        const record: ResolvedSceneRecord = {
            ...entry,
            node,
            parentWorldTransform,
            nodeWorldTransform,
            effectiveVisible,
            effectiveOpacity,
            effectiveLocked,
            renderObjects: [],
        };
        if (node.kind === 'element') {
            record.elementId = node.elementId;
            record.element = getElement(node.elementId);
            if (record.effectiveVisible && record.element?.visible) {
                const content = record.element.buildRenderObjects(config, time) ?? [];
                record.renderObjects = content.map((payload: any) =>
                    transformedPayload(payload, record.nodeWorldTransform, node.userNodeTransform, effectiveOpacity)
                );
                renderObjects.push(...record.renderObjects);
                Object.assign(record, boundsAndHull(record.renderObjects[0]));
            }
            elements.push(record);
            byElementId.set(node.elementId, record);
        }
        records.push(record);
        byNodeId.set(entry.node.id, record);
    }
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        if (!('children' in record.node) || !record.effectiveVisible) continue;
        const childBounds = record.node.children
            .map((id) => byNodeId.get(id)?.artworkBounds)
            .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds));
        if (!childBounds.length) continue;
        const left = Math.min(...childBounds.map((bounds) => bounds.x));
        const top = Math.min(...childBounds.map((bounds) => bounds.y));
        const right = Math.max(...childBounds.map((bounds) => bounds.x + bounds.width));
        const bottom = Math.max(...childBounds.map((bounds) => bounds.y + bounds.height));
        record.artworkBounds = { x: left, y: top, width: right - left, height: bottom - top };
        record.artworkHull = childBounds.flatMap((bounds) => [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
            { x: bounds.x, y: bounds.y + bounds.height },
        ]);
    }
    return {
        time,
        graphRevision: graph.revision,
        runtimeVersion,
        records,
        elements,
        renderObjects,
        byNodeId,
        byElementId,
    };
}

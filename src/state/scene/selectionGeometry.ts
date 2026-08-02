import type { ResolvedSceneFrame, ResolvedSceneRecord } from './resolvedScene';
import { applyMatrixToPoint, invertMatrix } from '@state/scene-graph';

export interface SelectionGeometry {
    records: ResolvedSceneRecord[];
    bounds: { x: number; y: number; width: number; height: number };
    hull: Array<{ x: number; y: number }>;
    pivot: { x: number; y: number };
    corners?: Array<{ x: number; y: number }>;
}

export function selectableOwnerForElement(
    frame: ResolvedSceneFrame,
    elementId: string,
    editingContainerId: string
): ResolvedSceneRecord | null {
    let record = frame.byElementId.get(elementId);
    if (!record) return null;
    while (record.node.parentId && record.node.parentId !== editingContainerId) {
        const parent = frame.byNodeId.get(record.node.parentId);
        if (!parent) return null;
        record = parent;
    }
    return record.node.parentId === editingContainerId ? record : null;
}

export function selectionGeometry(frame: ResolvedSceneFrame, nodeIds: readonly string[]): SelectionGeometry | null {
    const records = [...new Set(nodeIds)]
        .map((id) => frame.byNodeId.get(id))
        .filter((record): record is ResolvedSceneRecord => Boolean(record?.artworkBounds));
    if (!records.length) return null;
    const left = Math.min(...records.map((record) => record.artworkBounds!.x));
    const top = Math.min(...records.map((record) => record.artworkBounds!.y));
    const right = Math.max(...records.map((record) => record.artworkBounds!.x + record.artworkBounds!.width));
    const bottom = Math.max(...records.map((record) => record.artworkBounds!.y + record.artworkBounds!.height));
    const bounds = { x: left, y: top, width: right - left, height: bottom - top };
    let corners: Array<{ x: number; y: number }> | undefined;
    let pivot = { x: left + bounds.width / 2, y: top + bounds.height / 2 };
    if (records.length === 1 && records[0].artworkHull?.length) {
        const inverse = invertMatrix(records[0].nodeWorldTransform);
        if (inverse) {
            const localHull = records[0].artworkHull.map((point) => applyMatrixToPoint(inverse, point));
            const localLeft = Math.min(...localHull.map((point) => point.x));
            const localTop = Math.min(...localHull.map((point) => point.y));
            const localRight = Math.max(...localHull.map((point) => point.x));
            const localBottom = Math.max(...localHull.map((point) => point.y));
            corners = [
                { x: localLeft, y: localTop },
                { x: localRight, y: localTop },
                { x: localRight, y: localBottom },
                { x: localLeft, y: localBottom },
            ].map((point) => applyMatrixToPoint(records[0].nodeWorldTransform, point));
            pivot = applyMatrixToPoint(records[0].nodeWorldTransform, {
                x: records[0].node.userNodeTransform.pivotX,
                y: records[0].node.userNodeTransform.pivotY,
            });
        }
    }
    return {
        records,
        bounds,
        hull: records.flatMap((record) => record.artworkHull ?? []),
        pivot,
        corners,
    };
}

function intersects(
    first: { x: number; y: number; width: number; height: number },
    second: { x: number; y: number; width: number; height: number }
) {
    return !(
        first.x + first.width < second.x ||
        second.x + second.width < first.x ||
        first.y + first.height < second.y ||
        second.y + second.height < first.y
    );
}

function contains(
    outer: { x: number; y: number; width: number; height: number },
    inner: { x: number; y: number; width: number; height: number }
) {
    return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height
    );
}

/** Left-to-right marquee contains; right-to-left marquee intersects. */
export function marqueeNodeIds(
    frame: ResolvedSceneFrame,
    _editingContainerId: string,
    start: { x: number; y: number },
    end: { x: number; y: number }
): string[] {
    const marquee = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
    const containment = end.x >= start.x;
    const leaves = new Map<string, ResolvedSceneRecord>();
    for (const leaf of frame.elements) {
        if (!leaf.elementId || !leaf.effectiveVisible || leaf.effectiveLocked || !leaf.artworkBounds) continue;
        leaves.set(leaf.node.id, leaf);
    }
    return [...leaves.values()]
        .filter((leaf) =>
            containment ? contains(marquee, leaf.artworkBounds!) : intersects(marquee, leaf.artworkBounds!)
        )
        .sort((left, right) => left.paintIndex - right.paintIndex)
        .map((record) => record.node.id);
}

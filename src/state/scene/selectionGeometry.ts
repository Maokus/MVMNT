import type { ResolvedSceneFrame, ResolvedSceneRecord } from './resolvedScene';

export interface SelectionGeometry {
    records: ResolvedSceneRecord[];
    bounds: { x: number; y: number; width: number; height: number };
    hull: Array<{ x: number; y: number }>;
    pivot: { x: number; y: number };
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
    return {
        records,
        bounds,
        hull: records.flatMap((record) => record.artworkHull ?? []),
        pivot: { x: left + bounds.width / 2, y: top + bounds.height / 2 },
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
    editingContainerId: string,
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
    return frame.records
        .filter(
            (record) =>
                record.node.parentId === editingContainerId &&
                record.node.kind !== 'root' &&
                record.effectiveVisible &&
                !record.effectiveLocked &&
                record.artworkBounds &&
                (containment ? contains(marquee, record.artworkBounds) : intersects(marquee, record.artworkBounds))
        )
        .map((record) => record.node.id);
}

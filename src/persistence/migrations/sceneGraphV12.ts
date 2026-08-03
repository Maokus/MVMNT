import { createFlatSceneGraph } from '@state/scene-graph';

export const SCENE_GRAPH_SCHEMA_VERSION = 12;

function legacyZIndex(element: unknown): number | null {
    if (!element || typeof element !== 'object') return null;
    const properties = (element as Record<string, any>).properties;
    const binding = properties?.zIndex;
    const value =
        typeof binding === 'number'
            ? binding
            : binding && typeof binding === 'object' && binding.type === 'constant'
              ? binding.value
              : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * V6/V7 `elementsOrder` was the Layers-panel order (front to back), while the
 * renderer used each element's zIndex (low to high). A graph's child order is
 * its paint order, so retain the legacy zIndex ordering before retiring it.
 */
function legacyPaintOrder(elements: Record<string, any>, elementsOrder: unknown): string[] {
    const listedIds = Array.isArray(elementsOrder)
        ? elementsOrder.filter((id: unknown): id is string => typeof id === 'string' && id in elements)
        : Object.keys(elements);
    const ids = [...listedIds, ...Object.keys(elements).filter((id) => !listedIds.includes(id))];
    return ids
        .map((id, index) => ({ id, index, zIndex: legacyZIndex(elements[id]) }))
        .sort((a, b) => {
            // This mirrors the legacy scene store: unbound zIndex values stayed
            // behind explicitly layered elements and preserved their list order.
            const aZ = a.zIndex ?? Number.NEGATIVE_INFINITY;
            const bZ = b.zIndex ?? Number.NEGATIVE_INFINITY;
            return aZ === bZ ? a.index - b.index : aZ - bZ;
        })
        .map(({ id }) => id);
}

/** Add the host-owned scene graph while preserving the legacy rendered appearance. */
export function migrateSceneGraphV12<T extends Record<string, any>>(envelope: T): T {
    const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
    if (version >= SCENE_GRAPH_SCHEMA_VERSION) return envelope;
    const scene = envelope.scene && typeof envelope.scene === 'object' ? envelope.scene : {};
    const elements = scene.elements && typeof scene.elements === 'object' ? scene.elements : {};
    const ids = legacyPaintOrder(elements, scene.elementsOrder);
    return {
        ...envelope,
        schemaVersion: SCENE_GRAPH_SCHEMA_VERSION,
        scene: { ...scene, graph: createFlatSceneGraph(ids), elementsOrder: undefined },
    } as T;
}

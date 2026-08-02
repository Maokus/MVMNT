import { createFlatSceneGraph } from '@state/scene-graph';

export const SCENE_GRAPH_SCHEMA_VERSION = 12;

/** Add the host-owned scene graph while preserving the document's canonical flat paint order. */
export function migrateSceneGraphV12<T extends Record<string, any>>(envelope: T): T {
    const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
    if (version >= SCENE_GRAPH_SCHEMA_VERSION) return envelope;
    const scene = envelope.scene && typeof envelope.scene === 'object' ? envelope.scene : {};
    const elements = scene.elements && typeof scene.elements === 'object' ? scene.elements : {};
    const ids = Array.isArray(scene.elementsOrder)
        ? scene.elementsOrder.filter((id: unknown): id is string => typeof id === 'string' && id in elements)
        : Object.keys(elements);
    return {
        ...envelope,
        schemaVersion: SCENE_GRAPH_SCHEMA_VERSION,
        scene: { ...scene, graph: createFlatSceneGraph(ids), elementsOrder: undefined },
    } as T;
}

import { describe, expect, it } from 'vitest';
import { createFlatSceneGraph, groupSceneNodes } from '@state/scene-graph';
import { marqueeNodeIds, selectableOwnerForElement, selectionGeometry } from '@state/scene/selectionGeometry';
import { resolveSceneFrame } from '@state/scene/resolvedScene';

function frameFor(graph: ReturnType<typeof createFlatSceneGraph>, positions: Record<string, number>) {
    return resolveSceneFrame({
        graph,
        time: 0,
        runtimeVersion: 1,
        config: {},
        getElement: (elementId) =>
            ({
                visible: true,
                buildRenderObjects: () => [
                    {
                        render() {},
                        getVisualBounds: () => ({ x: positions[elementId], y: 0, width: 10, height: 10 }),
                    },
                ],
            }) as any,
    });
}

describe('recursive scene selection geometry', () => {
    it('maps leaf artwork to only the direct child exposed by the editing scope', () => {
        let graph = createFlatSceneGraph(['a']);
        graph = groupSceneNodes(graph, ['element:a'], 'group:inner');
        graph = groupSceneNodes(graph, ['group:inner'], 'group:outer');
        const frame = frameFor(graph, { a: 0 });
        expect(selectableOwnerForElement(frame, 'a', graph.rootId)?.node.id).toBe('group:outer');
        expect(selectableOwnerForElement(frame, 'a', 'group:outer')?.node.id).toBe('group:inner');
        expect(selectableOwnerForElement(frame, 'a', 'group:inner')?.node.id).toBe('element:a');
    });

    it('tests descendant artwork instead of treating empty group bounds as a hit surface', () => {
        let graph = createFlatSceneGraph(['a', 'b']);
        graph = groupSceneNodes(graph, ['element:a', 'element:b'], 'group:pair');
        const frame = frameFor(graph, { a: 0, b: 100 });
        expect(marqueeNodeIds(frame, graph.rootId, { x: 60, y: -2 }, { x: 40, y: 12 })).toEqual([]);
        expect(marqueeNodeIds(frame, graph.rootId, { x: 15, y: -2 }, { x: -2, y: 12 })).toEqual(['element:a']);
    });

    it('returns an oriented box for one transformed node and an axis-aligned box for multiple nodes', () => {
        const graph = createFlatSceneGraph(['a', 'b']);
        graph.nodesById['element:a'].userNodeTransform.rotation = Math.PI / 4;
        const frame = frameFor(graph, { a: 0, b: 100 });
        const single = selectionGeometry(frame, ['element:a']);
        expect(single?.corners).toHaveLength(4);
        expect(single?.corners?.[0].y).not.toBeCloseTo(single?.corners?.[1].y ?? 0);
        const multiple = selectionGeometry(frame, ['element:a', 'element:b']);
        expect(multiple?.corners).toBeUndefined();
    });
});

import { describe, expect, it, vi } from 'vitest';
import { createFlatSceneGraph } from '@state/scene-graph';
import { resolveSceneFrame } from '@state/scene/resolvedScene';

describe('resolved scene frame', () => {
    it('builds visible content once and applies node transforms to render and bounds', () => {
        const graph = createFlatSceneGraph(['shape']);
        const node = graph.nodesById['element:shape'];
        node.userNodeTransform.translationX = 10;
        node.userNodeTransform.translationY = 20;
        const render = vi.fn();
        const buildRenderObjects = vi.fn(() => [
            { render, getVisualBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }) },
        ]);
        const element = { id: 'shape', visible: true, buildRenderObjects } as any;
        const frame = resolveSceneFrame({
            graph,
            time: 1,
            runtimeVersion: 4,
            config: {},
            getElement: () => element,
        });
        expect(buildRenderObjects).toHaveBeenCalledTimes(1);
        expect(frame.elements[0]).toMatchObject({
            effectiveVisible: true,
            effectiveLocked: false,
            artworkBounds: { x: 11, y: 22, width: 3, height: 4 },
        });
        const ctx = { save: vi.fn(), restore: vi.fn(), transform: vi.fn() } as any;
        frame.renderObjects[0].render(ctx, {}, 1);
        expect(ctx.transform).toHaveBeenCalledWith(1, 0, 0, 1, 10, 20);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('inherits hidden and locked state through arbitrary ancestors', () => {
        const graph = createFlatSceneGraph(['shape']);
        const root = graph.nodesById[graph.rootId];
        const leaf = graph.nodesById['element:shape'];
        if (root.kind !== 'root' || leaf.kind !== 'element') throw new Error('invalid fixture');
        graph.nodesById.group = {
            ...leaf,
            id: 'group',
            kind: 'group',
            parentId: root.id,
            localVisible: false,
            localLocked: true,
            children: [leaf.id],
        };
        delete (graph.nodesById.group as any).elementId;
        root.children = ['group'];
        leaf.parentId = 'group';
        const buildRenderObjects = vi.fn();
        const frame = resolveSceneFrame({
            graph,
            time: 0,
            runtimeVersion: 1,
            config: {},
            getElement: () => ({ visible: true, buildRenderObjects }) as any,
        });
        expect(frame.byElementId.get('shape')).toMatchObject({ effectiveVisible: false, effectiveLocked: true });
        expect(buildRenderObjects).not.toHaveBeenCalled();
    });
});

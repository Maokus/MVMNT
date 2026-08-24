import { describe, expect, it, vi } from 'vitest';
import { createFlatSceneGraph, groupSceneNodes } from '@state/scene-graph';
import { resolveSceneFrame } from '@state/scene/resolvedScene';
import { PerspectiveElementRoot } from '@core/render/render-objects/perspective-element-root';
import { CompositeLayer, Rectangle } from '@core/render/render-objects';

describe('resolved scene frame', () => {
    it('isolates the complete element output for a non-normal host blend mode', () => {
        const graph = createFlatSceneGraph(['shape']);
        const node = graph.nodesById['element:shape'];
        if (node.kind !== 'element') throw new Error('invalid fixture');
        node.outputBlendMode = 'multiply';
        const first = new Rectangle(0, 0, 10, 10, { fillColor: '#fff' }).setBlendMode('screen');
        const second = new Rectangle(5, 5, 10, 10, { fillColor: '#fff' });
        const frame = resolveSceneFrame({
            graph,
            time: 0,
            runtimeVersion: 1,
            config: {},
            getElement: () => ({ visible: true, buildRenderObjects: () => [first, second] }) as any,
        });

        expect(frame.renderObjects[0]).toBeInstanceOf(CompositeLayer);
        expect(frame.renderObjects[0].layerBlendMode).toBe('multiply');
        expect(frame.renderObjects[0].getChildren()).toEqual([first, second]);
        expect(first.blendMode).toBe('screen');
    });

    it('sets perspective output blending only from the host node', () => {
        const graph = createFlatSceneGraph(['perspective']);
        const node = graph.nodesById['element:perspective'];
        if (node.kind !== 'element') throw new Error('invalid fixture');
        node.outputBlendMode = 'screen';
        const payload = new PerspectiveElementRoot('perspective', {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomRight: { x: 1, y: 1 },
            bottomLeft: { x: 0, y: 1 },
        });
        payload.baseBounds = { x: 0, y: 0, width: 10, height: 10 };
        payload.addChild(new Rectangle(0, 0, 10, 10, { fillColor: '#fff' }).setBlendMode('multiply'));

        resolveSceneFrame({
            graph,
            time: 0,
            runtimeVersion: 1,
            config: {},
            getElement: () => ({ visible: true, buildRenderObjects: () => [payload] }) as any,
        });

        expect(payload.outputBlendMode).toBe('screen');
    });

    it('multiplies group and element opacity into the render payload', () => {
        let graph = createFlatSceneGraph(['shape']);
        graph = groupSceneNodes(graph, ['element:shape'], 'group');
        graph.nodesById.group.localOpacity = 0.5;
        graph.nodesById['element:shape'].localOpacity = 0.4;
        const render = vi.fn();
        const frame = resolveSceneFrame({
            graph,
            time: 0,
            runtimeVersion: 1,
            config: {},
            getElement: () =>
                ({
                    visible: true,
                    buildRenderObjects: () => [
                        { render, getVisualBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }) },
                    ],
                }) as any,
        });
        expect(frame.byNodeId.get('element:shape')?.effectiveOpacity).toBeCloseTo(0.2);
        const context = { save: vi.fn(), restore: vi.fn(), transform: vi.fn(), globalAlpha: 1 } as any;
        frame.renderObjects[0].render(context, {}, 0);
        expect(context.globalAlpha).toBeCloseTo(0.2);
        expect(render).toHaveBeenCalledOnce();
    });

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

    it('composes arbitrary-depth ancestry into perspective payloads and recursive bounds', () => {
        let graph = createFlatSceneGraph(['perspective']);
        graph = groupSceneNodes(graph, ['element:perspective'], 'group:inner');
        graph = groupSceneNodes(graph, ['group:inner'], 'group:outer');
        graph.nodesById['group:outer'].userNodeTransform.translationX = 10;
        graph.nodesById['group:inner'].userNodeTransform.translationY = 20;
        graph.nodesById['element:perspective'].userNodeTransform.translationX = 3;
        const payload = new PerspectiveElementRoot(
            'perspective',
            {
                topLeft: { x: 0, y: 0 },
                topRight: { x: 1, y: 0 },
                bottomRight: { x: 1, y: 1 },
                bottomLeft: { x: 0, y: 1 },
            },
            5,
            0
        );
        payload.baseBounds = { x: 0, y: 0, width: 100, height: 50 };
        payload.visualBounds = { ...payload.baseBounds };
        payload.setOriginFraction(0, 0);
        const frame = resolveSceneFrame({
            graph,
            time: 0,
            runtimeVersion: 1,
            config: {},
            getElement: () => ({ visible: true, buildRenderObjects: () => [payload] }) as any,
        });
        expect(payload.getAffineTransform()).toMatchObject({ e: 18, f: 20 });
        expect(frame.byNodeId.get('group:outer')?.artworkBounds).toEqual(
            frame.byNodeId.get('element:perspective')?.artworkBounds
        );
    });

    it('recomputes perspective camera geometry after applying node transforms', () => {
        const graph = createFlatSceneGraph(['perspective']);
        const node = graph.nodesById['element:perspective'];
        node.userNodeTransform.translationX = 180;
        node.userNodeTransform.translationY = 70;
        node.userNodeTransform.rotation = 0.25;
        node.userNodeTransform.scaleX = 1.4;
        node.userNodeTransform.scaleY = 0.9;
        node.userNodeTransform.pivotX = 50;
        node.userNodeTransform.pivotY = 25;
        const payload = new PerspectiveElementRoot('perspective', {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomRight: { x: 1, y: 1 },
            bottomLeft: { x: 0, y: 1 },
        });
        payload.baseBounds = { x: 0, y: 0, width: 100, height: 50 };
        payload.visualBounds = { ...payload.baseBounds };
        payload.configureCamera(
            {
                rotationX: 18,
                rotationY: -24,
                strength: 65,
                pivotX: 0.5,
                pivotY: 0.5,
                vanishingPointX: 0.5,
                vanishingPointY: 0.5,
            },
            { width: 800, height: 450 },
            true
        );
        const before = payload.perspectiveWarp;

        resolveSceneFrame({
            graph,
            time: 0,
            runtimeVersion: 1,
            config: {},
            getElement: () => ({ visible: true, buildRenderObjects: () => [payload] }) as any,
        });

        expect(payload.perspectiveWarp).not.toEqual(before);
        expect(payload.getAffineTransform()).toMatchObject({
            e: expect.any(Number),
            f: expect.any(Number),
        });
        expect(payload.getProjectedCorners()).not.toBeNull();
    });

    it('evaluates animated parent properties before descendant world geometry', () => {
        let graph = createFlatSceneGraph(['shape']);
        graph = groupSceneNodes(graph, ['element:shape'], 'group:animated');
        const element = {
            id: 'shape',
            visible: true,
            buildRenderObjects: () => [
                { render: vi.fn(), getVisualBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }) },
            ],
        } as any;
        const frameAt = (translationX: number) =>
            resolveSceneFrame({
                graph,
                time: translationX,
                runtimeVersion: 1,
                config: {},
                getElement: () => element,
                evaluateNode: (node) =>
                    node.id === 'group:animated'
                        ? { ...node, userNodeTransform: { ...node.userNodeTransform, translationX } }
                        : node,
            });

        expect(frameAt(0).byElementId.get('shape')?.artworkBounds?.x).toBe(0);
        expect(frameAt(75).byElementId.get('shape')?.artworkBounds?.x).toBe(75);
        expect(frameAt(75).byNodeId.get('group:animated')?.artworkBounds?.x).toBe(75);
    });
});

import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveElementRoot, Rectangle, type Arc, type RenderObject } from '@core/render/render-objects';
import { BoundSceneElement } from '@core/scene/runtime/bound-scene-element';
import { basicShapes } from '../misc/basic-shapes';
import { sceneElementRegistry } from '@core/scene/registry';
import type { PropertyDefinition } from '@core/scene/runtime/schema';
import { enableFeatureForSession } from '@utils/featureFlags';

afterEach(() => enableFeatureForSession('elementPerspectiveWarp', false));

class BoundsTestElement extends BoundSceneElement {
    constructor(config: Record<string, unknown> = {}) {
        super('bounds-test', 'bounds-test', config);
    }

    protected override _buildRenderObjects(): RenderObject[] {
        return [new Rectangle(0, 0, 200, 100, { fillColor: '#fff' })];
    }
}

describe('BoundSceneElement bounds', () => {
    it('keeps warp disabled by default and uses a perspective root only when opted in', () => {
        enableFeatureForSession('elementPerspectiveWarp', true);
        const ordinary = new BoundsTestElement();
        const warped = new BoundsTestElement({ warpEnabled: true, perspectiveRotationY: 20 });
        expect(ordinary.buildRenderObjects({}, 0)[0]).not.toBeInstanceOf(PerspectiveElementRoot);
        expect(warped.buildRenderObjects({}, 0)[0]).toBeInstanceOf(PerspectiveElementRoot);
    });

    it('makes the identity warp exactly equivalent to ordinary affine bounds', () => {
        const element = new BoundsTestElement({ offsetX: 500, offsetY: 300, anchorX: 0.5, anchorY: 0.5 });
        const ordinary = element.buildRenderObjects({}, 0)[0].getVisualBounds();
        enableFeatureForSession('elementPerspectiveWarp', true);
        const warped = new BoundsTestElement({
            warpEnabled: true,
            offsetX: 500,
            offsetY: 300,
            anchorX: 0.5,
            anchorY: 0.5,
        })
            .buildRenderObjects({}, 0)[0]
            .getVisualBounds();
        expect(warped).toEqual(ordinary);
    });

    it('projects bounds for a perspective rotation', () => {
        enableFeatureForSession('elementPerspectiveWarp', true);
        const root = new BoundsTestElement({
            warpEnabled: true,
            perspectiveRotationX: 20,
            perspectiveRotationY: -15,
        }).buildRenderObjects({}, 0)[0] as PerspectiveElementRoot;
        expect(root.warpMatrix).not.toBeNull();
        expect(root.getVisualBounds()).not.toEqual({ x: -100, y: -50, width: 200, height: 100 });
    });

    it('leaves output compositing to the host for perspective elements', () => {
        enableFeatureForSession('elementPerspectiveWarp', true);
        const element = sceneElementRegistry.createElement('basicShapes', {
            id: 'perspective-multiply-test',
            warpEnabled: true,
            perspectiveRotationY: 20,
        });
        const root = element!.buildRenderObjects({}, 0)[0] as PerspectiveElementRoot;

        expect(root.getChildren()).toHaveLength(2);
        expect(root.getChildren().map((child) => child.blendMode)).toEqual([null, null]);
        expect(root.outputBlendMode).toBeNull();
    });

    it('keeps a quarter-turn element visible when its projection is not edge-on', () => {
        enableFeatureForSession('elementPerspectiveWarp', true);
        const root = new BoundsTestElement({
            warpEnabled: true,
            perspectiveRotationX: 90,
        }).buildRenderObjects({}, 0)[0] as PerspectiveElementRoot;

        expect(root.isPerspectiveEdgeOn).toBe(false);
        expect(root.visible).toBe(true);
    });

    it('hides an edge-on perspective element while retaining a small bound around its projected edge', () => {
        const root = new PerspectiveElementRoot(
            'edge-on',
            {
                topLeft: { x: 0.5, y: 0 },
                topRight: { x: 0.5, y: 0 },
                bottomRight: { x: 0.5, y: 1 },
                bottomLeft: { x: 0.5, y: 1 },
            },
            0,
            0,
            1,
            1,
            1,
            true
        );
        root.baseBounds = { x: 0, y: 0, width: 200, height: 100 };

        expect(root.getVisualBounds()).toEqual({ x: 99, y: -1, width: 2, height: 102 });
        expect(root.renderPerspective({} as any, {} as CanvasRenderingContext2D, {}, 0)).toBe(true);
        expect(() => root.render({} as CanvasRenderingContext2D, {}, 0)).not.toThrow();
    });

    it('keeps position out of the element wrapper so the host node can own it', () => {
        const element = new BoundsTestElement({ offsetX: 500, offsetY: 300, anchorX: 0.5, anchorY: 0.5 });

        const [container] = element.buildRenderObjects({}, 0);
        const bounds = container.getVisualBounds();

        expect(bounds).toEqual({ x: -100, y: -50, width: 200, height: 100 });
        expect(element.getBinding('offsetX')).toBeUndefined();
        expect(element.getBinding('offsetY')).toBeUndefined();
    });

    it('keeps rotation and anchor out of element bindings and uses a centered content origin', () => {
        const element = new BoundsTestElement({ elementRotation: 90, anchorX: 0, anchorY: 0 });
        const [container] = element.buildRenderObjects({}, 0);

        expect(element.getBinding('elementRotation')).toBeUndefined();
        expect(element.getBinding('anchorX')).toBeUndefined();
        expect(element.getBinding('anchorY')).toBeUndefined();
        expect(container.rotation).toBe(0);
        expect(container.getVisualBounds()).toEqual({ x: -100, y: -50, width: 200, height: 100 });
    });

    it('uses the shared content anchor to place layout bounds at the local origin', () => {
        const element = new BoundsTestElement({ contentAnchorX: 0, contentAnchorY: 1 });
        const [container] = element.buildRenderObjects({}, 0);

        expect(container.getVisualBounds()).toEqual({ x: 0, y: -100, width: 200, height: 100 });
        expect(container.originX).toBe(0);
        expect(container.originY).toBe(100);
    });
});

describe('BasicShapesElement angles', () => {
    it('stores arc angles in degrees and renders arcs in radians', () => {
        const element = sceneElementRegistry.createElement('basicShapes', {
            id: 'arc-test',
            shapeType: 'circle',
            startAngle: 90,
            endAngle: 180,
        });
        expect(element).not.toBeNull();
        const [container] = element!.buildRenderObjects({}, 0);
        const arc = (container as any).children[1] as Arc;

        expect(arc.startAngle).toBeCloseTo(Math.PI / 2);
        expect(arc.endAngle).toBeCloseTo(Math.PI);
    });
});

describe('Basic Shapes property visibility', () => {
    const schema = basicShapes.schema as {
        tabs: Array<{ groups: Array<{ properties: PropertyDefinition[] }> }>;
    };
    const properties = schema.tabs.flatMap((tab) => tab.groups).flatMap((group) => group.properties);

    it('only shows arc controls for circles', () => {
        for (const key of ['startAngle', 'endAngle', 'anticlockwise', 'circleFillStyle']) {
            expect(properties.find((property) => property.key === key)?.visibleWhen).toEqual([
                { key: 'shapeType', equals: 'circle' },
            ]);
        }
    });

    it('only shows polygon and line controls for their matching shape types', () => {
        expect(properties.find((property) => property.key === 'sides')?.visibleWhen).toEqual([
            { key: 'shapeType', equals: 'triangle' },
        ]);
        expect(properties.find((property) => property.key === 'lineLength')?.visibleWhen).toEqual([
            { key: 'shapeType', equals: 'line' },
        ]);
    });
});

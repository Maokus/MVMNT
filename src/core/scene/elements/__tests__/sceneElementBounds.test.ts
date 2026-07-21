import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveElementRoot, Rectangle, type Arc, type RenderObject } from '@core/render/render-objects';
import { SceneElement } from '../base';
import { BasicShapesElement } from '..';
import { enableFeatureForSession } from '@utils/featureFlags';

afterEach(() => enableFeatureForSession('elementPerspectiveWarp', false));

class BoundsTestElement extends SceneElement {
    constructor(config: Record<string, unknown> = {}) {
        super('bounds-test', 'bounds-test', config);
    }

    protected override _buildRenderObjects(): RenderObject[] {
        return [new Rectangle(0, 0, 200, 100, { fillColor: '#fff' })];
    }
}

describe('SceneElement bounds', () => {
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
            warpEnabled: true, offsetX: 500, offsetY: 300, anchorX: 0.5, anchorY: 0.5,
        }).buildRenderObjects({}, 0)[0].getVisualBounds();
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

    it('keeps an element visible when it is exactly edge-on', () => {
        enableFeatureForSession('elementPerspectiveWarp', true);
        const root = new BoundsTestElement({
            warpEnabled: true,
            perspectiveRotationX: 90,
        }).buildRenderObjects({}, 0)[0] as PerspectiveElementRoot;

        expect(root.isPerspectiveEdgeOn).toBe(true);
        expect(root.visible).toBe(true);
    });

    it('does not union transformed wrapper bounds with untransformed child bounds', () => {
        const element = new BoundsTestElement({
            offsetX: 500,
            offsetY: 300,
            anchorX: 0.5,
            anchorY: 0.5,
        });

        const [container] = element.buildRenderObjects({}, 0);
        const bounds = container.getVisualBounds();

        expect(bounds).toEqual({ x: 400, y: 250, width: 200, height: 100 });
    });

    it('stores element rotation in degrees and renders in radians', () => {
        const element = new BoundsTestElement({
            elementRotation: 90,
        });

        const [container] = element.buildRenderObjects({}, 0);

        expect(element.elementRotation).toBe(90);
        expect(container.rotation).toBeCloseTo(Math.PI / 2);
        expect((container as any).elementTransform.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('keeps radians setter compatibility by converting to degrees', () => {
        const element = new BoundsTestElement();

        element.setElementRotationRadians(Math.PI);

        expect(element.elementRotation).toBeCloseTo(180);
    });
});

describe('BasicShapesElement angles', () => {
    it('stores arc angles in degrees and renders arcs in radians', () => {
        const element = new BasicShapesElement('arc-test', {
            shapeType: 'circle',
            startAngle: 90,
            endAngle: 180,
        });

        const [container] = element.buildRenderObjects({}, 0);
        const arc = (container as any).children[1] as Arc;

        expect(arc.startAngle).toBeCloseTo(Math.PI / 2);
        expect(arc.endAngle).toBeCloseTo(Math.PI);
    });
});

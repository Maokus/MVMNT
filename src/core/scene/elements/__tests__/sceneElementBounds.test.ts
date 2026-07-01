import { describe, expect, it } from 'vitest';
import { Rectangle, type Arc, type RenderObject } from '@core/render/render-objects';
import { SceneElement } from '../base';
import { BasicShapesElement } from '..';

class BoundsTestElement extends SceneElement {
    constructor(config: Record<string, unknown> = {}) {
        super('bounds-test', 'bounds-test', config);
    }

    protected override _buildRenderObjects(): RenderObject[] {
        return [new Rectangle(0, 0, 200, 100, { fillColor: '#fff' })];
    }
}

describe('SceneElement bounds', () => {
    it('does not union transformed wrapper bounds with untransformed child bounds', () => {
        const element = new BoundsTestElement({
            offsetX: 500,
            offsetY: 300,
            anchorX: 0.5,
            anchorY: 0.5,
        });

        const [container] = element.buildRenderObjects({}, 0);
        const bounds = container.getBounds();

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

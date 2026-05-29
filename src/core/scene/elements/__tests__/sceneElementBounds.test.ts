import { describe, expect, it } from 'vitest';
import { Rectangle, type RenderObject } from '@core/render/render-objects';
import { SceneElement } from '../base';

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
});

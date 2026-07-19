import { describe, expect, it } from 'vitest';
import { MIDIVisualizerCore } from '@core/visualizer-core';

describe('MIDIVisualizerCore interaction bounds', () => {
    it('uses visual bounds for hit testing when render objects no longer expose getBounds', () => {
        const element = {
            id: 'rectangle-1',
            zIndex: 2,
            visible: true,
            buildRenderObjects: () => [
                {
                    getVisualBounds: () => ({ x: 10, y: 20, width: 30, height: 40 }),
                    _worldCorners: [
                        { x: 10, y: 20 },
                        { x: 40, y: 20 },
                        { x: 40, y: 60 },
                        { x: 10, y: 60 },
                    ],
                },
            ],
        };
        const visualizer = {
            getSceneConfig: () => ({}),
            _getSceneElements: () => [element],
            currentTime: 0,
        };

        const bounds = MIDIVisualizerCore.prototype.getElementBoundsAtTime.call(visualizer, 0);

        expect(bounds).toEqual([
            expect.objectContaining({
                id: 'rectangle-1',
                bounds: { x: 10, y: 20, width: 30, height: 40 },
            }),
        ]);
    });
});

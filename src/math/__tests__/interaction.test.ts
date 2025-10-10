import { describe, expect, it } from 'vitest';
import { getCanvasWorldPoint } from '../interaction';

describe('getCanvasWorldPoint', () => {
    it('maps coordinates using logical viewport dimensions when provided', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 3840;
        canvas.height = 2160;
        canvas.dataset.logicalWidth = '1920';
        canvas.dataset.logicalHeight = '1080';
        canvas.getBoundingClientRect = () => ({
            left: 0,
            top: 0,
            width: 960,
            height: 540,
            right: 960,
            bottom: 540,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }) as DOMRect;

        const point = getCanvasWorldPoint(canvas, 480, 270);

        expect(point.x).toBeCloseTo(960);
        expect(point.y).toBeCloseTo(540);
    });

    it('falls back to canvas backing dimensions when logical sizing is absent', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        canvas.getBoundingClientRect = () => ({
            left: 10,
            top: 20,
            width: 640,
            height: 360,
            right: 650,
            bottom: 380,
            x: 10,
            y: 20,
            toJSON: () => ({}),
        }) as DOMRect;

        const point = getCanvasWorldPoint(canvas, 330, 200);

        expect(point.x).toBeCloseTo(640);
        expect(point.y).toBeCloseTo(360);
    });
});

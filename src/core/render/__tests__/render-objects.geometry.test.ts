import { describe, expect, it } from 'vitest';
import { BezierPath } from '../render-objects/bezier';
import { Arc } from '../render-objects/arc';
import { Text } from '../render-objects/text';

interface Point {
    x: number;
    y: number;
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, steps = 200): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const inv = 1 - t;
        const x =
            inv * inv * inv * p0.x +
            3 * inv * inv * t * p1.x +
            3 * inv * t * t * p2.x +
            t * t * t * p3.x;
        const y =
            inv * inv * inv * p0.y +
            3 * inv * inv * t * p1.y +
            3 * inv * t * t * p2.y +
            t * t * t * p3.y;
        pts.push({ x, y });
    }
    return pts;
}

describe('BezierPath render object', () => {
    it('computes bounds for quadratic curves including interior extrema', () => {
        const path = new BezierPath();
        path.setStroke(null, 0);
        path.setFill(null);
        path.moveTo(0, 0);
        path.quadraticCurveTo(5, 10, 10, 0);

        const bounds = path.getVisualBounds();
        expect(bounds.x).toBeCloseTo(0, 6);
        expect(bounds.y).toBeCloseTo(0, 6);
        expect(bounds.width).toBeCloseTo(10, 6);
        expect(bounds.height).toBeCloseTo(5, 6);
    });

    it('includes cubic curve interior extrema in bounds', () => {
        const path = new BezierPath();
        path.setStroke(null, 0);
        path.setFill(null);
        path.moveTo(0, 0);
        path.bezierCurveTo(100, 150, -100, 150, 0, 0);

        const bounds = path.getVisualBounds();
        const samples = sampleCubic(
            { x: 0, y: 0 },
            { x: 100, y: 150 },
            { x: -100, y: 150 },
            { x: 0, y: 0 },
            400
        );
        const minX = Math.min(...samples.map((p) => p.x));
        const maxX = Math.max(...samples.map((p) => p.x));
        const minY = Math.min(...samples.map((p) => p.y));
        const maxY = Math.max(...samples.map((p) => p.y));
        const epsilon = 1e-3;
        expect(minX).toBeGreaterThanOrEqual(bounds.x - epsilon);
        expect(maxX).toBeLessThanOrEqual(bounds.x + bounds.width + epsilon);
        expect(minY).toBeGreaterThanOrEqual(bounds.y - epsilon);
        expect(maxY).toBeLessThanOrEqual(bounds.y + bounds.height + epsilon);
    });
});

describe('Arc render object', () => {
    it('computes bounds for quarter-circle arcs', () => {
        const arc = new Arc(0, 0, 10, { startAngle: 0, endAngle: Math.PI / 2 });
        arc.setStroke(null, 0);
        arc.setFill(null);
        const bounds = arc.getVisualBounds();
        expect(bounds.x).toBeCloseTo(0, 6);
        expect(bounds.y).toBeCloseTo(0, 6);
        expect(bounds.width).toBeCloseTo(10, 6);
        expect(bounds.height).toBeCloseTo(10, 6);
    });

    it('accounts for translation when computing bounds', () => {
        const arc = new Arc(0, 0, 5);
        arc.setStroke(null, 0);
        arc.setFill('#FF0000');
        arc.setAngles(Math.PI / 2, 0, true);
        arc.x = 20;
        arc.y = -10;
        const bounds = arc.getVisualBounds();
        expect(bounds.x).toBeCloseTo(20, 6);
        expect(bounds.y).toBeCloseTo(-10, 6);
        expect(bounds.width).toBeCloseTo(5, 6);
        expect(bounds.height).toBeCloseTo(5, 6);
    });

    it('returns full circle bounds when sweep covers entire circle', () => {
        const arc = new Arc(2, -3, 7, { startAngle: 0, endAngle: 8 * Math.PI });
        arc.setStroke(null, 0);
        arc.setFill('#00FF00');
        const bounds = arc.getVisualBounds();
        expect(bounds.x).toBeCloseTo(2 - 7, 6);
        expect(bounds.y).toBeCloseTo(-3 - 7, 6);
        expect(bounds.width).toBeCloseTo(14, 6);
        expect(bounds.height).toBeCloseTo(14, 6);
    });
});

describe('Text render object', () => {
    it('uses the full canvas ink box, including overhang, stroke, and shadow', () => {
        const previousContext = Text.__measureCtx;
        Text.__measureCtx = {
            font: '10px Arial',
            textBaseline: 'alphabetic',
            measureText: () => ({
                width: 100,
                actualBoundingBoxLeft: 8,
                actualBoundingBoxRight: 96,
                actualBoundingBoxAscent: 20,
                actualBoundingBoxDescent: 5,
            }),
        } as unknown as CanvasRenderingContext2D;

        try {
            const text = new Text(50, 40, 'Italic text', '30px Arial', {
                align: 'center',
                baseline: 'alphabetic',
                strokeColor: '#fff',
                strokeWidth: 4,
                shadow: { color: '#000', blur: 3, offsetX: -10, offsetY: 8 },
            });

            // Advance starts at -50. The glyph itself begins 8px before that;
            // stroke and shadow extend the source bounds still further left.
            expect(text.getVisualBounds()).toEqual({ x: -26, y: 18, width: 124, height: 43 });
        } finally {
            Text.__measureCtx = previousContext;
        }
    });
});

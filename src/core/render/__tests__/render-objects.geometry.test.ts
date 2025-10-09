import { describe, expect, it } from 'vitest';
import { BezierPath } from '../render-objects/bezier';
import { Arc } from '../render-objects/arc';

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
        path.setFillColor(null);
        path.moveTo(0, 0);
        path.quadraticCurveTo(5, 10, 10, 0);

        const bounds = path.getBounds();
        expect(bounds.x).toBeCloseTo(0, 6);
        expect(bounds.y).toBeCloseTo(0, 6);
        expect(bounds.width).toBeCloseTo(10, 6);
        expect(bounds.height).toBeCloseTo(5, 6);
    });

    it('includes cubic curve interior extrema in bounds', () => {
        const path = new BezierPath();
        path.setStroke(null, 0);
        path.setFillColor(null);
        path.moveTo(0, 0);
        path.bezierCurveTo(100, 150, -100, 150, 0, 0);

        const bounds = path.getBounds();
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
        const arc = new Arc(0, 0, 10, 0, Math.PI / 2);
        arc.setStroke(null, 0);
        arc.setFillColor(null);
        const bounds = arc.getBounds();
        expect(bounds.x).toBeCloseTo(0, 6);
        expect(bounds.y).toBeCloseTo(0, 6);
        expect(bounds.width).toBeCloseTo(10, 6);
        expect(bounds.height).toBeCloseTo(10, 6);
    });

    it('accounts for translation when computing bounds', () => {
        const arc = new Arc(0, 0, 5);
        arc.setStroke(null, 0);
        arc.setFillColor('#FF0000');
        arc.setAngles(Math.PI / 2, 0, true);
        arc.setPosition(20, -10);
        const bounds = arc.getBounds();
        expect(bounds.x).toBeCloseTo(20, 6);
        expect(bounds.y).toBeCloseTo(-10, 6);
        expect(bounds.width).toBeCloseTo(5, 6);
        expect(bounds.height).toBeCloseTo(5, 6);
    });

    it('returns full circle bounds when sweep covers entire circle', () => {
        const arc = new Arc(2, -3, 7, 0, 8 * Math.PI);
        arc.setStroke(null, 0);
        arc.setFillColor('#00FF00');
        const bounds = arc.getBounds();
        expect(bounds.x).toBeCloseTo(2 - 7, 6);
        expect(bounds.y).toBeCloseTo(-3 - 7, 6);
        expect(bounds.width).toBeCloseTo(14, 6);
        expect(bounds.height).toBeCloseTo(14, 6);
    });
});

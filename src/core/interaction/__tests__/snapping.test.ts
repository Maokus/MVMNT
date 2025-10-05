import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SNAP_TOLERANCE,
    snapPoint,
    snapTranslation,
    type SnapBounds,
    type SnapTarget,
} from '../snapping';

describe('snapTranslation', () => {
    const bounds: SnapBounds = { x: 92, y: 200, width: 20, height: 40 };

    it('snaps translation offsets to nearby targets within tolerance', () => {
        const targets: SnapTarget[] = [
            { orientation: 'vertical', position: 100, type: 'element-edge', elementId: 'el-a' },
            { orientation: 'horizontal', position: 210, type: 'element-edge', elementId: 'el-b' },
        ];
        const result = snapTranslation(bounds, 5, 9, targets, DEFAULT_SNAP_TOLERANCE);
        expect(result.dx).toBeCloseTo(8); // left edge snaps to 100
        expect(result.dy).toBeCloseTo(10); // top edge snaps to 210
        expect(result.guides).toHaveLength(2);
        expect(result.guides[0]).toMatchObject({ orientation: 'vertical', position: 100 });
        expect(result.guides[1]).toMatchObject({ orientation: 'horizontal', position: 210 });
    });

    it('skips snapping when outside tolerance', () => {
        const farTargets: SnapTarget[] = [
            { orientation: 'vertical', position: 160, type: 'canvas-edge' },
            { orientation: 'horizontal', position: 400, type: 'canvas-edge' },
        ];
        const result = snapTranslation(bounds, 2, 2, farTargets, DEFAULT_SNAP_TOLERANCE);
        expect(result.dx).toBeCloseTo(2);
        expect(result.dy).toBeCloseTo(2);
        expect(result.guides).toHaveLength(0);
    });
});

describe('snapPoint', () => {
    it('aligns point to closest snap target on both axes', () => {
        const targets: SnapTarget[] = [
            { orientation: 'vertical', position: 50, type: 'canvas-center' },
            { orientation: 'horizontal', position: 80, type: 'element-edge', elementId: 'element-1' },
        ];
        const result = snapPoint(47.8, 84.9, targets, DEFAULT_SNAP_TOLERANCE);
        expect(result.x).toBeCloseTo(50);
        expect(result.y).toBeCloseTo(80);
        expect(result.guides).toHaveLength(2);
        expect(result.guides[0]).toMatchObject({ orientation: 'vertical', position: 50 });
        expect(result.guides[1]).toMatchObject({ orientation: 'horizontal', position: 80, sourceElementId: 'element-1' });
    });

    it('returns original coordinates when no targets provided', () => {
        const result = snapPoint(10, 20, [], DEFAULT_SNAP_TOLERANCE);
        expect(result.x).toBe(10);
        expect(result.y).toBe(20);
        expect(result.guides).toHaveLength(0);
    });
});

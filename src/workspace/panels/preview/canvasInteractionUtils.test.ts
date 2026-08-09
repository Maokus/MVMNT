import { describe, expect, it } from 'vitest';
import { applyMatrixToPoint } from '@state/scene-graph';
import {
    accumulateRotationDrag,
    orientedScaleMatrix,
    resizeCursorForHandle,
    sideHandleScaleFactors,
} from './canvasInteractionUtils';

describe('accumulateRotationDrag', () => {
    it('keeps a group rotation connected while crossing the atan2 seam', () => {
        const angles = [(170 * Math.PI) / 180, (179 * Math.PI) / 180, (-179 * Math.PI) / 180, (-170 * Math.PI) / 180];
        let accumulated = 0;
        for (let index = 1; index < angles.length; index += 1) {
            accumulated = accumulateRotationDrag(angles[index - 1], angles[index], accumulated);
        }

        expect(accumulated).toBeCloseTo((20 * Math.PI) / 180, 10);
    });

    it('supports rotations beyond a full turn', () => {
        const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
        let accumulated = 0;
        for (let index = 1; index < angles.length; index += 1) {
            accumulated = accumulateRotationDrag(angles[index - 1], angles[index], accumulated);
        }

        expect(accumulated).toBeCloseTo(Math.PI * 3, 10);
    });
});

describe('preview resize handles', () => {
    it('changes only the local x scale when a rotated edge handle is dragged', () => {
        const diagonal = Math.SQRT1_2;
        const axisX = { x: diagonal, y: diagonal };
        const axisY = { x: -diagonal, y: diagonal };
        const factors = sideHandleScaleFactors(
            'scale-w',
            { x: 100, y: 100 },
            { x: 50, y: 50 },
            { x: 25, y: 25 },
            axisX,
            axisY
        );

        expect(factors).toEqual({ scaleX: 1.5, scaleY: 1 });
        const matrix = orientedScaleMatrix(factors.scaleX, factors.scaleY, axisX);
        const scaledX = applyMatrixToPoint(matrix, axisX);
        const unchangedY = applyMatrixToPoint(matrix, axisY);
        expect(scaledX.x).toBeCloseTo(axisX.x * 1.5);
        expect(scaledX.y).toBeCloseTo(axisX.y * 1.5);
        expect(unchangedY.x).toBeCloseTo(axisY.x);
        expect(unchangedY.y).toBeCloseTo(axisY.y);
    });

    it('selects edge resize cursors from the object rotation', () => {
        const handlesAt = (degrees: number) => {
            const radians = (degrees * Math.PI) / 180;
            const x = Math.cos(radians) * 50;
            const y = Math.sin(radians) * 50;
            return [
                { type: 'scale-w', cx: -x, cy: -y },
                { type: 'scale-e', cx: x, cy: y },
                { type: 'scale-nw', cx: -x - y * 0.2, cy: -y + x * 0.2 },
                { type: 'scale-ne', cx: x - y * 0.2, cy: y + x * 0.2 },
            ];
        };

        expect(resizeCursorForHandle('scale-w', handlesAt(0))).toBe('ew-resize');
        expect(resizeCursorForHandle('scale-w', handlesAt(45))).toBe('nwse-resize');
        expect(resizeCursorForHandle('scale-w', handlesAt(90))).toBe('ns-resize');
        expect(resizeCursorForHandle('scale-w', handlesAt(135))).toBe('nesw-resize');
        expect(resizeCursorForHandle('scale-nw', handlesAt(0))).toBe('nwse-resize');
        expect(resizeCursorForHandle('scale-nw', handlesAt(45))).toBe('ns-resize');
    });
});

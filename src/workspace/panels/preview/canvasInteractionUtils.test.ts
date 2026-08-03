import { describe, expect, it } from 'vitest';
import { accumulateRotationDrag } from './canvasInteractionUtils';

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

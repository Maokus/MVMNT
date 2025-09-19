import { describe, it, expect } from 'vitest';
import {
    addSceneElement,
    updateSceneElement,
    undo,
    redo,
    getDocumentSnapshot,
    beginHistoryGroup,
    endHistoryGroup,
} from '@state/document/actions';

// Phase P0 Baseline Test (skipped): captures current deficiency where drag-like multiple updates
// are not grouped properly or undo leaves document/runtime drift. This will be un-skipped in later phases.
// TODO(P0->P5): Unskip once projection + grouped drag refactor lands.
// Intent: create element, perform a sequence of incremental position updates simulating a drag, then undo once
// expecting element to return to original position. Current implementation likely records multiple entries or
// fails to restore precisely; we snapshot to assert future correctness.

describe.skip('UNDO BASELINE (P0) drag move grouping', () => {
    it('should restore original position after multi-update drag (baseline failing expectation)', () => {
        // Arrange
        const element = {
            id: 'el_drag_1',
            offsetX: 0,
            offsetY: 0,
            elementScaleX: 1,
            elementScaleY: 1,
            elementRotation: 0,
            anchorX: 0.5,
            anchorY: 0.5,
            visible: true,
            zIndex: 1,
        };
        addSceneElement(element);
        const before = getDocumentSnapshot();
        const steps = [
            { dx: 5, dy: 2 },
            { dx: 12, dy: 9 },
            { dx: 25, dy: 14 },
            { dx: 30, dy: 22 },
            { dx: 42, dy: 30 },
        ];
        // Act – simulate naive drag updates (no grouping yet)
        for (const s of steps) {
            updateSceneElement(element.id, (el: any) => {
                el.offsetX = s.dx;
                el.offsetY = s.dy;
            });
        }
        const mid = getDocumentSnapshot();
        // Perform undo (expected future state: original offsets 0,0 once grouping implemented)
        undo();
        const afterUndo = getDocumentSnapshot();
        // Redo for completeness
        redo();
        const afterRedo = getDocumentSnapshot();

        // Assert (EXPECTED in future): after one undo we should be back to baseline 0,0
        // Baseline currently: very likely NOT satisfied; this test is skipped.
        expect(afterUndo.scene.elements.find((e: any) => e.id === element.id)?.offsetX).toBe(0);
        expect(afterUndo.scene.elements.find((e: any) => e.id === element.id)?.offsetY).toBe(0);
        // And redo should restore final drag position (last step)
        expect(afterRedo.scene.elements.find((e: any) => e.id === element.id)?.offsetX).toBe(
            steps[steps.length - 1].dx
        );
        expect(afterRedo.scene.elements.find((e: any) => e.id === element.id)?.offsetY).toBe(
            steps[steps.length - 1].dy
        );

        // Keep variables referenced to avoid unused warnings (mid snapshot for future diffing)
        expect(before.scene.elements.length).toBeGreaterThan(0);
        expect(mid.scene.elements.length).toBeGreaterThan(0);
    });
});

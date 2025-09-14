import { describe, it, expect } from 'vitest';
import { exportScene, importScene, createSnapshotUndoController, SERIALIZATION_V1_ENABLED } from '../';

// These tests assert only Phase 0 placeholder semantics; they will be superseded / expanded in Phase 1.

describe('Persistence Phase 0 Skeleton', () => {
    it('exportScene returns disabled result when flag off', () => {
        if (!SERIALIZATION_V1_ENABLED()) {
            const result = exportScene();
            expect(result.ok).toBe(false);
            // @ts-expect-no-error accessing disabled field
            if (!result.ok) {
                expect(result.disabled).toBe(true);
            }
        } else {
            const result = exportScene();
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.envelope.format).toBe('mvmnt.scene');
            }
        }
    });

    it('importScene safe disabled behavior', () => {
        const json = '{"fake":true}';
        const res = importScene(json);
        if (!SERIALIZATION_V1_ENABLED()) {
            expect(res.ok).toBe(false);
            if (!res.ok) {
                expect(res.disabled).toBe(true);
            }
        } else {
            expect(res.ok).toBe(true);
        }
    });

    it('undo controller placeholder responds with no capability', () => {
        const undo = createSnapshotUndoController({});
        expect(undo.canUndo()).toBe(false);
        expect(() => undo.undo()).not.toThrow();
    });
});

import { describe, it, expect } from 'vitest';
import { exportScene, importScene, createSnapshotUndoController } from '../';

// These tests assert only Phase 0 placeholder semantics; they will be superseded / expanded in Phase 1.

describe('Persistence Phase 0 Skeleton', () => {
    it('exportScene returns success result', () => {
        const result = exportScene();
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.envelope.format).toBe('mvmnt.scene');
        }
    });

    it('importScene round trip succeeds for a generated export', () => {
        const exp = exportScene();
        expect(exp.ok).toBe(true);
        const res = importScene(exp.ok ? exp.json : '{}');
        expect(res.ok).toBe(true);
    });

    it('undo controller initializes and can reset', () => {
        const undo = createSnapshotUndoController({});
        expect(() => undo.reset()).not.toThrow();
    });
});

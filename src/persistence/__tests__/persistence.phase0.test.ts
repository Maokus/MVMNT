import { describe, it, expect } from 'vitest';
import { exportScene, importScene } from '../';

// These tests assert only Phase 0 placeholder semantics; they will be superseded / expanded in Phase 1.

describe('Persistence Phase 0 Skeleton', () => {
    it('exportScene returns success with envelope', () => {
        const result = exportScene();
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.envelope.format).toBe('mvmnt.scene');
        }
    });

    it('importScene parses a valid export and returns ok', () => {
        const exp = exportScene();
        expect(exp.ok).toBe(true);
        const json = exp.ok ? exp.json : '';
        const res = importScene(json);
        expect(res.ok).toBe(true);
    });

    // Legacy snapshot-based undo controller has been removed in Phase 6.
});

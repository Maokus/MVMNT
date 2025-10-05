import { describe, it, expect } from 'vitest';
import { exportScene, importScene, createPatchUndoController } from '../';
import type { ExportSceneResult, ExportSceneResultInline } from '../export';

function requireInline(result: ExportSceneResult): ExportSceneResultInline {
    if (!result.ok || result.mode !== 'inline-json') {
        throw new Error('Expected inline-json export result');
    }
    return result;
}

// These tests assert initial placeholder semantics; they will be superseded / expanded later.

describe('Persistence skeleton', () => {
    it('exportScene returns success result', async () => {
        const result = await exportScene();
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.envelope.format).toBe('mvmnt.scene');
        }
    });

    it('importScene round trip succeeds for a generated export', async () => {
        const exp = requireInline(await exportScene());
        expect(exp.ok).toBe(true);
        const res = await importScene(exp.json);
        expect(res.ok).toBe(true);
    });

    it('undo controller initializes and can reset', () => {
        const undo = createPatchUndoController({});
        expect(() => undo.reset()).not.toThrow();
    });
});

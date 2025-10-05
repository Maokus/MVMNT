import { describe, it, expect } from 'vitest';
import { exportScene, importScene, createPatchUndoController } from '../';
import type { ExportSceneResultInline } from '../export';

async function exportInlineScene(): Promise<ExportSceneResultInline> {
    const result = await exportScene(undefined, { storage: 'inline-json' });
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
            expect(result.mode).toBe('zip-package');
            expect(result.envelope.format).toBe('mvmnt.scene');
        }
    });

    it('importScene round trip succeeds for a packaged export', async () => {
        const exp = await exportScene();
        if (!exp.ok || exp.mode !== 'zip-package') {
            throw new Error('Expected packaged export result');
        }
        const res = await importScene(exp.zip);
        expect(res.ok).toBe(true);
    });

    it('importScene round trip succeeds for an inline JSON export', async () => {
        const exp = await exportInlineScene();
        const res = await importScene(exp.json);
        expect(res.ok).toBe(true);
    });

    it('undo controller initializes and can reset', () => {
        const undo = createPatchUndoController({});
        expect(() => undo.reset()).not.toThrow();
    });
});

import { describe, it, expect } from 'vitest';
import { exportScene, importScene, createPatchUndoController } from '../';

// These tests assert initial placeholder semantics; they will be superseded / expanded later.

describe('persistence core behavior', () => {
    it('exportScene returns success result', async () => {
        const result = await exportScene();
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.mode).toBe('zip-package');
            expect(result.envelope.format).toBe('mvmnt.scene');
        }
    });

    it('exportScene reports staged progress through packaging', async () => {
        const updates: Array<{ progress: number; label?: string }> = [];
        const result = await exportScene(undefined, {
            onProgress: (progress, label) => updates.push({ progress, label }),
        });

        expect(result.ok).toBe(true);
        expect(updates.length).toBeGreaterThan(1);
        expect(updates[0].progress).toBeGreaterThanOrEqual(0);
        expect(updates.at(-1)).toEqual({ progress: 1, label: 'Scene ready.' });
        expect(updates.some((update) => update.label === 'Packaging scene file…')).toBe(true);
    });

    it('importScene round trip succeeds for a packaged export', async () => {
        const exp = await exportScene();
        if (!exp.ok || exp.mode !== 'zip-package') {
            throw new Error('Expected packaged export result');
        }
        const res = await importScene(exp.zip);
        expect(res.ok).toBe(true);
    });

    it('rejects an inline JSON envelope', async () => {
        const exp = await exportScene();
        if (!exp.ok) throw new Error('Expected packaged export result');
        const res = await importScene(new TextEncoder().encode(JSON.stringify(exp.envelope)));
        expect(res).toMatchObject({ ok: false, errors: [{ code: 'ERR_PACKAGE_FORMAT' }] });
    });

    it('undo controller initializes and can reset', () => {
        const undo = createPatchUndoController({});
        expect(() => undo.reset()).not.toThrow();
    });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentSaveStatusStore } from '../documentSaveStatusStore';

describe('document save status store', () => {
    beforeEach(() => useDocumentSaveStatusStore.getState().clear());

    it('tracks bounded progress and a queued latest save', () => {
        const status = useDocumentSaveStatusStore.getState();
        status.setSaving(1.5, 'Packaging scene…');
        status.setQueued(true);

        expect(useDocumentSaveStatusStore.getState()).toMatchObject({
            phase: 'saving',
            progress: 1,
            message: 'Packaging scene…',
            queued: true,
        });
    });

    it('keeps warning and error details until explicitly cleared', () => {
        useDocumentSaveStatusStore.getState().setResult('error', 'Save failed', ['Disk is full']);
        expect(useDocumentSaveStatusStore.getState()).toMatchObject({
            phase: 'error',
            message: 'Save failed',
            details: ['Disk is full'],
        });
    });
});

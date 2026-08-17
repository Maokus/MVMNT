import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '../analytics';
import { runTrackedDocumentSave } from '../documentAnalytics';

vi.mock('../analytics', () => ({
    analytics: { capture: vi.fn(async () => undefined) },
}));

describe('document save analytics', () => {
    beforeEach(() => {
        vi.mocked(analytics.capture).mockClear();
    });

    it('waits for successful completion before reporting a save', async () => {
        let complete: ((saved: boolean) => void) | undefined;
        const pending = new Promise<boolean>((resolve) => {
            complete = resolve;
        });

        const result = runTrackedDocumentSave(() => pending, 'save_as');
        expect(analytics.capture).not.toHaveBeenCalled();

        complete?.(true);
        await expect(result).resolves.toBe(true);
        expect(analytics.capture).toHaveBeenCalledOnce();
        expect(analytics.capture).toHaveBeenCalledWith('document_saved', { save_mode: 'save_as' });
    });

    it('reports failure instead of success when persistence does not complete', async () => {
        await expect(runTrackedDocumentSave(async () => false, 'save')).resolves.toBe(false);

        expect(analytics.capture).toHaveBeenCalledOnce();
        expect(analytics.capture).toHaveBeenCalledWith('document_operation_failed', {
            operation: 'save',
            failure_category: 'save',
        });
    });
});

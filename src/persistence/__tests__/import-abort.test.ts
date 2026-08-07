import { describe, expect, it } from 'vitest';
import { throwIfImportAborted } from '../import-abort';

describe('import cancellation', () => {
    it('uses an AbortError for an already-aborted import signal', () => {
        const controller = new AbortController();
        controller.abort();
        expect(() => throwIfImportAborted(controller.signal)).toThrow(/Import aborted/);
    });
});

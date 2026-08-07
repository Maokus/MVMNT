import { describe, expect, it } from 'vitest';
import { BACKGROUND_EXPORT_KEY, readBackgroundExportBootstrap } from './backgroundExportBootstrap';

describe('background export bootstrap', () => {
    it('accepts valid persisted jobs and rejects malformed values', () => {
        sessionStorage.setItem(
            BACKGROUND_EXPORT_KEY,
            JSON.stringify({ jobId: 'job', kind: 'png', sceneName: 'Scene', settings: {} })
        );
        expect(readBackgroundExportBootstrap()).toMatchObject({ jobId: 'job', kind: 'png', sceneName: 'Scene' });
        sessionStorage.setItem(BACKGROUND_EXPORT_KEY, JSON.stringify({ kind: 'png' }));
        expect(readBackgroundExportBootstrap()).toBeNull();
    });
});

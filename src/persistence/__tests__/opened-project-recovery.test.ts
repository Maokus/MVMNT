import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveOpenedProjectRecovery } from '../opened-project-recovery';
import { LocalFileStore } from '../local-file-store';
import { LocalSaveService } from '../local-save-service';

afterEach(() => vi.restoreAllMocks());

describe('opened project recovery', () => {
    it('stores incoming bytes without re-exporting unchanged projects', async () => {
        const save = vi.spyOn(LocalFileStore, 'save').mockResolvedValue();
        const rebuild = vi.spyOn(LocalSaveService, 'saveCurrentFile');
        const bytes = new Uint8Array([1, 2, 3]);
        await saveOpenedProjectRecovery(bytes, { documentChanged: false }, 'Project', 'Project');
        expect(save).toHaveBeenCalledWith(bytes);
        expect(rebuild).not.toHaveBeenCalled();
    });
    it.each([
        { documentChanged: true, originalName: 'Project' },
        { documentChanged: false, originalName: 'Old title' },
    ])('rebuilds changed or renamed documents: %j', async ({ documentChanged, originalName }) => {
        const rebuild = vi.spyOn(LocalSaveService, 'saveCurrentFile').mockResolvedValue({ ok: true });
        const save = vi.spyOn(LocalFileStore, 'save');
        await saveOpenedProjectRecovery(new Uint8Array([1]), { documentChanged }, 'Project', originalName);
        expect(rebuild).toHaveBeenCalledWith('Project');
        expect(save).not.toHaveBeenCalled();
    });
});

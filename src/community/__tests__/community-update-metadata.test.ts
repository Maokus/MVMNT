import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { updateItem, uploadItem } from '../communityApi';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    storageFrom: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: mocks.from,
        storage: { from: mocks.storageFrom },
    },
}));

function archiveFile(name: string, entry: string, contents: unknown): File {
    const bytes = zipSync({ [entry]: strToU8(JSON.stringify(contents)) });
    return {
        name,
        size: bytes.byteLength,
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    } as File;
}

function mockItemUpdate(type: 'plugin' | 'template') {
    const readQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
            data: {
                type,
                thumbnail_path: 'user/item/thumb.png',
                file_path: 'user/item/old-file',
                plugin_uid: 'plugin.id',
            },
            error: null,
        }),
    };
    const updateFilter = { eq: vi.fn() };
    updateFilter.eq.mockReturnValueOnce(updateFilter).mockResolvedValueOnce({ error: null });
    const updateQuery = { update: vi.fn().mockReturnValue(updateFilter) };
    mocks.from.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);
    mocks.storageFrom.mockReturnValue({ remove: mocks.remove, upload: mocks.upload });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ error: null });
    return updateQuery.update;
}

describe('community item replacement metadata', () => {
    beforeEach(() => vi.resetAllMocks());

    it('takes new plugin listing metadata from the archive', async () => {
        const conflictQuery = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        };
        const insert = vi.fn().mockResolvedValue({ error: null });
        mocks.from.mockReturnValueOnce(conflictQuery).mockReturnValueOnce({ insert });
        mocks.storageFrom.mockReturnValue({ upload: mocks.upload });
        mocks.upload.mockResolvedValue({ error: null });
        const thumbnailFile = { name: 'thumbnail.png' } as File;
        const mainFile = archiveFile('plugin.mvmnt-plugin', 'manifest.json', {
            id: 'plugin.id',
            version: '1.0.7',
            apiVersion: '^2.2.0',
        });

        await uploadItem('user', 'plugin', 'Plugin', '', thumbnailFile, mainFile, 'stale.id', '1.0.6');

        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                plugin_uid: 'plugin.id',
                version: '1.0.7',
                plugin_api_version: '^2.2.0',
            })
        );
    });

    it('refreshes plugin compatibility and version from the replacement archive', async () => {
        const update = mockItemUpdate('plugin');
        const mainFile = archiveFile('plugin.mvmnt-plugin', 'manifest.json', {
            id: 'plugin.id',
            version: '1.0.7',
            apiVersion: '^2.2.0',
        });

        await updateItem('item', 'user', {
            mainFile,
            pluginUid: 'plugin.id',
            version: '1.0.6',
        });

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                plugin_uid: 'plugin.id',
                version: '1.0.7',
                plugin_api_version: '^2.2.0',
                file_size_bytes: mainFile.size,
            })
        );
    });

    it('rejects a plugin replacement without API metadata before changing storage', async () => {
        const update = mockItemUpdate('plugin');
        const mainFile = archiveFile('plugin.mvmnt-plugin', 'manifest.json', {
            id: 'plugin.id',
            version: '1.0.7',
        });

        await expect(updateItem('item', 'user', { mainFile })).rejects.toThrow(
            'missing a valid manifest and API version'
        );
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('refreshes template compatibility fields when the scene package changes', async () => {
        const update = mockItemUpdate('template');
        const mainFile = archiveFile('template.mvt', 'envelope.json', {
            schemaVersion: 10,
            assets: { minAppVersion: '0.16.0' },
        });

        await updateItem('item', 'user', { mainFile });

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                template_schema_version: 10,
                min_app_version: '0.16.0',
            })
        );
    });
});

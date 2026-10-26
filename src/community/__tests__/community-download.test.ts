import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadItem, type CommunityItem } from '../communityApi';

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), storageFrom: vi.fn(), getPublicUrl: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
    supabase: { from: mocks.from, storage: { from: mocks.storageFrom } },
}));

const item = { id: 'item-id', file_path: 'author/item/plugin.mvmnt-plugin' } as CommunityItem;

describe('community downloads', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.from.mockReturnValue({ insert: mocks.insert });
        mocks.insert.mockResolvedValue({ error: null });
        mocks.storageFrom.mockReturnValue({ getPublicUrl: mocks.getPublicUrl });
        mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/plugin' } });
    });

    it.each([null, 'downloader-id'])('records a download for user %s before returning the file URL', async (userId) => {
        await expect(downloadItem(item, userId)).resolves.toBe('https://cdn.example.com/plugin');
        expect(mocks.from).toHaveBeenCalledWith('community_downloads');
        expect(mocks.insert).toHaveBeenCalledWith({ item_id: item.id, user_id: userId });
        expect(mocks.storageFrom).toHaveBeenCalledWith('community-files');
        expect(mocks.getPublicUrl).toHaveBeenCalledWith(item.file_path);
    });

    it('propagates database errors rather than silently skipping the count', async () => {
        const error = { message: 'Download insert denied', code: '42501' };
        mocks.insert.mockResolvedValue({ error });
        await expect(downloadItem(item, null)).rejects.toBe(error);
        expect(mocks.getPublicUrl).not.toHaveBeenCalled();
    });
});

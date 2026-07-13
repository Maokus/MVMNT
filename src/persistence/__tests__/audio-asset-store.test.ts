import { describe, expect, it } from 'vitest';
import { AudioAssetStore } from '@persistence/audio-asset-store';

describe('AudioAssetStore', () => {
    it('stores bytes and returns a readable copy', async () => {
        const payload = new Uint8Array([1, 2, 3, 4]);
        const storage = await AudioAssetStore.put('test-audio-asset', payload);
        const stored = await AudioAssetStore.get('test-audio-asset');

        expect(['indexeddb', 'memory']).toContain(storage);
        expect(stored).toBeInstanceOf(ArrayBuffer);
        expect(Array.from(new Uint8Array(stored!))).toEqual([1, 2, 3, 4]);
    });

    it('removes original assets that are no longer referenced by the active scene', async () => {
        const prefix = `audio-cleanup-${Date.now()}-${Math.random()}`;
        const keepId = `${prefix}-keep`;
        const staleId = `${prefix}-stale`;
        await AudioAssetStore.put(keepId, new Uint8Array([1]));
        await AudioAssetStore.put(staleId, new Uint8Array([2]));

        const removed = await AudioAssetStore.removeUnreferenced([keepId]);

        expect(removed).toBeGreaterThanOrEqual(1);
        expect(await AudioAssetStore.get(keepId)).toBeInstanceOf(ArrayBuffer);
        expect(await AudioAssetStore.get(staleId)).toBeUndefined();
    });
});

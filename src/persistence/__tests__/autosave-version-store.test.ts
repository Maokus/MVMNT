import { beforeEach, describe, expect, it } from 'vitest';
import { AutosaveVersionStore } from '../autosave-version-store';

describe('AutosaveVersionStore', () => {
    beforeEach(async () => {
        await AutosaveVersionStore.clear();
    });

    it('stores restorable project versions with visible metadata', async () => {
        const saved = await AutosaveVersionStore.save('Demo.mvt', new Uint8Array([1, 2, 3]));
        expect(saved.documentName).toBe('Demo');
        expect(saved.size).toBe(3);
        expect(await AutosaveVersionStore.load(saved.id)).toEqual(new Uint8Array([1, 2, 3]));
        expect(await AutosaveVersionStore.totalSize()).toBe(3);
    });

    it('suppresses identical consecutive recovery packages', async () => {
        const first = await AutosaveVersionStore.save('Demo', new Uint8Array([4, 5]));
        const second = await AutosaveVersionStore.save('Demo', new Uint8Array([4, 5]));
        expect(second.id).toBe(first.id);
        expect(await AutosaveVersionStore.list()).toHaveLength(1);
    });

    it('uses the supplied package digest without rereading a previous package', async () => {
        const first = await AutosaveVersionStore.save('Demo', new Uint8Array([4, 5]), 'stable-digest');
        const second = await AutosaveVersionStore.save('Demo', new Uint8Array([9, 9]), 'stable-digest');

        expect(second.id).toBe(first.id);
        expect(await AutosaveVersionStore.load(first.id)).toEqual(new Uint8Array([4, 5]));
    });
});

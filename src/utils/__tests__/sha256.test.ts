import { createHash, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { sha256Hex } from '../hash/sha256';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('hashes the exact contiguous view without allocating merged asset copies', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const digest = vi.spyOn(webcrypto.subtle, 'digest');
    const source = new Uint8Array([99, 1, 2, 3, 99]);
    const view = source.subarray(1, 4);
    expect(await sha256Hex(view)).toBe(createHash('sha256').update(view).digest('hex'));
    expect(digest).toHaveBeenCalledWith('SHA-256', view);
});

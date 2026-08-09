import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireGoogleFontFamily, type GoogleFontFamily } from '../google-fonts-client';

const family: GoogleFontFamily = {
    family: 'Test Sans',
    variants: ['regular', '700italic'],
    version: 'v1',
    lastModified: '2026-01-01',
    files: {
        regular: 'https://fonts.gstatic.com/s/test/regular.woff2',
        '700italic': 'https://fonts.gstatic.com/s/test/700italic.woff2',
    },
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Google font family acquisition', () => {
    it('downloads every face transactionally without injecting a stylesheet', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            const payload = new TextEncoder().encode(url.includes('700italic') ? 'italic-face' : 'regular-face');
            return new Response(payload, { status: 200, headers: { 'content-type': 'font/woff2' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        const progress = vi.fn();

        const result = await acquireGoogleFontFamily(family, { onProgress: progress });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.asset).toMatchObject({ family: 'Test Sans', source: 'google', fileSize: 23 });
        expect(result.asset.variants).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ weight: 400, style: 'normal', sourceFormat: 'woff2' }),
                expect.objectContaining({ weight: 700, style: 'italic', sourceFormat: 'woff2' }),
            ])
        );
        expect(result.payloads.size).toBe(2);
        expect(progress).toHaveBeenLastCalledWith(
            expect.objectContaining({ family: 'Test Sans', completed: 2, total: 2 })
        );
        expect(document.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
    });

    it('does not return a partial asset when any face fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) =>
                url.includes('700italic')
                    ? new Response('', { status: 503 })
                    : new Response(new Uint8Array([1, 2, 3]), { status: 200 })
            )
        );

        await expect(acquireGoogleFontFamily(family)).rejects.toThrow('Failed to download Test Sans 700italic');
    });
});

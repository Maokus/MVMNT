import { describe, expect, it, vi } from 'vitest';

const { acquireGoogleFontFamily, fetchGoogleFontCatalog } = vi.hoisted(() => ({
    acquireGoogleFontFamily: vi.fn(),
    fetchGoogleFontCatalog: vi.fn(),
}));

vi.mock('@fonts/google-fonts-client', () => ({
    hasGoogleFontsApiKey: () => true,
    fetchGoogleFontCatalog,
    acquireGoogleFontFamily,
}));

import { resolveLegacyGoogleFonts } from '../import/fontMigration';

describe('legacy Google font acquisition', () => {
    it('embeds the complete family and rewrites references before the scene is applied', async () => {
        const family = { family: 'Inter', variants: ['regular'], files: { regular: 'unused' } };
        fetchGoogleFontCatalog.mockResolvedValue({ items: [family], fetchedAt: 1 });
        acquireGoogleFontFamily.mockResolvedValue({
            asset: {
                id: 'inter-project',
                family: 'Inter',
                source: 'google',
                fileSize: 3,
                originalFileName: 'Inter (Google Fonts)',
                createdAt: 1,
                updatedAt: 1,
                licensingAcknowledged: true,
                variants: [
                    {
                        id: 'regular',
                        weight: 400,
                        style: 'normal',
                        sourceFormat: 'woff2',
                        binaryId: 'hash',
                    },
                ],
            },
            payloads: new Map([['hash', new Uint8Array([1, 2, 3]).buffer]]),
        });
        const payloads = new Map<string, Uint8Array>();

        const result = await resolveLegacyGoogleFonts(
            {
                schemaVersion: 9,
                scene: {
                    elements: {
                        text: {
                            properties: { fontFamily: { type: 'constant', value: 'MissingGoogle:Inter|400' } },
                        },
                    },
                },
            },
            payloads
        );

        expect(result.upgraded).toBe(true);
        expect(result.envelope.scene.elements.text.properties.fontFamily.value).toBe('Project:inter-project|400');
        expect(result.envelope.scene.fontAssets['inter-project'].source).toBe('google');
        expect(payloads.get('inter-project/regular')).toEqual(new Uint8Array([1, 2, 3]));
    });
});

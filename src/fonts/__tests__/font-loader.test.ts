import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontAsset } from '@state/scene/fonts';
import type { FontBinaryStoreType } from '@persistence/font-binary-store';

class MockFontFace {
    public readonly family: string;
    public readonly source: ArrayBuffer;
    public readonly descriptors: FontFaceDescriptors;
    constructor(family: string, source: ArrayBuffer, descriptors: FontFaceDescriptors) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
    }
    async load() {
        return this;
    }
}

describe('font-loader custom fonts', () => {
    let FontBinaryStore: FontBinaryStoreType;

    beforeEach(async () => {
        vi.resetModules();
        ({ FontBinaryStore } = await import('@persistence/font-binary-store'));
        Object.defineProperty(globalThis, 'FontFace', {
            value: MockFontFace,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(document, 'fonts', {
            value: {
                add: vi.fn(),
            },
            configurable: true,
        });
        await FontBinaryStore.clear();
    });

    function buildAsset(): FontAsset {
        const now = Date.now();
        return {
            id: 'asset-1',
            family: 'Mock Family',
            originalFileName: 'Mock.ttf',
            fileSize: 128,
            createdAt: now,
            updatedAt: now,
            licensingAcknowledged: true,
            variants: [
                { id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' },
            ],
        };
    }

    it('registers custom variants and marks them as loaded', async () => {
        const { registerCustomFontVariant, isFontLoaded, parseFontSelection } = await import('../font-loader');
        const asset = buildAsset();
        const token = `Custom:${asset.id}|${asset.variants[0].weight}`;
        const buffer = new TextEncoder().encode('binary-font').buffer;

        await registerCustomFontVariant({ asset, variant: asset.variants[0], data: buffer });
        expect(parseFontSelection(token).family).toBe(asset.family);
        expect(isFontLoaded(token)).toBe(true);
    });

    it('ensures variants load from the binary store', async () => {
        const module = await import('../font-loader');
        const asset = buildAsset();
        const token = `Custom:${asset.id}|${asset.variants[0].weight}`;
        const payload = new TextEncoder().encode('binary-font');
        await FontBinaryStore.put(asset.id, payload.buffer.slice(0));

        await module.ensureFontVariantsRegistered(asset, asset.variants);
        expect(module.isFontLoaded(token)).toBe(true);
    });
});

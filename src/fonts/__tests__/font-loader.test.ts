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

describe('font-loader', () => {
    let FontBinaryStore: FontBinaryStoreType;

    beforeEach(async () => {
        vi.resetModules();
        document.querySelectorAll('link[id^="gf-"]').forEach((link) => link.remove());
        ({ FontBinaryStore } = await import('@persistence/font-binary-store'));
        Object.defineProperty(globalThis, 'FontFace', {
            value: MockFontFace,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(document, 'fonts', {
            value: {
                add: vi.fn(),
                load: vi.fn().mockResolvedValue([]),
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
            variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' }],
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

    it('loads built-in and device fonts without adding a remote stylesheet', async () => {
        const { ensureFontLoaded } = await import('../font-loader');

        await expect(ensureFontLoaded('BuiltIn:inter|700')).resolves.toBeUndefined();
        await expect(ensureFontLoaded('Device:Arial|400')).resolves.toBeUndefined();
        expect(document.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
    });

    it('loads serialized font selections before an export begins', async () => {
        const { ensureSceneFontsLoaded } = await import('../font-loader');
        const pending = ensureSceneFontsLoaded(
            {
                text: { properties: { fontFamily: { type: 'constant', value: 'BuiltIn:inter|700' } } },
                labels: { properties: { noteLabelFontFamily: { type: 'macro', macroId: 'label-font' } } },
                animated: { properties: { titleFont: { type: 'keyframes', channelId: 'font-channel' } } },
            },
            { macros: { 'label-font': { value: 'Device:Arial|400' } } },
            {
                automation: {
                    channels: {
                        'font-channel': { keyframes: [{ tick: 0, value: 'BuiltIn:inter|600' }] },
                    },
                },
            }
        );

        await expect(pending).resolves.toBeUndefined();
        expect(document.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
    });
});

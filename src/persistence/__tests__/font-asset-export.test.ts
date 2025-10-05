import { beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from '@state/sceneStore';
import type { FontAsset } from '@state/scene/fonts';
import { FontBinaryStore } from '../font-binary-store';
import { collectFontAssets } from '../font-asset-export';

const baseAsset: FontAsset = {
    id: 'font-asset-1',
    family: 'Test Family',
    originalFileName: 'TestFamily.ttf',
    fileSize: 1024,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    licensingAcknowledged: true,
    variants: [
        {
            id: 'regular',
            weight: 400,
            style: 'normal',
            sourceFormat: 'ttf',
        },
    ],
};

describe('collectFontAssets', () => {
    beforeEach(async () => {
        useSceneStore.setState({
            fonts: { assets: {}, order: [], totalBytes: 0, licensingAcknowledgedAt: undefined },
        });
        await FontBinaryStore.clear();
    });

    it('reports missing binaries', async () => {
        useSceneStore.getState().registerFontAsset(baseAsset);
        const result = await collectFontAssets();
        expect(result.missing).toContain(baseAsset.id);
        expect(Object.keys(result.byId)).toHaveLength(0);
    });

    it('collects available font binaries', async () => {
        const payload = new TextEncoder().encode('font-binary');
        await FontBinaryStore.put(baseAsset.id, payload.buffer.slice(0));
        useSceneStore.getState().registerFontAsset(baseAsset);
        const result = await collectFontAssets();
        expect(result.missing).toEqual([]);
        expect(result.byId[baseAsset.id]).toBeDefined();
        expect(result.byId[baseAsset.id].byteLength).toBe(payload.byteLength);
        expect(result.assetPayloads.get(baseAsset.id)?.bytes.byteLength).toBe(payload.byteLength);
    });
});

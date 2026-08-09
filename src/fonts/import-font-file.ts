import { parseFontMetadata } from './font-metadata';
import { registerCustomFontVariant } from './font-loader';
import { FontBinaryStore } from '@persistence/font-binary-store';
import { sha256Hex } from '@utils/hash/sha256';
import { useSceneStore } from '@state/sceneStore';
import type { FontAsset, FontSourceFormat, FontVariant } from '@state/scene/fonts';
import { dispatchSceneCommand } from '@state/scene';

function sourceFormat(name: string): FontSourceFormat | null {
    const extension = name.split('.').pop()?.toLowerCase();
    return extension === 'ttf' || extension === 'otf' || extension === 'woff' || extension === 'woff2'
        ? extension
        : null;
}

/** Import a font into the current project. Storage failures are reported by the caller. */
export async function importFontFile(file: File): Promise<FontAsset> {
    const format = sourceFormat(file.name);
    if (!format) throw new Error('Unsupported font format. Use TTF, OTF, WOFF, or WOFF2.');
    const state = useSceneStore.getState();
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(new Uint8Array(buffer));
    const duplicate = state.fonts.order.map((id) => state.fonts.assets[id]).find((asset) => asset?.hash === hash);
    if (duplicate) return duplicate;
    const metadata = await parseFontMetadata(buffer);
    const assetId = crypto.randomUUID();
    const variant: FontVariant = {
        id: `${assetId}-variant`,
        weight: metadata.weight,
        style: metadata.style,
        sourceFormat: format,
        postscriptName: metadata.postscriptName,
        variationSettings: metadata.variationAxes,
        binaryId: hash,
        byteLength: file.size,
        hash,
        originalFileName: file.name,
    };
    const asset: FontAsset = {
        id: assetId,
        family: metadata.family,
        variants: [variant],
        originalFileName: file.name,
        fileSize: file.size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        licensingAcknowledged: true,
        hash,
        source: 'upload',
    };
    await FontBinaryStore.put(hash, buffer);
    try {
        await registerCustomFontVariant({ asset, variant, data: buffer });
    } catch (error) {
        await FontBinaryStore.delete(hash);
        throw error;
    }
    state.acknowledgeFontLicensing(Date.now());
    dispatchSceneCommand({ type: 'registerFontAsset', asset });
    return asset;
}

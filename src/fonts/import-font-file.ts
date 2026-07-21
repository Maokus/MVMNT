import { parseFontMetadata } from './font-metadata';
import { registerCustomFontVariant } from './font-loader';
import { FontBinaryStore } from '@persistence/font-binary-store';
import { sha256Hex } from '@utils/hash/sha256';
import { useSceneStore } from '@state/sceneStore';
import type { FontAsset, FontSourceFormat, FontVariant } from '@state/scene/fonts';

const MAX_FONT_BYTES = 10 * 1024 * 1024;
const TOTAL_FONT_LIMIT_BYTES = 40 * 1024 * 1024;

function sourceFormat(name: string): FontSourceFormat | null {
    const extension = name.split('.').pop()?.toLowerCase();
    return extension === 'ttf' || extension === 'otf' || extension === 'woff' || extension === 'woff2' ? extension : null;
}

/** Import a font through the same validation and scene budget used by the font manager. */
export async function importFontFile(file: File): Promise<FontAsset> {
    const format = sourceFormat(file.name);
    if (!format) throw new Error('Unsupported font format. Use TTF, OTF, WOFF, or WOFF2.');
    if (file.size > MAX_FONT_BYTES) throw new Error('Font exceeds the 10 MB upload limit.');
    const state = useSceneStore.getState();
    if (state.fonts.totalBytes + file.size > TOTAL_FONT_LIMIT_BYTES) throw new Error('Adding this font would exceed the 40 MB scene font budget.');
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
    };
    await FontBinaryStore.put(assetId, buffer);
    state.acknowledgeFontLicensing(Date.now());
    state.registerFontAsset(asset);
    await registerCustomFontVariant({ asset, variant, data: buffer });
    return asset;
}

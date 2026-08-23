import { useSceneStore } from '@state/sceneStore';
import type { FontAsset } from '@state/scene/fonts';
import { FontBinaryStore } from './font-binary-store';
import { sha256Hex } from '@utils/hash/sha256';

export interface FontAssetRecord {
    id: string;
    family: string;
    originalFileName: string;
    byteLength: number;
    variants: Array<{
        id: string;
        byteLength: number;
        sourceFormat: FontAsset['variants'][number]['sourceFormat'];
        hash: string;
        filename: string;
    }>;
}

export interface CollectedFontAssets {
    byId: Record<string, FontAssetRecord>;
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
    missing: string[];
    totalBytes: number;
}

const MIME_BY_FORMAT: Record<string, string> = {
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
};

function resolveMimeType(variant: FontAsset['variants'][number]): string {
    return MIME_BY_FORMAT[variant.sourceFormat] ?? 'application/octet-stream';
}

function inferFilename(asset: FontAsset, variant: FontAsset['variants'][number]): string {
    const fallback = `${asset.family || 'font'}-${variant.weight}-${variant.style}.${variant.sourceFormat ?? 'bin'}`;
    const requested = variant.originalFileName || (asset.variants.length === 1 ? asset.originalFileName : '');
    if (!requested) return fallback;
    const sanitized = requested.replace(/[\\/:*?"<>|]+/g, '_');
    return sanitized || fallback;
}

export async function collectFontAssets(
    state: ReturnType<typeof useSceneStore.getState> = useSceneStore.getState()
): Promise<CollectedFontAssets> {
    const assets = state.fonts?.assets ?? {};
    const byId: Record<string, FontAssetRecord> = {};
    const payloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const missing: string[] = [];
    let totalBytes = 0;

    for (const asset of Object.values(assets)) {
        if (!asset) continue;
        const variantRecords: FontAssetRecord['variants'] = [];
        let assetBytes = 0;
        for (const variant of asset.variants ?? []) {
            const binaryId = variant.binaryId || variant.hash || asset.id;
            const buffer = await FontBinaryStore.get(binaryId);
            if (!buffer) {
                missing.push(`${asset.id}/${variant.id}`);
                continue;
            }
            const bytes = new Uint8Array(buffer);
            const hash = await sha256Hex(bytes);
            const mimeType = resolveMimeType(variant);
            const filename = inferFilename(asset, variant);
            variantRecords.push({
                id: variant.id,
                byteLength: bytes.byteLength,
                sourceFormat: variant.sourceFormat,
                hash,
                filename,
            });
            payloads.set(`${asset.id}/${variant.id}`, { bytes, filename, mimeType });
            assetBytes += bytes.byteLength;
        }
        if (!variantRecords.length) continue;
        byId[asset.id] = {
            id: asset.id,
            family: asset.family,
            originalFileName: asset.originalFileName,
            byteLength: assetBytes,
            variants: variantRecords,
        };
        totalBytes += assetBytes;
    }

    return { byId, assetPayloads: payloads, missing, totalBytes };
}

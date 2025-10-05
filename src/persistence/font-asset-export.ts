import { useSceneStore } from '@state/sceneStore';
import type { FontAsset } from '@state/scene/fonts';
import { FontBinaryStore } from './font-binary-store';
import { sha256Hex } from '@utils/hash/sha256';

export interface FontAssetRecord {
    id: string;
    family: string;
    originalFileName: string;
    byteLength: number;
    sourceFormat: FontAsset['variants'][number]['sourceFormat'];
    hash: string;
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

function resolveMimeType(asset: FontAsset): string {
    const variant = asset.variants[0];
    if (!variant) return 'application/octet-stream';
    return MIME_BY_FORMAT[variant.sourceFormat] ?? 'application/octet-stream';
}

function inferFilename(asset: FontAsset): string {
    const fallback = `${asset.family || 'font'}-${asset.id}.${asset.variants[0]?.sourceFormat ?? 'bin'}`;
    if (!asset.originalFileName) return fallback;
    const sanitized = asset.originalFileName.replace(/[\\/:*?"<>|]+/g, '_');
    return sanitized || fallback;
}

export async function collectFontAssets(): Promise<CollectedFontAssets> {
    const state = useSceneStore.getState();
    const assets = state.fonts?.assets ?? {};
    const byId: Record<string, FontAssetRecord> = {};
    const payloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const missing: string[] = [];
    let totalBytes = 0;

    for (const asset of Object.values(assets)) {
        if (!asset) continue;
        const buffer = await FontBinaryStore.get(asset.id);
        if (!buffer) {
            missing.push(asset.id);
            continue;
        }
        const bytes = new Uint8Array(buffer);
        const hash = await sha256Hex(bytes);
        const mimeType = resolveMimeType(asset);
        const filename = inferFilename(asset);
        byId[asset.id] = {
            id: asset.id,
            family: asset.family,
            originalFileName: asset.originalFileName,
            byteLength: bytes.byteLength,
            sourceFormat: asset.variants[0]?.sourceFormat ?? 'ttf',
            hash,
        };
        payloads.set(asset.id, { bytes, filename, mimeType });
        totalBytes += bytes.byteLength;
    }

    return { byId, assetPayloads: payloads, missing, totalBytes };
}

/**
 * Visual asset export utilities.
 *
 * Scans all element property bindings for File values, extracts the raw bytes,
 * and produces a portable ZIP payload (assets/visual/<id>/<filename>).
 *
 * The scan is intentionally broad — any constant binding whose value is a File
 * object is treated as a visual asset, regardless of property name. This covers
 * imageSource in ImageElement, popcat's mouth/idle image props, and any future
 * file-picking element without requiring per-element knowledge here.
 *
 * On import, the reverse mapping (ID → File reconstructed from ZIP bytes) is
 * applied by restoreVisualAssets() before DocumentGateway.apply() is called.
 */

import { useSceneStore } from '@state/sceneStore';
import { sha256Hex } from '@utils/hash/sha256';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';

export interface VisualAssetRecord {
    id: string;
    originalFileName: string;
    mimeType: string;
    byteLength: number;
    hash: string;
}

export interface CollectedVisualAssets {
    /** Stable ID for each collected asset. */
    byId: Record<string, VisualAssetRecord>;
    /** ZIP payloads keyed by asset ID. */
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
    /**
     * Map from the session-scoped file identity key
     * (`"${name}:${size}:${lastModified}"`) to the stable asset ID.
     * Used by the export layer to replace File values in the element property
     * map with their stable IDs before serialising the envelope.
     */
    fileKeyToId: Map<string, string>;
    missing: string[];
    totalBytes: number;
}

function fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function inferMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        gif: 'image/gif',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        avif: 'image/avif',
    };
    return map[ext] ?? 'application/octet-stream';
}

/**
 * Scan all scene element bindings for File values and collect them as
 * serialisable visual asset payloads.
 *
 * Also collects assets from the visual asset registry (for assetRef-type elements).
 *
 * Safe to call when there are no image elements — returns empty collections.
 */
export async function collectVisualAssets(): Promise<CollectedVisualAssets> {
    const state = useSceneStore.getState();
    const byId: Record<string, VisualAssetRecord> = {};
    const payloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const fileKeyToId = new Map<string, string>();
    const missing: string[] = [];
    let totalBytes = 0;

    // Include assets from the visual asset registry (stable IDs preserved)
    const registry = useVisualAssetRegistryStore.getState();
    for (const assetId of registry.assetsOrder) {
        const entry = registry.assets[assetId];
        if (!entry) continue;
        if (entry.origin === 'plugin') continue; // provided by plugin, not user data
        const file = entry.file;
        if (typeof file !== 'object') continue; // should not occur for user assets
        const key = fileKey(file);
        if (fileKeyToId.has(key)) continue;
        fileKeyToId.set(key, assetId);
        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const hash = await sha256Hex(bytes);
            const mimeType = file.type || inferMimeType(file.name);
            const record: VisualAssetRecord = {
                id: assetId,
                originalFileName: file.name,
                mimeType,
                byteLength: bytes.byteLength,
                hash,
            };
            byId[assetId] = record;
            payloads.set(assetId, { bytes, filename: file.name, mimeType });
            totalBytes += bytes.byteLength;
        } catch {
            missing.push(assetId);
            fileKeyToId.delete(key);
        }
    }

    // Also scan element bindings for any remaining File values (for prop.file()-type elements)
    for (const elementBindings of Object.values(state.bindings.byElement)) {
        for (const binding of Object.values(elementBindings)) {
            if (binding?.type !== 'constant') continue;
            const value = (binding as { type: 'constant'; value: unknown }).value;
            if (!(value instanceof File)) continue;

            const key = fileKey(value);
            if (fileKeyToId.has(key)) continue; // already processed this file

            const id = crypto.randomUUID();
            fileKeyToId.set(key, id);

            try {
                const buffer = await value.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const hash = await sha256Hex(bytes);
                const mimeType = value.type || inferMimeType(value.name);
                const record: VisualAssetRecord = {
                    id,
                    originalFileName: value.name,
                    mimeType,
                    byteLength: bytes.byteLength,
                    hash,
                };
                byId[id] = record;
                payloads.set(id, { bytes, filename: value.name, mimeType });
                totalBytes += bytes.byteLength;
            } catch {
                missing.push(id);
                fileKeyToId.delete(key);
            }
        }
    }

    return { byId, assetPayloads: payloads, fileKeyToId, missing, totalBytes };
}

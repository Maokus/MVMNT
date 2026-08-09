import { ensureSceneFontsLoaded } from '@fonts/font-loader';
import type { FontAsset } from '@state/scene/fonts';
import { FontBinaryStore } from '../font-binary-store';
import { throwIfImportAborted } from '../import-abort';

function markAssetMissing(value: unknown, asset: FontAsset): unknown {
    if (typeof value === 'string' && value.startsWith(`Project:${asset.id}|`)) {
        return `MissingProject:${asset.family}|${value.split('|')[1] || '400'}`;
    }
    if (Array.isArray(value)) return value.map((entry) => markAssetMissing(entry, asset));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, markAssetMissing(entry, asset)]));
}

export async function hydrateSceneFonts(
    envelope: any,
    fontPayloads: Map<string, Uint8Array>,
    signal?: AbortSignal
): Promise<string[]> {
    const warnings: string[] = [];
    const fontAssets = envelope.scene?.fontAssets as Record<string, FontAsset> | undefined;
    for (const asset of Object.values(fontAssets ?? {})) {
        throwIfImportAborted(signal);
        if (!asset?.id) continue;
        let missingPayload = false;
        for (const variant of asset.variants ?? []) {
            const payload = fontPayloads.get(`${asset.id}/${variant.id}`) ?? fontPayloads.get(asset.id);
            if (!payload) {
                warnings.push(`Missing font payload for ${asset.family} ${variant.weight} ${variant.style}`);
                missingPayload = true;
                continue;
            }
            try {
                await FontBinaryStore.put(variant.binaryId || variant.hash || asset.id, payload);
            } catch (error) {
                warnings.push(`Failed to hydrate font ${asset.family}: ${(error as Error).message}`);
                missingPayload = true;
            }
        }
        if (missingPayload) envelope.scene = markAssetMissing(envelope.scene, asset);
    }
    return warnings;
}

/**
 * Load referenced faces only after the imported document owns the scene store.
 * Font registration emits renderer refresh events, so firing it before scene
 * application can leave the newly-created text objects measured with fallbacks.
 */
export async function preloadImportedSceneFonts(envelope: any): Promise<string[]> {
    try {
        await ensureSceneFontsLoaded(envelope.scene?.elements, envelope.scene?.macros, {
            automation: envelope.scene?.automation,
        });
        return [];
    } catch (error) {
        return [`Failed to preload scene fonts: ${error instanceof Error ? error.message : String(error)}`];
    }
}

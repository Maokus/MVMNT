import { ensureSceneFontsLoaded } from '@fonts/font-loader';
import {
    encodeMissingProjectFontToken,
    encodeProjectFontToken,
    parseFontSelectionToken,
    type FontAsset,
    type FontVariant,
} from '@state/scene/fonts';
import { FontBinaryStore } from '../font-binary-store';
import { throwIfImportAborted } from '../import-abort';

export interface HydratedFontAsset {
    asset: FontAsset;
    variants: FontVariant[];
}

export interface FontHydrationResult {
    warnings: string[];
    hydratedAssets: HydratedFontAsset[];
}

function selectVariant(asset: HydratedFontAsset, weight?: string, italic?: boolean): FontVariant | undefined {
    const requestedWeight = Number.parseInt(weight || '400', 10) || 400;
    const requestedStyle = italic ? 'italic' : 'normal';
    return (
        asset.variants.find((variant) => variant.weight === requestedWeight && variant.style === requestedStyle) ??
        asset.variants
            .filter((variant) => variant.style === requestedStyle)
            .sort((a, b) => Math.abs(a.weight - requestedWeight) - Math.abs(b.weight - requestedWeight))[0]
    );
}

function resolvedToken(value: string, assets: HydratedFontAsset[]): string | undefined {
    const parsed = parseFontSelectionToken(value);
    if (parsed.missing) {
        for (const asset of assets) {
            if (parsed.family.localeCompare(asset.asset.family, undefined, { sensitivity: 'accent' }) !== 0) continue;
            const variant = selectVariant(asset, parsed.weight, parsed.italic);
            if (variant) return encodeProjectFontToken(asset.asset.id, variant.weight, variant.style === 'italic');
        }
        return undefined;
    }
    if (!parsed.isCustom || !parsed.assetId) return undefined;
    const asset = assets.find((candidate) => candidate.asset.id === parsed.assetId);
    if (asset && !selectVariant(asset, parsed.weight, parsed.italic)) {
        return encodeMissingProjectFontToken(
            asset.asset.family,
            Number.parseInt(parsed.weight || '400', 10) || 400,
            Boolean(parsed.italic)
        );
    }
    return undefined;
}

/** Reconnect missing selections to the embedded faces that were restored from this package. */
export function reconcileHydratedFontTokens(value: unknown, assets: HydratedFontAsset[]): unknown {
    if (typeof value === 'string') return resolvedToken(value, assets) ?? value;
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((entry) => {
            const resolved = reconcileHydratedFontTokens(entry, assets);
            changed ||= resolved !== entry;
            return resolved;
        });
        return changed ? next : value;
    }
    if (!value || typeof value !== 'object') return value;
    let changed = false;
    const next = Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
            const resolved = reconcileHydratedFontTokens(entry, assets);
            changed ||= resolved !== entry;
            return [key, resolved];
        })
    );
    return changed ? next : value;
}

export async function hydrateSceneFonts(
    envelope: any,
    fontPayloads: Map<string, Uint8Array>,
    signal?: AbortSignal
): Promise<FontHydrationResult> {
    const warnings: string[] = [];
    const hydratedAssets: HydratedFontAsset[] = [];
    const fontAssets = envelope.scene?.fontAssets as Record<string, FontAsset> | undefined;
    for (const asset of Object.values(fontAssets ?? {})) {
        throwIfImportAborted(signal);
        if (!asset?.id) continue;
        const hydratedVariants: FontVariant[] = [];
        for (const variant of asset.variants ?? []) {
            const payload = fontPayloads.get(`${asset.id}/${variant.id}`) ?? fontPayloads.get(asset.id);
            if (!payload) {
                warnings.push(`Missing font payload for ${asset.family} ${variant.weight} ${variant.style}`);
                continue;
            }
            try {
                await FontBinaryStore.put(variant.binaryId || variant.hash || asset.id, payload);
                hydratedVariants.push(variant);
            } catch (error) {
                warnings.push(`Failed to hydrate font ${asset.family}: ${(error as Error).message}`);
            }
        }
        hydratedAssets.push({ asset, variants: hydratedVariants });
    }
    return { warnings, hydratedAssets };
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

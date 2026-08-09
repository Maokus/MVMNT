import { acquireGoogleFontFamily, fetchGoogleFontCatalog, hasGoogleFontsApiKey } from '@fonts/google-fonts-client';
import { encodeProjectFontToken, parseFontSelectionToken } from '@state/scene/fonts';

function missingFamilies(value: unknown, result = new Set<string>()): Set<string> {
    if (typeof value === 'string' && value.startsWith('MissingGoogle:')) {
        result.add(parseFontSelectionToken(value).family);
    } else if (Array.isArray(value)) {
        value.forEach((entry) => missingFamilies(entry, result));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach((entry) => missingFamilies(entry, result));
    }
    return result;
}

function replaceFamily(value: unknown, family: string, assetId: string): unknown {
    if (typeof value === 'string' && value.startsWith('MissingGoogle:')) {
        const parsed = parseFontSelectionToken(value);
        if (parsed.family !== family) return value;
        return encodeProjectFontToken(
            assetId,
            Number.parseInt(parsed.weight || '400', 10) || 400,
            Boolean(parsed.italic)
        );
    }
    if (Array.isArray(value)) return value.map((entry) => replaceFamily(entry, family, assetId));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, replaceFamily(entry, family, assetId)])
    );
}

export async function resolveLegacyGoogleFonts(
    envelope: any,
    fontPayloads: Map<string, Uint8Array>,
    signal?: AbortSignal
): Promise<{ envelope: any; warnings: string[]; upgraded: boolean }> {
    const families = [...missingFamilies(envelope.scene)];
    if (!families.length) return { envelope, warnings: [], upgraded: false };
    if (!hasGoogleFontsApiKey()) {
        return {
            envelope,
            warnings: [
                `Missing Google fonts: ${families.join(', ')}. Configure an API key, then retry or replace them.`,
            ],
            upgraded: false,
        };
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return {
            envelope,
            warnings: [
                `Missing Google fonts: ${families.join(', ')}. Reconnect to download them or choose replacements.`,
            ],
            upgraded: false,
        };
    }

    const warnings: string[] = [];
    let upgraded = false;
    let next = envelope;
    try {
        const catalog = await fetchGoogleFontCatalog(signal);
        for (const familyName of families) {
            signal?.throwIfAborted();
            const family = catalog.items.find((entry) => entry.family === familyName);
            if (!family) {
                warnings.push(`Google font '${familyName}' is no longer present in the catalog.`);
                continue;
            }
            try {
                const acquired = await acquireGoogleFontFamily(family, { signal });
                const scene = next.scene ?? {};
                next = {
                    ...next,
                    scene: {
                        ...(replaceFamily(scene, familyName, acquired.asset.id) as Record<string, unknown>),
                        fontAssets: {
                            ...(scene.fontAssets ?? {}),
                            [acquired.asset.id]: acquired.asset,
                        },
                    },
                };
                for (const variant of acquired.asset.variants) {
                    const bytes = acquired.payloads.get(variant.binaryId!);
                    if (bytes) fontPayloads.set(`${acquired.asset.id}/${variant.id}`, new Uint8Array(bytes));
                }
                upgraded = true;
            } catch (error) {
                warnings.push(`Failed to embed Google font '${familyName}': ${(error as Error).message}`);
            }
        }
    } catch (error) {
        warnings.push(`Could not load the Google Fonts catalog: ${(error as Error).message}`);
    }
    return { envelope: next, warnings, upgraded };
}

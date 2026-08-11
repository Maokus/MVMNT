import type { SceneDocumentState } from './storeTypes';
import type { FontAsset, ParsedFontSelection } from '@fonts/types';
export type {
    FontAsset,
    FontAssetSource,
    FontSelectionSource,
    FontSourceFormat,
    FontVariant,
    ParsedFontSelection,
} from '@fonts/types';

const CUSTOM_PREFIX = 'Custom:';
const PROJECT_PREFIX = 'Project:';
const BUILT_IN_PREFIX = 'BuiltIn:';
const DEVICE_PREFIX = 'Device:';
const MISSING_GOOGLE_PREFIX = 'MissingGoogle:';
const MISSING_PROJECT_PREFIX = 'MissingProject:';

const BUILT_IN_FAMILIES: Record<string, string> = {
    inter: 'Inter',
};

export interface MissingFontReference {
    family: string;
    source: 'google' | 'project';
}

export function encodeCustomFontToken(assetId: string, weight?: number, italic?: boolean): string {
    const weightPart = typeof weight === 'number' && Number.isFinite(weight) ? String(Math.round(weight)) : '';
    const suffix = italic ? 'i' : '';
    return `${PROJECT_PREFIX}${assetId}|${weightPart}${suffix}`;
}

export const encodeProjectFontToken = encodeCustomFontToken;

export function encodeBuiltInFontToken(fontId: string, weight = 400, italic = false): string {
    return `${BUILT_IN_PREFIX}${fontId}|${Math.round(weight)}${italic ? 'i' : ''}`;
}

export function encodeDeviceFontToken(family: string, weight = 400, italic = false): string {
    return `${DEVICE_PREFIX}${family}|${Math.round(weight)}${italic ? 'i' : ''}`;
}

export function encodeMissingGoogleFontToken(family: string, weight = 400, italic = false): string {
    return `${MISSING_GOOGLE_PREFIX}${family}|${Math.round(weight)}${italic ? 'i' : ''}`;
}

export function encodeMissingProjectFontToken(family: string, weight = 400, italic = false): string {
    return `${MISSING_PROJECT_PREFIX}${family}|${Math.round(weight)}${italic ? 'i' : ''}`;
}

export function isCustomFontToken(token: string | undefined): token is string {
    return typeof token === 'string' && (token.startsWith(CUSTOM_PREFIX) || token.startsWith(PROJECT_PREFIX));
}

function parseWeightSection(weightSection?: string): { weight?: string; italic?: boolean } {
    const weightToken = (weightSection || '').trim();
    const italic = weightToken.endsWith('i');
    const numericWeight = italic ? weightToken.slice(0, -1) : weightToken;
    return { weight: numericWeight || undefined, italic: italic || undefined };
}

export function parseFontSelectionToken(
    token?: string,
    resolver?: (assetId: string) => FontAsset | undefined
): ParsedFontSelection {
    if (!token) {
        return { family: '', token: '', italic: false, source: 'legacy' };
    }
    if (token.startsWith(BUILT_IN_PREFIX)) {
        const [id, weightSection] = token.slice(BUILT_IN_PREFIX.length).split('|');
        return {
            family: BUILT_IN_FAMILIES[id.trim().toLowerCase()] ?? id.trim(),
            token,
            source: 'built-in',
            ...parseWeightSection(weightSection),
        };
    }
    if (token.startsWith(DEVICE_PREFIX)) {
        const [family, weightSection] = token.slice(DEVICE_PREFIX.length).split('|');
        return { family: family.trim(), token, source: 'device', ...parseWeightSection(weightSection) };
    }
    if (token.startsWith(MISSING_GOOGLE_PREFIX) || token.startsWith(MISSING_PROJECT_PREFIX)) {
        const prefix = token.startsWith(MISSING_GOOGLE_PREFIX) ? MISSING_GOOGLE_PREFIX : MISSING_PROJECT_PREFIX;
        const [family, weightSection] = token.slice(prefix.length).split('|');
        return {
            family: family.trim(),
            token,
            source: 'missing',
            missing: true,
            ...parseWeightSection(weightSection),
        };
    }
    if (!isCustomFontToken(token)) {
        const rawToken = token as string;
        const [familyPart, weightPart] = rawToken.split('|');
        const parsedWeight = parseWeightSection(weightPart);
        return {
            family: familyPart.trim(),
            ...parsedWeight,
            source: 'legacy',
            token: rawToken,
        };
    }

    const prefix = token.startsWith(PROJECT_PREFIX) ? PROJECT_PREFIX : CUSTOM_PREFIX;
    const payload = token.slice(prefix.length);
    const [idPart, weightSection] = payload.split('|');
    const assetId = idPart.trim();
    const weightToken = (weightSection || '').trim();
    const italic = weightToken.endsWith('i');
    const numericWeight = italic ? weightToken.slice(0, -1) : weightToken;
    const asset = resolver?.(assetId);

    return {
        family: asset?.family ?? `Custom ${assetId}`,
        weight: numericWeight || undefined,
        italic: italic || undefined,
        assetId,
        isCustom: true,
        source: 'project',
        token,
    };
}

function resolvedProjectFontToken(token: string, asset: FontAsset): string | undefined {
    const parsed = parseFontSelectionToken(token);
    if (!parsed.missing || parsed.family.localeCompare(asset.family, undefined, { sensitivity: 'accent' }) !== 0) {
        return undefined;
    }
    const requestedWeight = Number.parseInt(parsed.weight || '400', 10) || 400;
    const requestedStyle = parsed.italic ? 'italic' : 'normal';
    const variant =
        asset.variants.find((entry) => entry.weight === requestedWeight && entry.style === requestedStyle) ??
        asset.variants
            .filter((entry) => entry.style === requestedStyle)
            .sort((a, b) => Math.abs(a.weight - requestedWeight) - Math.abs(b.weight - requestedWeight))[0] ??
        asset.variants[0];
    return variant ? encodeProjectFontToken(asset.id, variant.weight, variant.style === 'italic') : undefined;
}

/** Replace missing-font tokens for an imported family while preserving each requested face where possible. */
export function resolveMissingFontTokens(value: unknown, asset: FontAsset): unknown {
    if (typeof value === 'string') return resolvedProjectFontToken(value, asset) ?? value;
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((entry) => {
            const resolved = resolveMissingFontTokens(entry, asset);
            changed ||= resolved !== entry;
            return resolved;
        });
        return changed ? next : value;
    }
    if (!value || typeof value !== 'object') return value;
    let changed = false;
    const next = Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
            const resolved = resolveMissingFontTokens(entry, asset);
            changed ||= resolved !== entry;
            return [key, resolved];
        })
    );
    return changed ? next : value;
}

/** Collect unique unresolved font families from any serializable scene value. */
export function collectMissingFontReferences(value: unknown): MissingFontReference[] {
    const references = new Map<string, MissingFontReference>();
    const visit = (entry: unknown) => {
        if (typeof entry === 'string') {
            const parsed = parseFontSelectionToken(entry);
            if (parsed.missing && parsed.family) {
                const source = entry.startsWith(MISSING_GOOGLE_PREFIX) ? 'google' : 'project';
                const key = `${source}:${parsed.family.toLocaleLowerCase()}`;
                if (!references.has(key)) references.set(key, { family: parsed.family, source });
            }
        } else if (Array.isArray(entry)) {
            entry.forEach(visit);
        } else if (entry && typeof entry === 'object') {
            Object.values(entry).forEach(visit);
        }
    };
    visit(value);
    return [...references.values()].sort(
        (a, b) => a.family.localeCompare(b.family) || a.source.localeCompare(b.source)
    );
}

export function getSceneFontAssets(state: SceneDocumentState): Record<string, FontAsset> {
    return state.fonts?.assets ?? {};
}

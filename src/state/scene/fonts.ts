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

export function getSceneFontAssets(state: SceneDocumentState): Record<string, FontAsset> {
    return state.fonts?.assets ?? {};
}

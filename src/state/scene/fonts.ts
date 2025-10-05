import type { SceneStoreState } from '@state/sceneStore';

export type FontSourceFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

export interface FontVariant {
    id: string;
    weight: number;
    style: 'normal' | 'italic';
    sourceFormat: FontSourceFormat;
    variationSettings?: Record<string, number>;
    postscriptName?: string;
}

export interface FontAsset {
    id: string;
    family: string;
    variants: FontVariant[];
    fileSize: number;
    originalFileName: string;
    createdAt: number;
    updatedAt: number;
    licensingAcknowledged: boolean;
    hash?: string;
}

export interface ParsedFontSelection {
    family: string;
    weight?: string;
    italic?: boolean;
    assetId?: string;
    isCustom?: boolean;
    token: string;
}

const CUSTOM_PREFIX = 'Custom:';

export function encodeCustomFontToken(assetId: string, weight?: number, italic?: boolean): string {
    const weightPart = typeof weight === 'number' && Number.isFinite(weight) ? String(Math.round(weight)) : '';
    const suffix = italic ? 'i' : '';
    return `${CUSTOM_PREFIX}${assetId}|${weightPart}${suffix}`;
}

export function isCustomFontToken(token: string | undefined): token is string {
    return typeof token === 'string' && token.startsWith(CUSTOM_PREFIX);
}

export function parseFontSelectionToken(token?: string, resolver?: (assetId: string) => FontAsset | undefined): ParsedFontSelection {
    if (!token) {
        return { family: '', token: '', italic: false };
    }
    if (!isCustomFontToken(token)) {
        const rawToken = token as string;
        const [familyPart, weightPart] = rawToken.split('|');
        return {
            family: familyPart.trim(),
            weight: weightPart?.trim() || undefined,
            italic: weightPart?.endsWith('i') ? true : undefined,
            token: rawToken,
        };
    }

    const payload = token.slice(CUSTOM_PREFIX.length);
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
        token,
    };
}

export function getSceneFontAssets(state: SceneStoreState): Record<string, FontAsset> {
    return state.fonts?.assets ?? {};
}

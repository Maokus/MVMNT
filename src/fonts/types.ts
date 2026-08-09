export type FontSourceFormat = 'ttf' | 'otf' | 'woff' | 'woff2';
export type FontAssetSource = 'upload' | 'google';
export type FontSelectionSource = 'project' | 'built-in' | 'device' | 'missing' | 'legacy';

export interface FontVariant {
    id: string;
    weight: number;
    style: 'normal' | 'italic';
    sourceFormat: FontSourceFormat;
    postscriptName?: string;
    binaryId?: string;
    byteLength?: number;
    hash?: string;
    originalFileName?: string;
    variationSettings?: Record<string, number>;
}

export interface FontAsset {
    id: string;
    family: string;
    source?: FontAssetSource;
    originalFileName: string;
    fileSize: number;
    hash?: string;
    createdAt: number;
    updatedAt: number;
    licensingAcknowledged: boolean;
    variants: FontVariant[];
    google?: {
        family: string;
        version?: string;
        lastModified?: string;
    };
}

export interface ParsedFontSelection {
    family: string;
    source: FontSelectionSource;
    assetId?: string;
    weight?: string;
    italic?: boolean;
    isCustom?: boolean;
    missing?: boolean;
    token: string;
}

import { FontBinaryStore } from '@persistence/font-binary-store';
import { useSceneStore } from '@state/sceneStore';
import type { FontAsset, FontVariant } from '@state/scene/fonts';
import { sha256Hex } from '@utils/hash/sha256';
import { registerCustomFontVariant } from './font-loader';
import { dispatchSceneCommand } from '@state/scene';

export interface GoogleFontFamily {
    family: string;
    variants: string[];
    version?: string;
    lastModified?: string;
    category?: string;
    files: Record<string, string>;
}

export interface GoogleFontCatalog {
    items: GoogleFontFamily[];
    fetchedAt: number;
}

export interface GoogleFontDownloadProgress {
    family: string;
    completed: number;
    total: number;
    variant?: string;
}

export interface AcquiredGoogleFontFamily {
    asset: FontAsset;
    payloads: Map<string, ArrayBuffer>;
}

const CATALOG_CACHE_KEY = 'mvmnt.google-fonts.catalog.v1';

function apiKey(): string {
    return String((import.meta as any).env?.VITE_GOOGLE_FONTS_API_KEY ?? '').trim();
}

export function hasGoogleFontsApiKey(): boolean {
    return Boolean(apiKey());
}

export function readCachedGoogleFontCatalog(): GoogleFontCatalog | null {
    try {
        const raw = localStorage.getItem(CATALOG_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as GoogleFontCatalog;
        return Array.isArray(parsed?.items) ? parsed : null;
    } catch {
        return null;
    }
}

export async function fetchGoogleFontCatalog(signal?: AbortSignal): Promise<GoogleFontCatalog> {
    const key = apiKey();
    if (!key) throw new Error('Google Fonts is unavailable because this build has no API key configured.');
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Google Fonts is unavailable while offline.');
    }
    const url = new URL('https://www.googleapis.com/webfonts/v1/webfonts');
    url.searchParams.set('key', key);
    url.searchParams.set('sort', 'popularity');
    url.searchParams.set('capability', 'WOFF2');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Google Fonts catalog request failed (${response.status}).`);
    const body = await response.json();
    const catalog: GoogleFontCatalog = {
        items: Array.isArray(body?.items) ? body.items : [],
        fetchedAt: Date.now(),
    };
    try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
    } catch {
        // Catalog caching is optional.
    }
    return catalog;
}

function variantDescriptor(name: string): { weight: number; style: 'normal' | 'italic' } {
    const italic = name.includes('italic');
    const numeric = Number.parseInt(name, 10);
    return { weight: Number.isFinite(numeric) ? numeric : 400, style: italic ? 'italic' : 'normal' };
}

function safeHttpsUrl(value: string): string {
    const url = new URL(value.replace(/^http:/, 'https:'));
    if (url.protocol !== 'https:' || url.hostname !== 'fonts.gstatic.com') {
        throw new Error('Google Fonts returned an unexpected download URL.');
    }
    return url.toString();
}

export async function acquireGoogleFontFamily(
    family: GoogleFontFamily,
    options: { signal?: AbortSignal; onProgress?: (progress: GoogleFontDownloadProgress) => void } = {}
): Promise<AcquiredGoogleFontFamily> {
    const entries = Object.entries(family.files ?? {});
    if (!entries.length) throw new Error(`${family.family} has no downloadable font files.`);
    const payloads = new Map<string, ArrayBuffer>();
    const variants: FontVariant[] = [];
    let completed = 0;

    // Keep concurrency deliberately small: large families should not starve the editor.
    for (let offset = 0; offset < entries.length; offset += 3) {
        const batch = entries.slice(offset, offset + 3);
        const results = await Promise.all(
            batch.map(async ([name, sourceUrl]) => {
                options.signal?.throwIfAborted();
                const response = await fetch(safeHttpsUrl(sourceUrl), { signal: options.signal });
                if (!response.ok) throw new Error(`Failed to download ${family.family} ${name} (${response.status}).`);
                const buffer = await response.arrayBuffer();
                if (!buffer.byteLength) throw new Error(`Google Fonts returned an empty ${name} file.`);
                const hash = await sha256Hex(new Uint8Array(buffer));
                const descriptor = variantDescriptor(name);
                const variant: FontVariant = {
                    id: name.replace(/[^a-z0-9_-]+/gi, '-'),
                    ...descriptor,
                    sourceFormat: 'woff2',
                    binaryId: hash,
                    hash,
                    byteLength: buffer.byteLength,
                    originalFileName: `${family.family}-${name}.woff2`,
                };
                return { name, hash, buffer, variant };
            })
        );
        for (const result of results) {
            payloads.set(result.hash, result.buffer);
            variants.push(result.variant);
            completed += 1;
            options.onProgress?.({ family: family.family, completed, total: entries.length, variant: result.name });
        }
    }

    variants.sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));
    const now = Date.now();
    const assetId = crypto.randomUUID();
    return {
        asset: {
            id: assetId,
            family: family.family,
            variants,
            originalFileName: `${family.family} (Google Fonts)`,
            fileSize: variants.reduce((total, variant) => total + (variant.byteLength ?? 0), 0),
            createdAt: now,
            updatedAt: now,
            licensingAcknowledged: true,
            source: 'google',
            google: {
                family: family.family,
                version: family.version,
                lastModified: family.lastModified,
            },
        },
        payloads,
    };
}

export async function addGoogleFontFamilyToProject(
    family: GoogleFontFamily,
    options: { signal?: AbortSignal; onProgress?: (progress: GoogleFontDownloadProgress) => void } = {}
): Promise<FontAsset> {
    const state = useSceneStore.getState();
    const existing = Object.values(state.fonts.assets).find(
        (asset) =>
            asset.source === 'google' &&
            asset.google?.family === family.family &&
            (!family.version || asset.google.version === family.version)
    );
    if (existing) return existing;

    const acquired = await acquireGoogleFontFamily(family, options);
    const stored: string[] = [];
    try {
        for (const [binaryId, payload] of acquired.payloads) {
            const existed = await FontBinaryStore.get(binaryId);
            await FontBinaryStore.put(binaryId, payload);
            if (!existed) stored.push(binaryId);
        }
    } catch (error) {
        await Promise.all(stored.map((binaryId) => FontBinaryStore.delete(binaryId)));
        throw error;
    }
    try {
        await Promise.all(
            acquired.asset.variants.map(async (variant) => {
                const payload = acquired.payloads.get(variant.binaryId!);
                if (payload) await registerCustomFontVariant({ asset: acquired.asset, variant, data: payload });
            })
        );
    } catch (error) {
        await Promise.all(stored.map((binaryId) => FontBinaryStore.delete(binaryId)));
        throw error;
    }
    dispatchSceneCommand({ type: 'registerFontAsset', asset: acquired.asset });
    return acquired.asset;
}

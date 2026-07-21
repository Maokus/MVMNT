// Lightweight dynamic font loader with Google Fonts + custom asset support
// Inspired by font-picker-react but simplified for this project
import type { FontAsset, FontVariant, ParsedFontSelection } from '@state/scene/fonts';
import { parseFontSelectionToken } from '@state/scene/fonts';
import { FontBinaryStore } from '@persistence/font-binary-store';

const loadedFamilies: Map<string, Set<number>> = new Map();
const pendingGoogleLoads = new Map<string, Promise<boolean>>();
const unavailableGoogleLoads = new Map<string, number>();
const customAssets: Map<string, FontAsset> = new Map();
const customVariantStatus: Map<string, Set<string>> = new Map();
const customBinaryCache: Map<string, ArrayBuffer> = new Map();

function familyToURLParam(family: string): string {
    return family.trim().replace(/\s+/g, '+');
}

/** Fonts supplied by the operating system. They must never require a network request. */
const SYSTEM_FONT_FAMILIES = new Set(
    ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'sans-serif', 'serif', 'monospace', 'system-ui'].map(
        (family) => family.toLowerCase()
    )
);

export function isSystemFontFamily(family: string): boolean {
    return SYSTEM_FONT_FAMILIES.has(family.trim().toLowerCase());
}

function variantKey(variant: FontVariant): string {
    const weight = Number.isFinite(variant.weight) ? variant.weight : 400;
    const style = variant.style === 'italic' ? 'italic' : 'normal';
    return `${weight}:${style}`;
}

function cloneVariant(variant: FontVariant): FontVariant {
    return {
        ...variant,
        variationSettings: variant.variationSettings ? { ...variant.variationSettings } : undefined,
    };
}

function rememberAsset(asset: FontAsset) {
    const normalized: FontAsset = {
        ...asset,
        variants: Array.isArray(asset.variants) ? asset.variants.map((entry) => cloneVariant(entry)) : [],
    };
    customAssets.set(asset.id, normalized);
}

async function getCustomBinary(assetId: string): Promise<ArrayBuffer | undefined> {
    const cached = customBinaryCache.get(assetId);
    if (cached) {
        return cached.slice(0);
    }
    const payload = await FontBinaryStore.get(assetId);
    if (!payload) return undefined;
    const clone = payload.slice(0);
    customBinaryCache.set(assetId, clone);
    return clone.slice(0);
}

function cacheCustomBinary(assetId: string, data: ArrayBuffer) {
    customBinaryCache.set(assetId, data.slice(0));
}

function isArrayBuffer(data: unknown): data is ArrayBuffer {
    return Object.prototype.toString.call(data) === '[object ArrayBuffer]';
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    let source: Uint8Array;
    if (isArrayBuffer(data)) {
        source = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
        source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
        throw new Error('Unsupported font buffer');
    }
    const clone = new Uint8Array(source.byteLength);
    clone.set(source);
    return clone.buffer;
}

function resolveVariant(asset: FontAsset, weight?: number, italic?: boolean): FontVariant | undefined {
    const style = italic ? 'italic' : 'normal';
    const candidates = asset.variants ?? [];
    if (candidates.length === 0) return undefined;
    const targetWeight = typeof weight === 'number' && Number.isFinite(weight) ? weight : undefined;
    if (targetWeight != null) {
        const exact = candidates.find((entry) => entry.weight === targetWeight && entry.style === style);
        if (exact) return cloneVariant(exact);
    }
    const sameStyle = candidates.find((entry) => entry.style === style);
    if (sameStyle) return cloneVariant(sameStyle);
    return cloneVariant(candidates[0]);
}

export interface LoadFontOptions {
    weights?: number[];
    italics?: boolean;
    display?: 'auto' | 'swap' | 'block' | 'fallback' | 'optional';
}

export interface RegisterCustomFontVariantOptions {
    asset: FontAsset;
    variant: FontVariant;
    data: ArrayBuffer | ArrayBufferView;
}

function dispatchFontLoaded(family: string, weights: number[], source: 'google' | 'custom' = 'google') {
    try {
        window.dispatchEvent(new CustomEvent('font-loaded', { detail: { family, weights, source } }));
    } catch {
        /* ignore environments without window events */
    }
}

async function installFontFace(asset: FontAsset, variant: FontVariant, buffer: ArrayBuffer): Promise<void> {
    if (typeof document === 'undefined' || typeof (window as any).FontFace === 'undefined') {
        return;
    }
    try {
        const descriptors: FontFaceDescriptors = {
            weight: `${variant.weight}`,
            style: variant.style,
            display: 'swap',
        };
        if (variant.variationSettings) {
            (descriptors as any).variationSettings = variant.variationSettings;
        }
        const face = new FontFace(asset.family, buffer, descriptors);
        const loaded = await face.load();
        (document as any).fonts?.add(loaded);
    } catch (error) {
        console.warn('[font-loader] failed to install custom font face', error);
    }
}

export async function registerCustomFontVariant(options: RegisterCustomFontVariantOptions): Promise<void> {
    const { asset, variant } = options;
    if (!asset?.id) return;
    rememberAsset(asset);
    const normalizedVariant = cloneVariant(variant);
    const key = variantKey(normalizedVariant);
    const existing = customVariantStatus.get(asset.id) ?? new Set<string>();
    if (existing.has(key)) {
        return;
    }
    existing.add(key);
    customVariantStatus.set(asset.id, existing);
    const buffer = toArrayBuffer(options.data);
    cacheCustomBinary(asset.id, buffer);
    await installFontFace(asset, normalizedVariant, buffer);
    try {
        window.dispatchEvent(
            new CustomEvent('font-loaded', {
                detail: { family: asset.family, weights: [normalizedVariant.weight], source: 'custom', assetId: asset.id },
            })
        );
    } catch {
        /* ignore */
    }
}

export async function ensureFontVariantsRegistered(asset: FontAsset, variants: FontVariant[]): Promise<void> {
    if (!asset?.id) return;
    rememberAsset(asset);
    const registry = customVariantStatus.get(asset.id) ?? new Set<string>();
    const missing = variants.filter((variant) => !registry.has(variantKey(variant)));
    if (!missing.length) return;
    const payload = await getCustomBinary(asset.id);
    if (!payload) return;
    await Promise.all(missing.map((variant) => registerCustomFontVariant({ asset, variant, data: payload })));
}

/**
 * Injects (or updates) a Google Fonts stylesheet link for the given family/weights.
 * Returns a list of the cumulative loaded weights after this call (synchronous part only).
 */
export function loadGoogleFont(family: string, options: LoadFontOptions = {}): number[] {
    if (!family) return [];
    const weights = options.weights?.length ? options.weights : [400, 700];
    const italics = options.italics ? true : false;
    const display = options.display || 'swap';
    const existing = loadedFamilies.get(family) || new Set<number>();
    const allWeights = Array.from(new Set([...existing, ...weights])).sort((a, b) => a - b);
    let variantParam = '';
    if (italics) {
        const combos: string[] = [];
        allWeights.forEach((w) => {
            combos.push(`0,${w}`);
            combos.push(`1,${w}`);
        });
        variantParam = `ital,wght@${combos.join(';')}`;
    } else {
        variantParam = `wght@${allWeights.join(';')}`;
    }
    const href = `https://fonts.googleapis.com/css2?family=${familyToURLParam(
        family
    )}:${variantParam}&display=${display}`;
    if (typeof document !== 'undefined') {
        const id = `gf-${familyToURLParam(family)}`;
        // Re-use a single link element per family so we don't spam <head>
        let link = document.getElementById(id) as HTMLLinkElement | null;
        if (!link) {
            link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        link.href = href;
    }
    return allWeights;
}

function waitForGoogleStylesheet(family: string, options: LoadFontOptions): Promise<boolean> {
    if (typeof document === 'undefined') return Promise.resolve(false);
    const weights = options.weights?.length ? options.weights : [400, 700];
    const id = `gf-${familyToURLParam(family)}`;
    const link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) return Promise.resolve(false);

    return new Promise((resolve) => {
        let settled = false;
        const finish = (available: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            link.removeEventListener('load', onLoad);
            link.removeEventListener('error', onError);
            if (!available) link.dataset.fontLoadFailed = 'true';
            resolve(available);
        };
        const onLoad = () => finish(true);
        const onError = () => finish(false);
        // A blocked network request may never emit error. Keep rendering with the
        // CSS fallback instead of leaving controls in a loading state indefinitely.
        const timeout = window.setTimeout(() => finish(false), 2000);
        link.addEventListener('load', onLoad, { once: true });
        link.addEventListener('error', onError, { once: true });
        // Force a fresh request after a previous failure. Assigning the same href
        // is not consistently retried by browsers, so clear it first.
        if (link.dataset.fontLoadFailed === 'true') {
            link.dataset.fontLoadFailed = 'false';
            const href = link.href;
            link.href = '';
            link.href = href;
        }
    });
}

/**
 * Loads a font family (and optional weights) and resolves once the browser reports the fonts are available.
 * Gracefully resolves after a timeout even if the Font Loading API isn't supported.
 */
export async function loadGoogleFontAsync(family: string, options: LoadFontOptions = {}): Promise<boolean> {
    const normalizedFamily = family.trim();
    if (
        !normalizedFamily ||
        isSystemFontFamily(normalizedFamily) ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
    ) {
        return isSystemFontFamily(normalizedFamily);
    }
    const weights = options.weights?.length ? options.weights : [400, 700];
    const loaded = loadedFamilies.get(normalizedFamily);
    if (loaded && weights.every((weight) => loaded.has(weight))) return true;

    const requestKey = `${normalizedFamily}|${weights.slice().sort((a, b) => a - b).join(',')}|${Boolean(options.italics)}`;
    if ((unavailableGoogleLoads.get(requestKey) ?? 0) > Date.now()) return false;
    const pending = pendingGoogleLoads.get(requestKey);
    if (pending) return pending;

    const request = (async () => {
        loadGoogleFont(normalizedFamily, options);
        const stylesheetAvailable = await waitForGoogleStylesheet(normalizedFamily, options);
        if (!stylesheetAvailable) {
            // Rendering may call ensureFontLoaded repeatedly. Avoid repeatedly
            // attempting a blocked remote request while offline, but allow a retry
            // soon after connectivity returns.
            unavailableGoogleLoads.set(requestKey, Date.now() + 30_000);
            return false;
        }

        const fontFaceSet = typeof document !== 'undefined' ? (document as any).fonts as FontFaceSet | undefined : undefined;
        if (fontFaceSet) {
            await Promise.all(
                weights.map(async (weight) => {
                    try {
                        await fontFaceSet.load(`${weight} 32px '${normalizedFamily}'`);
                    } catch {
                        // The stylesheet loaded but an individual face did not.
                        // Keep the browser fallback rather than failing rendering.
                    }
                })
            );
        }
        const completed = loadedFamilies.get(normalizedFamily) ?? new Set<number>();
        weights.forEach((weight) => completed.add(weight));
        loadedFamilies.set(normalizedFamily, completed);
        unavailableGoogleLoads.delete(requestKey);
        dispatchFontLoaded(normalizedFamily, weights);
        return true;
    })();
    pendingGoogleLoads.set(requestKey, request);
    try {
        return await request;
    } finally {
        pendingGoogleLoads.delete(requestKey);
    }
}

// Normalizes a weight string (e.g. 'normal','bold',' 100 ') to a numeric weight the API expects
function normalizeWeight(weight?: string | number): number | undefined {
    if (weight == null) return undefined;
    if (typeof weight === 'number') return weight;
    const trimmed = weight.trim().toLowerCase();
    if (trimmed === 'normal') return 400;
    if (trimmed === 'bold') return 700;
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? undefined : num;
}

/**
 * Ensure a font family (and optionally a specific weight) is loaded.
 * If a weight is provided we only request that weight (plus already loaded ones) instead of the default bundle.
 */
export async function ensureFontLoaded(selection: string, weight?: string | number): Promise<void> {
    const parsed = parseFontSelection(selection);
    if (parsed.isCustom && parsed.assetId) {
        const asset = customAssets.get(parsed.assetId);
        if (!asset) return;
        const resolvedWeight = normalizeWeight(weight ?? parsed.weight);
        const variant = resolveVariant(asset, resolvedWeight, parsed.italic);
        if (!variant) return;
        const registry = customVariantStatus.get(asset.id);
        if (registry?.has(variantKey(variant))) return;
        const payload = await getCustomBinary(asset.id);
        if (!payload) return;
        await registerCustomFontVariant({ asset, variant, data: payload });
        return;
    }
    const family = parsed.family || selection;
    const normalized = normalizeWeight(weight ?? parsed.weight);
    const weights = normalized ? [normalized] : [400, 500, 600, 700];
    await loadGoogleFontAsync(family, { weights, italics: Boolean(parsed.italic), display: 'swap' });
}

export function isFontLoaded(selection: string): boolean {
    const parsed = parseFontSelection(selection);
    if (parsed.isCustom && parsed.assetId) {
        const registry = customVariantStatus.get(parsed.assetId);
        if (!registry) return false;
        if (parsed.weight) {
            const weight = normalizeWeight(parsed.weight);
            const key = variantKey({ weight: weight ?? 400, style: parsed.italic ? 'italic' : 'normal', id: '', sourceFormat: 'woff2' });
            return registry.has(key);
        }
        return registry.size > 0;
    }
    return loadedFamilies.has(parsed.family || selection);
}

export function parseFontSelection(value?: string): ParsedFontSelection {
    return parseFontSelectionToken(value, (assetId) => customAssets.get(assetId));
}

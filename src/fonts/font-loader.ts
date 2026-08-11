// Offline-first font registry for built-in, device, and project font assets.
import type { FontAsset, FontVariant, ParsedFontSelection } from '@state/scene/fonts';
import { parseFontSelectionToken } from '@state/scene/fonts';
import { FontBinaryStore } from '@persistence/font-binary-store';

const customAssets: Map<string, FontAsset> = new Map();
const customVariantStatus: Map<string, Set<string>> = new Map();
const customBinaryCache: Map<string, ArrayBuffer> = new Map();

/** Fonts supplied by the operating system. They must never require a network request. */
const SYSTEM_FONT_FAMILIES = new Set(
    [
        'Arial',
        'Helvetica',
        'Times New Roman',
        'Georgia',
        'Verdana',
        'sans-serif',
        'serif',
        'monospace',
        'system-ui',
    ].map((family) => family.toLowerCase())
);

/** Legacy scenes stored the bundled default as `Inter|<weight>` before font-source tokens existed. */
const LEGACY_BUILT_IN_FAMILIES = new Set(['inter']);

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

function binaryIdFor(asset: FontAsset, variant: FontVariant): string {
    return variant.binaryId || variant.hash || asset.id;
}

async function getCustomBinary(asset: FontAsset, variant: FontVariant): Promise<ArrayBuffer | undefined> {
    const binaryId = binaryIdFor(asset, variant);
    const cached = customBinaryCache.get(binaryId);
    if (cached) {
        return cached.slice(0);
    }
    const payload = await FontBinaryStore.get(binaryId);
    if (!payload) return undefined;
    const clone = payload.slice(0);
    customBinaryCache.set(binaryId, clone);
    return clone.slice(0);
}

function cacheCustomBinary(asset: FontAsset, variant: FontVariant, data: ArrayBuffer) {
    customBinaryCache.set(binaryIdFor(asset, variant), data.slice(0));
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

export interface RegisterCustomFontVariantOptions {
    asset: FontAsset;
    variant: FontVariant;
    data: ArrayBuffer | ArrayBufferView;
}

async function installFontFace(asset: FontAsset, variant: FontVariant, buffer: ArrayBuffer): Promise<void> {
    if (typeof document === 'undefined' || typeof (window as any).FontFace === 'undefined') {
        return;
    }
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
    const buffer = toArrayBuffer(options.data);
    cacheCustomBinary(asset, normalizedVariant, buffer);
    await installFontFace(asset, normalizedVariant, buffer);
    existing.add(key);
    customVariantStatus.set(asset.id, existing);
    try {
        window.dispatchEvent(
            new CustomEvent('font-loaded', {
                detail: {
                    family: asset.family,
                    weights: [normalizedVariant.weight],
                    source: 'custom',
                    assetId: asset.id,
                },
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
    await Promise.all(
        missing.map(async (variant) => {
            const payload = await getCustomBinary(asset, variant);
            if (payload) await registerCustomFontVariant({ asset, variant, data: payload });
        })
    );
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
    if (parsed.missing) throw new Error(`Missing project font: ${parsed.family}`);
    if (parsed.isCustom && parsed.assetId) {
        let asset = customAssets.get(parsed.assetId);
        if (!asset) {
            const { useSceneStore } = await import('@state/sceneStore');
            asset = useSceneStore.getState().fonts.assets[parsed.assetId];
            if (asset) rememberAsset(asset);
        }
        if (!asset) throw new Error(`Missing project font asset: ${parsed.assetId}`);
        const resolvedWeight = normalizeWeight(weight ?? parsed.weight);
        const variant = resolveVariant(asset, resolvedWeight, parsed.italic);
        if (!variant) return;
        const registry = customVariantStatus.get(asset.id);
        if (registry?.has(variantKey(variant))) return;
        const payload = await getCustomBinary(asset, variant);
        if (!payload) throw new Error(`Missing embedded font payload: ${asset.family} ${variant.weight}`);
        await registerCustomFontVariant({ asset, variant, data: payload });
        return;
    }
    const family = parsed.family || selection;
    const normalized = normalizeWeight(weight ?? parsed.weight);
    if (!family || typeof document === 'undefined') return;
    try {
        await (document as any).fonts?.load(`${normalized ?? 400} 32px '${family.replace(/'/g, '')}'`);
    } catch {
        // Device fonts may not exist on this machine. Rendering will use its fallback.
    }
}

export function isFontLoaded(selection: string): boolean {
    const parsed = parseFontSelection(selection);
    if (parsed.isCustom && parsed.assetId) {
        const registry = customVariantStatus.get(parsed.assetId);
        if (!registry) return false;
        if (parsed.weight) {
            const weight = normalizeWeight(parsed.weight);
            const key = variantKey({
                weight: weight ?? 400,
                style: parsed.italic ? 'italic' : 'normal',
                id: '',
                sourceFormat: 'woff2',
            });
            return registry.has(key);
        }
        return registry.size > 0;
    }
    if (parsed.missing) return false;
    const fontSet = typeof document !== 'undefined' ? (document as any).fonts : undefined;
    return fontSet?.check?.(`${normalizeWeight(parsed.weight) ?? 400} 16px '${parsed.family}'`) ?? true;
}

export function parseFontSelection(value?: string): ParsedFontSelection {
    return parseFontSelectionToken(value, (assetId) => customAssets.get(assetId));
}

type SerializedBinding =
    | { type: 'constant'; value: unknown }
    | { type: 'macro'; macroId: string }
    | { type: 'keyframes'; channelId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fontSelectionFromBinding(binding: unknown, macros: Record<string, unknown>): string | undefined {
    if (typeof binding === 'string') return binding;
    if (!isRecord(binding)) return undefined;
    const serialized = binding as SerializedBinding;
    if (serialized.type === 'constant' && typeof serialized.value === 'string') return serialized.value;
    if (serialized.type !== 'macro' || typeof serialized.macroId !== 'string') return undefined;
    const macro = macros[serialized.macroId];
    return isRecord(macro) && typeof macro.value === 'string' ? macro.value : undefined;
}

/**
 * Wait for every constant or macro-backed font selection in a serialized scene.
 * Exporters call this before their first frame because element rendering only
 * requests fonts lazily, which is too late for a deterministic render.
 */
export async function ensureSceneFontsLoaded(
    elements: Record<string, { properties?: Record<string, unknown> }> | undefined,
    sceneMacros: unknown,
    options: { strict?: boolean; automation?: unknown } = {}
): Promise<void> {
    const macroRoot = isRecord(sceneMacros) ? sceneMacros : {};
    const macros = isRecord(macroRoot.macros)
        ? macroRoot.macros
        : isRecord(macroRoot.byId)
          ? macroRoot.byId
          : macroRoot;
    const selections = new Set<string>();
    const automationRoot = isRecord(options.automation) ? options.automation : {};
    const channels = isRecord(automationRoot.channels) ? automationRoot.channels : automationRoot;

    for (const element of Object.values(elements ?? {})) {
        for (const [key, binding] of Object.entries(element?.properties ?? {})) {
            if (!/(?:font|fontfamily)$/i.test(key)) continue;
            const selection = fontSelectionFromBinding(binding, macros);
            if (selection) selections.add(selection);
            if (isRecord(binding) && binding.type === 'keyframes' && typeof binding.channelId === 'string') {
                const channel = channels[binding.channelId];
                if (isRecord(channel) && Array.isArray(channel.keyframes)) {
                    for (const keyframe of channel.keyframes) {
                        if (isRecord(keyframe) && typeof keyframe.value === 'string') selections.add(keyframe.value);
                    }
                }
            }
        }
    }

    const errors: string[] = [];
    await Promise.all(
        [...selections].map(async (selection) => {
            const parsed = parseFontSelection(selection);
            const resolvedLegacyBuiltIn =
                parsed.source === 'legacy' && LEGACY_BUILT_IN_FAMILIES.has(parsed.family.trim().toLowerCase());
            if (options.strict && parsed.source === 'legacy' && !resolvedLegacyBuiltIn) {
                errors.push(`Unresolved legacy font selection: ${parsed.family}`);
                return;
            }
            try {
                await ensureFontLoaded(selection);
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        })
    );
    if (options.strict && errors.length) throw new Error(`Font preflight failed: ${errors.join('; ')}`);
}

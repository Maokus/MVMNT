import type { FontAsset } from '@state/scene/fonts';

export const FONT_ASSETS_SCHEMA_VERSION = 9;

const DEVICE_FAMILIES = new Set(['arial', 'helvetica', 'times new roman', 'georgia', 'verdana']);

function normalizeSelection(value: string): string {
    if (value.startsWith('Custom:')) return `Project:${value.slice('Custom:'.length)}`;
    if (/^(Project|BuiltIn|Device|MissingGoogle|MissingProject):/.test(value)) return value;
    const [familyPart, weightPart = '400'] = value.split('|');
    const family = familyPart.trim();
    if (!family) return value;
    if (DEVICE_FAMILIES.has(family.toLowerCase())) return `Device:${family}|${weightPart || '400'}`;
    return `MissingGoogle:${family}|${weightPart || '400'}`;
}

function migrateFontValues(value: unknown, key = '', fontContext = false): unknown {
    const isFontValue = fontContext || /(?:font|fontfamily)$/i.test(key);
    if (typeof value === 'string') {
        return isFontValue || /^(Custom|Project|BuiltIn|Device|MissingGoogle|MissingProject):/.test(value)
            ? normalizeSelection(value)
            : value;
    }
    if (Array.isArray(value)) return value.map((entry) => migrateFontValues(entry, key, isFontValue));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
            childKey,
            migrateFontValues(child, childKey || key, isFontValue),
        ])
    );
}

function migrateAsset(assetId: string, input: FontAsset): FontAsset {
    const variants = (input.variants ?? []).map((variant) => ({
        ...variant,
        binaryId: variant.binaryId || variant.hash || assetId,
        byteLength: variant.byteLength || input.fileSize,
        hash: variant.hash || input.hash,
        originalFileName: variant.originalFileName || input.originalFileName,
    }));
    return { ...input, id: input.id || assetId, source: input.source || 'upload', variants };
}

export function migrateSceneFontsV9<T extends Record<string, any>>(envelope: T): T {
    if (Number(envelope.schemaVersion) >= FONT_ASSETS_SCHEMA_VERSION) return envelope;
    const scene = envelope.scene && typeof envelope.scene === 'object' ? envelope.scene : {};
    const fontAssets = Object.fromEntries(
        Object.entries((scene.fontAssets ?? {}) as Record<string, FontAsset>).map(([id, asset]) => [
            id,
            migrateAsset(id, asset),
        ])
    );
    const migratedScene = migrateFontValues({ ...scene, fontAssets }) as Record<string, any>;
    const macroIds = new Set<string>();
    const channelIds = new Set<string>();
    for (const element of Object.values(scene.elements ?? {}) as any[]) {
        for (const [key, binding] of Object.entries(element?.properties ?? {}) as [string, any][]) {
            if (!/(?:font|fontfamily)$/i.test(key)) continue;
            if (binding?.type === 'macro' && typeof binding.macroId === 'string') macroIds.add(binding.macroId);
            if (binding?.type === 'keyframes' && typeof binding.channelId === 'string')
                channelIds.add(binding.channelId);
        }
    }
    for (const macroId of macroIds) {
        const macro = migratedScene.macros?.macros?.[macroId];
        if (macro && typeof macro.value === 'string') macro.value = normalizeSelection(macro.value);
    }
    for (const channelId of channelIds) {
        const channel = migratedScene.automation?.channels?.[channelId];
        if (!channel || !Array.isArray(channel.keyframes)) continue;
        channel.keyframes = channel.keyframes.map((keyframe: any) => ({
            ...keyframe,
            value: typeof keyframe.value === 'string' ? normalizeSelection(keyframe.value) : keyframe.value,
        }));
    }
    return { ...envelope, schemaVersion: FONT_ASSETS_SCHEMA_VERSION, scene: migratedScene } as T;
}

import type { FontAsset } from '../fonts';
import type { SceneStoreState } from '../storeTypes';

export type FontsAssetsSlice = Pick<
    SceneStoreState,
    'fonts' | 'registerFontAsset' | 'updateFontAsset' | 'deleteFontAsset' | 'acknowledgeFontLicensing'
>;

type SceneStoreSet = (
    partial: Partial<SceneStoreState> | ((state: SceneStoreState) => Partial<SceneStoreState>),
    replace?: boolean
) => void;

function cloneFontAsset(asset: FontAsset): FontAsset {
    return {
        ...asset,
        variants: Array.isArray(asset.variants)
            ? asset.variants.map((variant) => ({
                  ...variant,
                  variationSettings: variant.variationSettings ? { ...variant.variationSettings } : undefined,
              }))
            : [],
    };
}

export function computeFontBytes(assets: Record<string, FontAsset>): number {
    return Object.values(assets).reduce((total, asset) => {
        if (!asset) return total;
        const size = typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : 0;
        return total + size;
    }, 0);
}

export function normalizeFontAssetInput(input: FontAsset, existing?: FontAsset): FontAsset {
    const now = Date.now();
    const normalized = cloneFontAsset({
        ...existing,
        ...input,
        source: input.source ?? existing?.source ?? 'upload',
        createdAt: existing?.createdAt ?? input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
        licensingAcknowledged:
            typeof input.licensingAcknowledged === 'boolean'
                ? input.licensingAcknowledged
                : (existing?.licensingAcknowledged ?? false),
    });
    normalized.variants = normalized.variants.map((variant) => ({
        ...variant,
        binaryId: variant.binaryId || variant.hash || normalized.hash || normalized.id,
        byteLength: variant.byteLength ?? normalized.fileSize,
        hash: variant.hash || normalized.hash,
        originalFileName: variant.originalFileName || normalized.originalFileName,
    }));
    return normalized;
}

function markFontsDirty(state: SceneStoreState): SceneStoreState['runtimeMeta'] {
    return {
        ...state.runtimeMeta,
        lastMutationSource: 'updateFonts',
        lastMutatedAt: Date.now(),
        persistentDirty: true,
    };
}

export function createFontsAssetsSlice(set: SceneStoreSet): FontsAssetsSlice {
    return {
        fonts: { assets: {}, order: [], totalBytes: 0, licensingAcknowledgedAt: undefined },
        registerFontAsset: (asset) => {
            set((state) => {
                if (!asset?.id) throw new Error('SceneStore.registerFontAsset: id is required');
                const existing = state.fonts.assets[asset.id];
                const normalized = normalizeFontAssetInput(asset, existing);
                const nextAssets = { ...state.fonts.assets, [asset.id]: normalized };
                return {
                    fonts: {
                        ...state.fonts,
                        assets: nextAssets,
                        order: [...state.fonts.order.filter((id) => id !== asset.id), asset.id],
                        totalBytes: computeFontBytes(nextAssets),
                    },
                    runtimeMeta: markFontsDirty(state),
                };
            });
        },
        updateFontAsset: (assetId, patch) => {
            set((state) => {
                const existing = state.fonts.assets[assetId];
                if (!existing) return state;
                const merged = normalizeFontAssetInput({ ...existing, ...patch, id: assetId } as FontAsset, existing);
                if (JSON.stringify(existing) === JSON.stringify(merged)) return state;
                const nextAssets = { ...state.fonts.assets, [assetId]: merged };
                return {
                    fonts: { ...state.fonts, assets: nextAssets, totalBytes: computeFontBytes(nextAssets) },
                    runtimeMeta: markFontsDirty(state),
                };
            });
        },
        deleteFontAsset: (assetId) => {
            set((state) => {
                if (!state.fonts.assets[assetId]) return state;
                const nextAssets = { ...state.fonts.assets };
                delete nextAssets[assetId];
                return {
                    fonts: {
                        ...state.fonts,
                        assets: nextAssets,
                        order: state.fonts.order.filter((id) => id !== assetId),
                        totalBytes: computeFontBytes(nextAssets),
                    },
                    runtimeMeta: markFontsDirty(state),
                };
            });
        },
        acknowledgeFontLicensing: (timestamp) => {
            set((state) => {
                const resolved = typeof timestamp === 'number' ? timestamp : Date.now();
                if (state.fonts.licensingAcknowledgedAt === resolved) return state;
                return { fonts: { ...state.fonts, licensingAcknowledgedAt: resolved } };
            });
        },
    };
}

import { create } from 'zustand';

export type VisualAssetType = 'image' | 'gif';

export interface VisualAssetRegistryEntry {
    id: string;
    name: string;
    file: File;
    type: VisualAssetType;
}

interface VisualAssetRegistryStore {
    assets: Record<string, VisualAssetRegistryEntry>;
    assetsOrder: string[];

    addAsset(file: File): string;
    removeAsset(id: string): void;
    renameAsset(id: string, name: string): void;
    _hydrateFromImport(entries: VisualAssetRegistryEntry[]): void;
    _clear(): void;
}

function deriveType(file: File): VisualAssetType {
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) return 'gif';
    return 'image';
}

export const useVisualAssetRegistryStore = create<VisualAssetRegistryStore>((set) => ({
    assets: {},
    assetsOrder: [],

    addAsset(file: File): string {
        const id = crypto.randomUUID();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const entry: VisualAssetRegistryEntry = {
            id,
            name: baseName || file.name,
            file,
            type: deriveType(file),
        };
        set((state) => ({
            assets: { ...state.assets, [id]: entry },
            assetsOrder: [...state.assetsOrder, id],
        }));
        return id;
    },

    removeAsset(id: string): void {
        set((state) => {
            const next = { ...state.assets };
            delete next[id];
            return {
                assets: next,
                assetsOrder: state.assetsOrder.filter((x) => x !== id),
            };
        });
    },

    renameAsset(id: string, name: string): void {
        set((state) => {
            const entry = state.assets[id];
            if (!entry) return state;
            return { assets: { ...state.assets, [id]: { ...entry, name } } };
        });
    },

    _hydrateFromImport(entries: VisualAssetRegistryEntry[]): void {
        const assets: Record<string, VisualAssetRegistryEntry> = {};
        const assetsOrder: string[] = [];
        for (const entry of entries) {
            assets[entry.id] = entry;
            assetsOrder.push(entry.id);
        }
        set({ assets, assetsOrder });
    },

    _clear(): void {
        set({ assets: {}, assetsOrder: [] });
    },
}));

import { create } from 'zustand';

export type VisualAssetType = 'image' | 'gif' | 'sparrow';

export interface VisualAssetRegistryEntry {
    id: string;
    name: string;
    /** File object for user-uploaded assets; blob URL string for bundled plugin assets. */
    file: File | string;
    type: VisualAssetType;
    source: 'user' | 'bundled';
    deletable: boolean;
    /** XML file for Sparrow atlas assets ('sparrow' type only). */
    xmlFile?: File;
}

interface VisualAssetRegistryStore {
    assets: Record<string, VisualAssetRegistryEntry>;
    assetsOrder: string[];

    addAsset(file: File): string;
    addSparrowAsset(pngFile: File, xmlFile: File): string;
    addBundledEntry(id: string, name: string, blobUrl: string, type: VisualAssetType): void;
    removeAsset(id: string): void;
    renameAsset(id: string, name: string): void;
    _hydrateFromImport(entries: Omit<VisualAssetRegistryEntry, 'source' | 'deletable'>[]): void;
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
            source: 'user',
            deletable: true,
        };
        set((state) => ({
            assets: { ...state.assets, [id]: entry },
            assetsOrder: [...state.assetsOrder, id],
        }));
        return id;
    },

    addSparrowAsset(pngFile: File, xmlFile: File): string {
        const id = crypto.randomUUID();
        const baseName = pngFile.name.replace(/\.[^.]+$/, '');
        const entry: VisualAssetRegistryEntry = {
            id,
            name: baseName || pngFile.name,
            file: pngFile,
            type: 'sparrow',
            source: 'user',
            deletable: true,
            xmlFile,
        };
        set((state) => ({
            assets: { ...state.assets, [id]: entry },
            assetsOrder: [...state.assetsOrder, id],
        }));
        return id;
    },

    addBundledEntry(id: string, name: string, blobUrl: string, type: VisualAssetType): void {
        set((state) => {
            if (state.assets[id]) return state;
            const entry: VisualAssetRegistryEntry = {
                id,
                name,
                file: blobUrl,
                type,
                source: 'bundled',
                deletable: false,
            };
            return {
                assets: { ...state.assets, [id]: entry },
                assetsOrder: [...state.assetsOrder, id],
            };
        });
    },

    removeAsset(id: string): void {
        set((state) => {
            const entry = state.assets[id];
            if (!entry?.deletable) return state;
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

    _hydrateFromImport(entries: Omit<VisualAssetRegistryEntry, 'source' | 'deletable'>[]): void {
        const assets: Record<string, VisualAssetRegistryEntry> = {};
        const assetsOrder: string[] = [];
        for (const entry of entries) {
            assets[entry.id] = { source: 'user', deletable: true, ...entry };
            assetsOrder.push(entry.id);
        }
        set({ assets, assetsOrder });
    },

    _clear(): void {
        set({ assets: {}, assetsOrder: [] });
    },
}));

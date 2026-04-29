import { create } from 'zustand';
import type { VisualSourceDescriptor, ImageSource } from '@core/resources/visual-source-descriptor';

export type ProjectAssetType = 'image' | 'gif' | 'sparrow';

export interface ProjectAsset {
    id: string;
    name: string;
    /** File object for user-uploaded assets; blob URL string for bundled plugin assets. */
    file: File | string;
    type: ProjectAssetType;
    source: 'user' | 'bundled';
    deletable: boolean;
    /** XML file for Sparrow atlas assets ('sparrow' type only). File for user-uploaded; blob URL string for bundled. */
    xmlFile?: File | string;
}

interface VisualAssetRegistryStore {
    assets: Record<string, ProjectAsset>;
    assetsOrder: string[];

    addAsset(file: File): string;
    addSparrowAsset(pngFile: File, xmlFile: File): string;
    addBundledEntry(id: string, name: string, blobUrl: string, type: ProjectAssetType): void;
    addBundledSparrowEntry(id: string, name: string, pngBlobUrl: string, xmlBlobUrl: string): void;
    removeAsset(id: string): void;
    renameAsset(id: string, name: string): void;
    _hydrateFromImport(entries: Omit<ProjectAsset, 'source' | 'deletable'>[]): void;
    _clear(): void;
}

function deriveType(file: File): ProjectAssetType {
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) return 'gif';
    return 'image';
}

export const useVisualAssetRegistryStore = create<VisualAssetRegistryStore>((set) => ({
    assets: {},
    assetsOrder: [],

    addAsset(file: File): string {
        const id = crypto.randomUUID();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const entry: ProjectAsset = {
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
        const entry: ProjectAsset = {
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

    addBundledEntry(id: string, name: string, blobUrl: string, type: ProjectAssetType): void {
        set((state) => {
            if (state.assets[id]) return state;
            const entry: ProjectAsset = {
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

    addBundledSparrowEntry(id: string, name: string, pngBlobUrl: string, xmlBlobUrl: string): void {
        set((state) => {
            if (state.assets[id]) return state;
            const entry: ProjectAsset = {
                id,
                name,
                file: pngBlobUrl,
                type: 'sparrow',
                source: 'bundled',
                deletable: false,
                xmlFile: xmlBlobUrl,
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

    _hydrateFromImport(entries: Omit<ProjectAsset, 'source' | 'deletable'>[]): void {
        const assets: Record<string, ProjectAsset> = {};
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

/**
 * Resolve a project asset ID (or legacy File) to a VisualSourceDescriptor.
 *
 * Registry lookup and File/URL resolution live here — outside the resource cache
 * and handle layer — so the loading infrastructure stays independent of the
 * project-level registry.
 *
 * Returns null when the ID is absent, the registry entry is not found, or a
 * Sparrow entry is missing its XML file.
 */
export function resolveProjectAssetDescriptor(
    assetIdOrSource: string | File | null
): VisualSourceDescriptor | null {
    if (!assetIdOrSource) return null;

    // Legacy File passed directly (e.g. pre-registry project import).
    if (assetIdOrSource instanceof File) {
        return { kind: 'image', src: assetIdOrSource };
    }

    const entry = useVisualAssetRegistryStore.getState().assets[assetIdOrSource] ?? null;
    if (!entry) return null;

    if (entry.type === 'sparrow') {
        if (!entry.xmlFile) return null;
        return {
            kind: 'sparrow',
            imageSrc: entry.file as ImageSource,
            xmlSrc: entry.xmlFile as ImageSource,
        };
    }

    return { kind: 'image', src: entry.file as ImageSource };
}

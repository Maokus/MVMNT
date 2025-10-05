import { create } from 'zustand';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useTimelineStore } from './timelineStore';

export interface SceneMetadataState {
    id: string;
    name: string;
    description: string;
    author: string;
    createdAt: string;
    modifiedAt: string;
}

interface SceneMetadataStore {
    metadata: SceneMetadataState;
    setMetadata: (patch: Partial<SceneMetadataState>) => void;
    setName: (name: string) => void;
    setId: (id: string) => void;
    setDescription: (description: string) => void;
    setAuthor: (author: string) => void;
    hydrate: (metadata?: Partial<SceneMetadataState> | null) => void;
    touchModified: () => void;
}

const nowIso = () => new Date().toISOString();

const createDefaultMetadata = (): SceneMetadataState => {
    const now = nowIso();
    return {
        id: 'scene_1',
        name: SceneNameGenerator.generate(),
        description: '',
        author: '',
        createdAt: now,
        modifiedAt: now,
    };
};

const syncTimeline = (patch: Partial<Pick<SceneMetadataState, 'id' | 'name'>>) => {
    if (!patch.id && !patch.name) return;
    useTimelineStore.setState((prev) => ({
        timeline: {
            ...prev.timeline,
            id: patch.id ?? prev.timeline.id,
            name: patch.name ?? prev.timeline.name,
        },
    }));
};

export const useSceneMetadataStore = create<SceneMetadataStore>((set, get) => {
    const initialMetadata = createDefaultMetadata();
    syncTimeline({ id: initialMetadata.id, name: initialMetadata.name });
    return {
        metadata: initialMetadata,
        setMetadata: (patch) => {
            if (!patch || Object.keys(patch).length === 0) return;
            const nextPatch: Partial<SceneMetadataState> = { ...patch };
            if (!patch.modifiedAt) {
                nextPatch.modifiedAt = nowIso();
            }
            if (typeof nextPatch.author === 'string') {
                nextPatch.author = nextPatch.author.trim();
            }
            set((state) => ({ metadata: { ...state.metadata, ...nextPatch } }));
            syncTimeline({ id: patch.id, name: patch.name });
        },
    setName: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        get().setMetadata({ name: trimmed });
    },
    setId: (id) => {
        const trimmed = id.trim();
        if (!trimmed) return;
        get().setMetadata({ id: trimmed });
    },
    setDescription: (description) => {
        get().setMetadata({ description });
    },
    setAuthor: (author) => {
        get().setMetadata({ author });
    },
    hydrate: (metadata) => {
        if (!metadata) return;
        const fallback = get().metadata;
        const hydrated: SceneMetadataState = {
            id: metadata.id?.trim() || fallback.id,
            name: metadata.name?.trim() || fallback.name,
            description: metadata.description ?? fallback.description,
            author: typeof metadata.author === 'string' ? metadata.author.trim() : fallback.author,
            createdAt: metadata.createdAt || fallback.createdAt || nowIso(),
            modifiedAt: metadata.modifiedAt || nowIso(),
        };
        set({ metadata: hydrated });
        syncTimeline({ id: hydrated.id, name: hydrated.name });
    },
    touchModified: () => {
        set((state) => ({ metadata: { ...state.metadata, modifiedAt: nowIso() } }));
    },
    };
});

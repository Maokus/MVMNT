import { createWithEqualityFn } from 'zustand/traditional';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useTimelineStore } from './timelineStore';
import { markDocumentChanged } from './documentRevisionStore';
import { flushProjectTime, resetProjectTimeClock } from './projectTimeTracker';

export interface SceneMetadataState {
    id: string;
    name: string;
    description: string;
    author: string;
    /** "Based on X by Y" set when remixing a template/community scene. Empty for original work. */
    attribution: string;
    createdAt: string;
    modifiedAt: string;
    timeSpentSeconds: number;
}

interface SceneMetadataStore {
    metadata: SceneMetadataState;
    setMetadata: (patch: Partial<SceneMetadataState>) => void;
    setName: (name: string) => void;
    setId: (id: string) => void;
    setDescription: (description: string) => void;
    setAuthor: (author: string) => void;
    setAttribution: (attribution: string) => void;
    hydrate: (metadata?: Partial<SceneMetadataState> | null) => void;
    touchModified: () => void;
    stampNewDocument: () => void;
    addTimeSpentSeconds: (seconds: number) => void;
}

const nowIso = () => new Date().toISOString();

const createDefaultMetadata = (): SceneMetadataState => {
    const now = nowIso();
    return {
        id: 'scene_1',
        name: SceneNameGenerator.generate(),
        description: '',
        author: '',
        attribution: '',
        createdAt: now,
        modifiedAt: now,
        timeSpentSeconds: 0,
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

export const useSceneMetadataStore = createWithEqualityFn<SceneMetadataStore>((set, get) => {
    const initialMetadata = createDefaultMetadata();
    return {
        metadata: initialMetadata,
        setMetadata: (patch) => {
            if (!patch || Object.keys(patch).length === 0) return;
            const nextPatch: Partial<SceneMetadataState> = { ...patch };
            if (typeof nextPatch.author === 'string') {
                nextPatch.author = nextPatch.author.trim();
            }
            const current = get().metadata;
            const changed = Object.entries(nextPatch).some(
                ([key, value]) => current[key as keyof SceneMetadataState] !== value
            );
            if (!changed) return;
            if (!patch.modifiedAt) nextPatch.modifiedAt = nowIso();
            set((state) => ({ metadata: { ...state.metadata, ...nextPatch } }));
            syncTimeline({ id: patch.id, name: patch.name });
            markDocumentChanged('metadata');
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
        setAttribution: (attribution) => {
            get().setMetadata({ attribution });
        },
        hydrate: (metadata) => {
            if (!metadata) return;
            flushProjectTime();
            const fallback = get().metadata;
            const hydrated: SceneMetadataState = {
                id: metadata.id?.trim() || fallback.id,
                name: metadata.name?.trim() || fallback.name,
                description: metadata.description ?? fallback.description,
                author: typeof metadata.author === 'string' ? metadata.author.trim() : fallback.author,
                attribution: typeof metadata.attribution === 'string' ? metadata.attribution : '',
                createdAt: metadata.createdAt || fallback.createdAt || nowIso(),
                modifiedAt: metadata.modifiedAt || nowIso(),
                timeSpentSeconds:
                    typeof metadata.timeSpentSeconds === 'number' &&
                    Number.isFinite(metadata.timeSpentSeconds) &&
                    metadata.timeSpentSeconds >= 0
                        ? metadata.timeSpentSeconds
                        : 0,
            };
            set({ metadata: hydrated });
            syncTimeline({ id: hydrated.id, name: hydrated.name });
            resetProjectTimeClock();
        },
        touchModified: () => {
            set((state) => ({ metadata: { ...state.metadata, modifiedAt: nowIso() } }));
        },
        stampNewDocument: () => {
            flushProjectTime();
            const now = nowIso();
            set((state) => ({ metadata: { ...state.metadata, createdAt: now, modifiedAt: now, timeSpentSeconds: 0 } }));
            resetProjectTimeClock();
            markDocumentChanged('metadata');
        },
        addTimeSpentSeconds: (seconds) => {
            if (!Number.isFinite(seconds) || seconds <= 0) return;
            set((state) => ({
                metadata: {
                    ...state.metadata,
                    timeSpentSeconds: state.metadata.timeSpentSeconds + seconds,
                },
            }));
        },
    };
});

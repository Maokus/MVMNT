import { createWithEqualityFn } from 'zustand/traditional';

export interface DocumentRevisionState {
    revision: number;
    cleanRevision: number;
    lastMutationSource?: string;
    markChanged(source: string): number;
    markClean(): void;
    markDirty(source?: string): number;
    captureRevision(): number;
    reset(): void;
}

/**
 * The single authority for authored-document dirtiness.
 *
 * Runtime, view, preference, and derived-cache changes must not call
 * `markChanged`. Persistent command gateways call it exactly once after a
 * successful semantic commit.
 */
export const useDocumentRevisionStore = createWithEqualityFn<DocumentRevisionState>((set, get) => ({
    revision: 0,
    cleanRevision: 0,
    markChanged: (lastMutationSource) => {
        const revision = get().revision + 1;
        set({ revision, lastMutationSource });
        return revision;
    },
    markClean: () => set((state) => ({ cleanRevision: state.revision })),
    markDirty: (source = 'explicit') => get().markChanged(source),
    captureRevision: () => get().revision,
    reset: () => set({ revision: 0, cleanRevision: 0, lastMutationSource: undefined }),
}));

let suppressionDepth = 0;

export function runWithoutDocumentRevision<TResult>(operation: () => TResult): TResult {
    suppressionDepth += 1;
    try {
        return operation();
    } finally {
        suppressionDepth -= 1;
    }
}

export function markDocumentChanged(source: string): number {
    if (suppressionDepth > 0) return useDocumentRevisionStore.getState().revision;
    return useDocumentRevisionStore.getState().markChanged(source);
}

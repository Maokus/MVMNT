import { createWithEqualityFn } from 'zustand/traditional';
import type { NodeTransform } from '@state/scene-graph';
import { markDocumentChanged as advanceDocumentRevision } from '@state/documentRevisionStore';

export interface PropertyClipboard {
    elementType: string;
    values: Record<string, unknown>;
}

export interface SceneEditorState {
    automationExpandedOwners: string[];
    automationExpandedCurves: string[];
    automationSearchQuery: string;
    expandedPropertyGroups: Record<string, Record<string, boolean>>;
    activePropertyTab: Record<string, string>;
    propertyClipboard: PropertyClipboard | null;
    transientNodeTransforms: Record<string, Partial<NodeTransform>>;
    runtimeRevision: number;
    lastMutationSource?: string;
    hasInitializedScene: boolean;
    lastHydratedAt?: number;
    setAutomationExpandedOwners(ids: string[]): void;
    setAutomationExpandedCurves(ids: string[]): void;
    setAutomationSearchQuery(query: string): void;
    setPropertyGroupCollapseState(ownerId: string, groupId: string, collapsed: boolean): void;
    setActivePropertyTab(ownerId: string, tabId: string): void;
    setPropertyClipboard(clipboard: PropertyClipboard | null): void;
    setTransientNodeTransform(nodeId: string, transform: Partial<NodeTransform>): void;
    clearTransientNodeTransforms(nodeIds?: string[], paths?: Array<keyof NodeTransform>): void;
    markDocumentChanged(source: string): void;
    markHydrated(): void;
    invalidateRuntime(): void;
    resetEditorState(): void;
}

const initialState = () => ({
    automationExpandedOwners: [] as string[],
    automationExpandedCurves: [] as string[],
    automationSearchQuery: '',
    expandedPropertyGroups: {} as Record<string, Record<string, boolean>>,
    activePropertyTab: {} as Record<string, string>,
    propertyClipboard: null as PropertyClipboard | null,
    transientNodeTransforms: {} as Record<string, Partial<NodeTransform>>,
});

export const useSceneEditorStore = createWithEqualityFn<SceneEditorState>((set) => ({
    ...initialState(),
    runtimeRevision: 0,
    hasInitializedScene: false,
    setAutomationExpandedOwners: (automationExpandedOwners) => set({ automationExpandedOwners }),
    setAutomationExpandedCurves: (automationExpandedCurves) => set({ automationExpandedCurves }),
    setAutomationSearchQuery: (automationSearchQuery) => set({ automationSearchQuery }),
    setPropertyGroupCollapseState: (ownerId, groupId, collapsed) =>
        set((state) => ({
            expandedPropertyGroups: {
                ...state.expandedPropertyGroups,
                [ownerId]: { ...(state.expandedPropertyGroups[ownerId] ?? {}), [groupId]: collapsed },
            },
        })),
    setActivePropertyTab: (ownerId, tabId) =>
        set((state) => ({ activePropertyTab: { ...state.activePropertyTab, [ownerId]: tabId } })),
    setPropertyClipboard: (propertyClipboard) => set({ propertyClipboard }),
    setTransientNodeTransform: (nodeId, transform) =>
        set((state) => ({
            transientNodeTransforms: {
                ...state.transientNodeTransforms,
                [nodeId]: { ...state.transientNodeTransforms[nodeId], ...transform },
            },
            runtimeRevision: state.runtimeRevision + 1,
        })),
    clearTransientNodeTransforms: (nodeIds, paths) =>
        set((state) => {
            if (!nodeIds) {
                if (!Object.keys(state.transientNodeTransforms).length) return state;
                return { transientNodeTransforms: {}, runtimeRevision: state.runtimeRevision + 1 };
            }
            const next = { ...state.transientNodeTransforms };
            let changed = false;
            for (const nodeId of nodeIds) {
                const current = next[nodeId];
                if (!current) continue;
                if (!paths?.length) {
                    delete next[nodeId];
                    changed = true;
                    continue;
                }
                const remaining = { ...current };
                for (const path of paths) {
                    if (path in remaining) {
                        delete remaining[path];
                        changed = true;
                    }
                }
                if (Object.keys(remaining).length) next[nodeId] = remaining;
                else delete next[nodeId];
            }
            return changed ? { transientNodeTransforms: next, runtimeRevision: state.runtimeRevision + 1 } : state;
        }),
    markDocumentChanged: (lastMutationSource) => {
        advanceDocumentRevision(lastMutationSource);
        set((state) => ({ runtimeRevision: state.runtimeRevision + 1, lastMutationSource }));
    },
    markHydrated: () =>
        set((state) => ({
            ...initialState(),
            hasInitializedScene: true,
            lastHydratedAt: Date.now(),
            runtimeRevision: state.runtimeRevision + 1,
        })),
    invalidateRuntime: () => set((state) => ({ runtimeRevision: state.runtimeRevision + 1 })),
    resetEditorState: () => set((state) => ({ ...initialState(), runtimeRevision: state.runtimeRevision + 1 })),
}));

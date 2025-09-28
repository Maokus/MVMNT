import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { sceneSelectors } from './selectors';
import { useSceneStore } from '@state/sceneStore';
import type { ElementBindings, SceneInteractionState, SceneStoreState } from '@state/sceneStore';
import type { Macro } from '@state/scene/macros';

export interface SceneElementListItem {
    id: string;
    type: string;
    index: number;
    bindings: ElementBindings;
    visible: boolean;
    zIndex: number;
}

export interface SceneSelectionView {
    ids: string[];
    primaryId: string | null;
    hasSelection: boolean;
}

function resolveVisibility(bindings: ElementBindings): boolean {
    const entry = bindings.visible;
    if (!entry) return true;
    if (entry.type === 'constant') return Boolean(entry.value);
    return true;
}

function resolveZIndex(bindings: ElementBindings, fallbackIndex: number): number {
    const entry = bindings.zIndex;
    if (!entry) return fallbackIndex;
    if (entry.type === 'constant' && typeof entry.value === 'number' && Number.isFinite(entry.value)) {
        return entry.value;
    }
    return fallbackIndex;
}

export function useSceneElements(): SceneElementListItem[] {
    const ordered = useSceneStore(sceneSelectors.selectOrderedElements, shallow);
    return useMemo(() =>
        ordered.map((entry) => ({
            id: entry.id,
            type: entry.type,
            index: entry.index,
            bindings: entry.bindings,
            visible: resolveVisibility(entry.bindings),
            zIndex: resolveZIndex(entry.bindings, entry.index),
        })),
    [ordered]);
}

export function useSceneSelection(): SceneSelectionView {
    return useSceneStore((state) => {
        const ids = state.interaction.selectedElementIds;
        return {
            ids,
            primaryId: ids[0] ?? null,
            hasSelection: ids.length > 0,
        };
    }, shallow);
}

export function useMacroAssignments() {
    return useSceneStore(sceneSelectors.selectMacroAssignments, shallow);
}

function cloneMacroOptions(options?: Macro['options']): Macro['options'] {
    if (!options) return {} as Macro['options'];
    const next: Macro['options'] = { ...options };
    if (Array.isArray(options.selectOptions)) {
        next.selectOptions = options.selectOptions.map((opt) => ({ ...opt }));
    }
    return next;
}

export function useSceneMacros(): Macro[] {
    const macroState = useSceneStore((state) => state.macros, (a, b) => a === b);
    return useMemo(() =>
        macroState.allIds
            .map((id) => macroState.byId[id])
            .filter((macro): macro is Macro => Boolean(macro))
            .map((macro) => ({ ...macro, options: cloneMacroOptions(macro.options) })),
    [macroState]);
}

export function useInteractionState(): SceneInteractionState {
    return useSceneStore((state) => state.interaction, shallow);
}

export function useSceneElementRecord(elementId: string | null) {
    return useSceneStore(
        (state: SceneStoreState) => (elementId ? state.elements[elementId] : undefined),
        (a, b) => a === b,
    );
}

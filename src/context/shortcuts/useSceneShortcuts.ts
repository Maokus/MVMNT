import { useGlobalShortcut, isTextEditingTarget } from './shortcutRegistry';
import type { BindingState, ElementBindings } from '@state/sceneStore';
import type { SceneCommand, SceneCommandOptions } from '@state/scene';
import { useSelectionStore } from '@state/selectionStore';
import { translationMatrix } from '@state/scene-graph';

type OffsetBindingKey = 'offsetX' | 'offsetY';
type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

const ARROW_KEY_TO_OFFSET: Record<ArrowKey, { bindingKey: OffsetBindingKey; delta: number }> = {
    ArrowLeft: { bindingKey: 'offsetX', delta: -1 },
    ArrowRight: { bindingKey: 'offsetX', delta: 1 },
    ArrowUp: { bindingKey: 'offsetY', delta: -1 },
    ArrowDown: { bindingKey: 'offsetY', delta: 1 },
};

function readNumericBinding(binding: BindingState | undefined): number | null {
    return binding?.type === 'constant' && typeof binding.value === 'number' ? binding.value : null;
}

export function isSceneDeletionShortcut(event: Pick<KeyboardEvent, 'key' | 'target'>): boolean {
    return (event.key === 'Backspace' || event.key === 'Delete') && !isTextEditingTarget(event.target);
}

interface UseSceneShortcutsArgs {
    selectedElementId: string | null;
    selectedBindings: ElementBindings;
    deleteSelectedNodes: () => void;
    groupSelectedNodes: () => void;
    ungroupSelectedNodes: () => void;
    updateElementConfig: (
        elementId: string,
        changes: Record<string, unknown>,
        options?: Omit<SceneCommandOptions, 'source'>
    ) => void;
    runSceneCommand: (command: SceneCommand, source: string, options?: Omit<SceneCommandOptions, 'source'>) => boolean;
    invalidateRender?: () => void;
}

/** The single owner for scene-selection keyboard commands. */
export function useSceneShortcuts(args: UseSceneShortcutsArgs): void {
    useGlobalShortcut({
        id: 'scene.selection',
        domain: 'scene',
        matches: (event) => {
            if (event.altKey) return false;
            const selected = useSelectionStore.getState().selectedNodeIds;
            const isModifier = event.metaKey || event.ctrlKey;
            if (isModifier && event.key.toLowerCase() === 'g')
                return selected.length > 0 && !isTextEditingTarget(event.target);
            if (isSceneDeletionShortcut(event)) return selected.length > 0;
            if (event.key === 'Escape') return selected.length > 0 && !isTextEditingTarget(event.target);
            return !isModifier && event.key in ARROW_KEY_TO_OFFSET && !isTextEditingTarget(event.target);
        },
        handle: (event) => {
            const selected = useSelectionStore.getState().selectedNodeIds;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g' && selected.length) {
                event.preventDefault();
                if (event.shiftKey) args.ungroupSelectedNodes();
                else args.groupSelectedNodes();
                return true;
            }
            if (isSceneDeletionShortcut(event) && selected.length) {
                event.preventDefault();
                args.deleteSelectedNodes();
                return true;
            }
            if (event.key === 'Escape' && selected.length) {
                event.preventDefault();
                useSelectionStore.getState().selectSceneNodes([], null);
                return true;
            }
            const mapping = ARROW_KEY_TO_OFFSET[event.key as ArrowKey];
            if (!mapping) return false;
            if (selected.length) {
                event.preventDefault();
                const amount = event.shiftKey ? 10 : 1;
                const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
                const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
                args.runSceneCommand(
                    { type: 'transformNodes', nodeIds: selected, worldDelta: translationMatrix(dx, dy) },
                    'scene-shortcut.nudge-nodes',
                    { mergeKey: `keyboard-node-nudge:${selected.join(',')}` }
                );
                args.invalidateRender?.();
                return true;
            }
            const targetBinding = args.selectedBindings[mapping.bindingKey];
            if (!args.selectedElementId || (targetBinding && targetBinding.type !== 'constant')) return false;
            event.preventDefault();
            args.updateElementConfig(
                args.selectedElementId,
                {
                    [mapping.bindingKey]: {
                        type: 'constant',
                        value: (readNumericBinding(targetBinding) ?? 0) + mapping.delta,
                    },
                },
                { mergeKey: `keyboard-offset:${args.selectedElementId}:${mapping.bindingKey}` }
            );
            return true;
        },
    });
}

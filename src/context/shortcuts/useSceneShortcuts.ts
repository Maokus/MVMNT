import { useGlobalShortcut, isTextEditingTarget, matchesShortcut } from './shortcutRegistry';
import type { BindingState, ElementBindings } from '@state/sceneStore';
import type { SceneCommand, SceneCommandOptions } from '@state/scene';
import { useSelectionStore } from '@state/selectionStore';
import { translationMatrix } from '@state/scene-graph';
import { executeCommand, getCommandState } from '@context/commands/commandRegistry';
import { SCENE_COMMANDS } from '@context/commands/sceneCommands';
import { isCommandSurfaceActive } from '@context/commands/commandContext';

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
            const selection = useSelectionStore.getState();
            if (isTextEditingTarget(event.target)) return false;
            const inSceneEditor = isCommandSurfaceActive(['scene-tree', 'preview'], event);
            if (!inSceneEditor) return false;
            if (isCommandSurfaceActive('scene-tree', event) && matchesShortcut(event, { key: 'a', primary: true })) {
                return getCommandState(SCENE_COMMANDS.selectAll).enabled;
            }
            if (selection.activeTarget !== 'elements') return false;
            if (matchesShortcut(event, { key: 'g', primary: true }))
                return getCommandState(SCENE_COMMANDS.group).enabled;
            if (matchesShortcut(event, { key: 'g', primary: true, shift: true }))
                return getCommandState(SCENE_COMMANDS.ungroup).enabled;
            if (matchesShortcut(event, { key: 'd', primary: true }))
                return getCommandState(SCENE_COMMANDS.duplicate).enabled;
            if (isSceneDeletionShortcut(event)) return getCommandState(SCENE_COMMANDS.delete).enabled;
            if (event.key === 'Escape') return selection.selectedNodeIds.length > 0;
            return (
                isCommandSurfaceActive('preview', event) &&
                !event.metaKey &&
                !event.ctrlKey &&
                event.key in ARROW_KEY_TO_OFFSET
            );
        },
        handle: (event) => {
            const selected = useSelectionStore.getState().selectedNodeIds;
            if (matchesShortcut(event, { key: 'a', primary: true })) {
                event.preventDefault();
                return executeCommand(SCENE_COMMANDS.selectAll);
            }
            if (matchesShortcut(event, { key: 'g', primary: true, shift: true })) {
                event.preventDefault();
                return executeCommand(SCENE_COMMANDS.ungroup);
            }
            if (matchesShortcut(event, { key: 'g', primary: true })) {
                event.preventDefault();
                return executeCommand(SCENE_COMMANDS.group);
            }
            if (matchesShortcut(event, { key: 'd', primary: true })) {
                event.preventDefault();
                return executeCommand(SCENE_COMMANDS.duplicate);
            }
            if (isSceneDeletionShortcut(event) && selected.length) {
                event.preventDefault();
                return executeCommand(SCENE_COMMANDS.delete);
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

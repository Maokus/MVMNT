import {
    createSceneSnapshot,
    migrateLegacyAudioFeatureBinding,
    type BindingState,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneStoreState,
} from '@state/sceneStore';
import { deriveElementOrder } from '@state/scene-graph';
import { channelIdForTarget } from '@automation/types';
import type { SceneCommand } from './commandTypes';

export interface SceneCommandPatch {
    undo: SceneCommand[];
    redo: SceneCommand[];
}

function normalizeBindingValue(value: unknown): BindingState {
    if (value && typeof value === 'object') {
        const payload = value as any;
        if (payload.type === 'macro' && typeof payload.macroId === 'string') {
            return { type: 'macro', macroId: payload.macroId };
        }
        if (payload.type === 'keyframes' && typeof payload.channelId === 'string') {
            return { type: 'keyframes', channelId: payload.channelId };
        }
        if (payload.type === 'constant' && 'value' in payload) {
            return { type: 'constant', value: payload.value };
        }
    }
    return { type: 'constant', value };
}

function buildBindingsPatchFromConfig(patch: Record<string, unknown>): ElementBindingsPatch {
    const next: ElementBindingsPatch = {};
    for (const [property, value] of Object.entries(patch)) {
        if (property === 'featureBinding') {
            const migration = migrateLegacyAudioFeatureBinding(property, value);
            if (migration) {
                for (const cleared of migration.clearedKeys) {
                    next[cleared] = null;
                }
                for (const [replacementKey, binding] of Object.entries(migration.replacements)) {
                    next[replacementKey] = binding;
                }
                continue;
            }
        }
        if (value == null) {
            next[property] = null;
            continue;
        }
        next[property] = normalizeBindingValue(value);
    }
    return next;
}

function bindingEquals(a: BindingState | undefined, b: BindingState | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'constant' && b.type === 'constant') return Object.is(a.value, b.value);
    if (a.type === 'macro' && b.type === 'macro') return a.macroId === b.macroId;
    if (a.type === 'keyframes' && b.type === 'keyframes') return a.channelId === b.channelId;
    return false;
}

function bindingToConfigValue(binding: BindingState | undefined): unknown {
    if (!binding) return null;
    if (binding.type === 'macro') {
        return { type: 'macro', macroId: binding.macroId };
    }
    if (binding.type === 'keyframes') {
        return { type: 'keyframes', channelId: binding.channelId };
    }
    return { type: 'constant', value: binding.value };
}

function captureSceneSnapshot(state: SceneStoreState): SceneImportPayload {
    return createSceneSnapshot(state);
}

function cloneCommand<T extends SceneCommand>(command: T): T {
    return JSON.parse(JSON.stringify(command)) as T;
}

export function buildSceneCommandPatch(state: SceneStoreState, command: SceneCommand): SceneCommandPatch | null {
    switch (command.type) {
        case 'batch': {
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'addElement': {
            if (state.elements[command.elementId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'removeElement': {
            const element = state.elements[command.elementId];
            if (!element) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'updateElementConfig': {
            const existing = state.bindings.byElement[command.elementId];
            if (!existing) return null;
            const undoPatch: Record<string, unknown> = {};
            let changed = false;
            for (const [key, value] of Object.entries(command.patch)) {
                const nextBinding = value == null ? undefined : normalizeBindingValue(value);
                const current = existing[key];
                const isEqual = bindingEquals(current, nextBinding);
                if (isEqual) continue;
                changed = true;
                undoPatch[key] = current ? bindingToConfigValue(current) : null;
            }
            if (!changed) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateElementConfig',
                        elementId: command.elementId,
                        patch: undoPatch,
                    },
                ],
            };
        }
        case 'moveElement': {
            const currentIndex = deriveElementOrder(state.graph).indexOf(command.elementId);
            if (currentIndex === -1) return null;
            if (command.targetIndex === currentIndex) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'duplicateElement': {
            const source = state.elements[command.sourceId];
            if (!source || state.elements[command.newId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'updateElementId': {
            const element = state.elements[command.currentId];
            if (!element || command.currentId === command.nextId) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'clearScene': {
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'registerFontAsset':
        case 'deleteFontAsset': {
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'resetSceneSettings': {
            const previous = { ...state.settings };
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateSceneSettings',
                        patch: previous,
                    },
                ],
            };
        }
        case 'updateSceneSettings': {
            const undoPatch: Record<string, unknown> = {};
            let changed = false;
            for (const [key, value] of Object.entries(command.patch)) {
                const prev = (state.settings as any)[key];
                if (Object.is(prev, value)) continue;
                changed = true;
                undoPatch[key] = prev;
            }
            if (!changed) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateSceneSettings',
                        patch: undoPatch,
                    },
                ],
            };
        }
        case 'loadSerializedScene': {
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'importSubtreeBundle': {
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'createMacro': {
            if (state.macros.byId[command.macroId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'deleteMacro',
                        macroId: command.macroId,
                    },
                ],
            };
        }
        case 'updateMacroValue': {
            const macro = state.macros.byId[command.macroId];
            if (!macro || Object.is(macro.value, command.value)) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateMacroValue',
                        macroId: command.macroId,
                        value: macro.value,
                    },
                ],
            };
        }
        case 'renameMacro': {
            const macro = state.macros.byId[command.currentId];
            if (!macro || command.currentId === command.nextId) return null;
            if (state.macros.byId[command.nextId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'renameMacro',
                        currentId: command.nextId,
                        nextId: command.currentId,
                    },
                ],
            };
        }
        case 'reorderMacros': {
            const previousOrder = state.macros.allIds;
            if (
                previousOrder.length === command.order.length &&
                previousOrder.every((id, i) => id === command.order[i])
            )
                return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'reorderMacros', order: [...previousOrder] }],
            };
        }
        case 'deleteMacro': {
            const macro = state.macros.byId[command.macroId];
            if (!macro) return null;
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'importMacros': {
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'enablePropertyAutomation': {
            const target = command.target;
            if (channelIdForTarget(state.automation, target)) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'disablePropertyAutomation': {
            const target = command.target;
            const channelId = channelIdForTarget(state.automation, target);
            const channel = channelId ? state.automation.channels[channelId] : undefined;
            if (!channel) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        case 'updatePropertyTargetBinding':
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        case 'addKeyframe': {
            const channel = state.automation.channels[command.channelId];
            if (!channel) return null;
            // Check if there's an existing keyframe at this tick that we'd be replacing
            const existing = channel.keyframes.find((kf) => Math.abs(kf.tick - command.keyframe.tick) < 0.5);
            if (existing) {
                // Replacing: undo restores the original keyframe
                return {
                    redo: [cloneCommand(command)],
                    undo: [
                        {
                            type: 'addKeyframe',
                            channelId: command.channelId,
                            keyframe: { ...existing },
                        },
                    ],
                };
            }
            // New keyframe: undo removes it
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'removeKeyframe',
                        channelId: command.channelId,
                        tick: command.keyframe.tick,
                    },
                ],
            };
        }
        case 'removeKeyframe': {
            const channel = state.automation.channels[command.channelId];
            if (!channel) return null;
            const existing = channel.keyframes.find((kf) => Math.abs(kf.tick - command.tick) < 0.5);
            if (!existing) return null;
            // If removing the last keyframe, undo must re-enable the channel
            if (channel.keyframes.length === 1) {
                return {
                    redo: [cloneCommand(command)],
                    undo: [
                        {
                            type: 'enablePropertyAutomation',
                            target: channel.target,
                            valueType: channel.valueType,
                            initialKeyframes: [{ ...existing }],
                        },
                    ],
                };
            }
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'addKeyframe',
                        channelId: command.channelId,
                        keyframe: { ...existing },
                    },
                ],
            };
        }
        case 'updateKeyframe': {
            const channel = state.automation.channels[command.channelId];
            if (!channel) return null;
            const existing = channel.keyframes.find((kf) => Math.abs(kf.tick - command.tick) < 0.5);
            if (!existing) return null;
            const undoPatch: typeof command.patch = {};
            if ('value' in command.patch) undoPatch.value = existing.value;
            if ('segmentInterpolation' in command.patch) undoPatch.segmentInterpolation = existing.segmentInterpolation;
            if ('leftHandle' in command.patch) undoPatch.leftHandle = existing.leftHandle;
            if ('rightHandle' in command.patch) undoPatch.rightHandle = existing.rightHandle;
            if ('leftHandleType' in command.patch) undoPatch.leftHandleType = existing.leftHandleType;
            if ('rightHandleType' in command.patch) undoPatch.rightHandleType = existing.rightHandleType;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateKeyframe',
                        channelId: command.channelId,
                        tick: command.tick,
                        patch: undoPatch,
                    },
                ],
            };
        }
        case 'moveKeyframe': {
            const channel = state.automation.channels[command.channelId];
            if (!channel) return null;
            const existing = channel.keyframes.find((kf) => Math.abs(kf.tick - command.fromTick) < 0.5);
            if (!existing) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'moveKeyframe',
                        channelId: command.channelId,
                        fromTick: command.toTick,
                        toTick: command.fromTick,
                    },
                ],
            };
        }
        case 'batchUpdateKeyframes': {
            const channel = state.automation.channels[command.channelId];
            if (!channel) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'batchUpdateKeyframes',
                        channelId: command.channelId,
                        keyframes: channel.keyframes.map((kf) => ({ ...kf })),
                    },
                ],
            };
        }
        case 'replaceGraph':
        case 'updateNodeTransform':
        case 'setNodeVisibility':
        case 'setNodeOpacity':
        case 'setNodeOutputBlendMode':
        case 'setNodeLocked':
        case 'setNodeName':
        case 'groupNodes':
        case 'ungroupNode':
        case 'deleteSubtrees':
        case 'duplicateSubtrees':
        case 'reorderNodes':
        case 'reparentNodes':
        case 'transformNodes': {
            return {
                redo: [cloneCommand(command)],
                undo: [{ type: 'loadSerializedScene', payload: captureSceneSnapshot(state) }],
            };
        }
        default:
            return null;
    }
}

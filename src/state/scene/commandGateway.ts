import {
    DEFAULT_SCENE_SETTINGS,
    useSceneStore,
    type BindingState,
    type ElementBindings,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneMacroDefinition,
    type SceneSerializedMacros,
    type SceneSettingsState,
    type SceneStoreState,
    migrateLegacyAudioFeatureBinding,
} from '@state/sceneStore';
import { createSceneElementInputFromSchema } from './storeElementFactory';
import { ensureMacroSync, getMacroSnapshot, replaceMacrosFromSnapshot } from './macroSyncService';
import { emitSceneCommandTelemetry } from './sceneTelemetry';
import type { AutomationKeyframe, AutomationValueType } from '@automation/types';
import { createChannel, insertKeyframeSorted, makeChannelId, removeKeyframeAtTick } from '@automation/types';
import { AutomationCurve } from '@automation/automation-curve';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import type { NodeTransform, SceneGraphState } from '@state/scene-graph';
import {
    cloneSceneGraph,
    cloneSubtrees,
    groupSceneNodes,
    removeSubtrees,
    reparentSceneNodes,
    reorderSceneNodes,
    subtreeNodeIds,
    transformSceneNodes,
    ungroupSceneNode,
    type DuplicateMappings,
    type Matrix2D,
} from '@state/scene-graph';

export type SceneCommand =
    | {
          /** A single undoable operation composed of independent scene commands. */
          type: 'batch';
          commands: SceneCommand[];
      }
    | {
          type: 'addElement';
          elementType: string;
          elementId: string;
          config?: Record<string, unknown>;
          targetIndex?: number;
          createdAt?: number;
          createdBy?: string;
      }
    | {
          type: 'removeElement';
          elementId: string;
      }
    | {
          type: 'updateElementConfig';
          elementId: string;
          patch: Record<string, unknown>;
      }
    | {
          type: 'moveElement';
          elementId: string;
          targetIndex: number;
      }
    | {
          type: 'duplicateElement';
          sourceId: string;
          newId: string;
          insertAfter?: boolean;
      }
    | {
          type: 'updateElementId';
          currentId: string;
          nextId: string;
      }
    | {
          type: 'clearScene';
          clearMacros?: boolean;
      }
    | {
          type: 'resetSceneSettings';
      }
    | {
          type: 'updateSceneSettings';
          patch: Record<string, unknown>;
      }
    | {
          type: 'loadSerializedScene';
          payload: SceneImportPayload;
      }
    | {
          type: 'createMacro';
          macroId: string;
          definition: SceneMacroDefinition;
      }
    | {
          type: 'updateMacroValue';
          macroId: string;
          value: unknown;
      }
    | {
          type: 'renameMacro';
          currentId: string;
          nextId: string;
      }
    | {
          type: 'deleteMacro';
          macroId: string;
      }
    | {
          type: 'reorderMacros';
          order: string[];
      }
    | {
          type: 'importMacros';
          payload: SceneSerializedMacros;
      }
    | {
          type: 'enablePropertyAutomation';
          elementId: string;
          propertyKey: string;
          valueType: AutomationValueType;
          /** Optional initial keyframes (e.g. current value at tick 0). */
          initialKeyframes?: AutomationKeyframe[];
      }
    | {
          type: 'disablePropertyAutomation';
          elementId: string;
          propertyKey: string;
          /** Fallback constant value to revert to. */
          fallbackValue?: unknown;
      }
    | {
          type: 'addKeyframe';
          channelId: string;
          keyframe: AutomationKeyframe;
      }
    | {
          type: 'removeKeyframe';
          channelId: string;
          tick: number;
      }
    | {
          type: 'updateKeyframe';
          channelId: string;
          tick: number;
          /** Partial patch — only provided fields are updated. */
          patch: Partial<
              Pick<
                  AutomationKeyframe,
                  'value' | 'segmentInterpolation' | 'leftHandle' | 'rightHandle' | 'leftHandleType' | 'rightHandleType'
              >
          >;
      }
    | {
          type: 'moveKeyframe';
          channelId: string;
          fromTick: number;
          toTick: number;
      }
    | {
          type: 'batchUpdateKeyframes';
          channelId: string;
          keyframes: AutomationKeyframe[];
      }
    | { type: 'replaceGraph'; graph: SceneGraphState; expectedRevision?: number }
    | { type: 'updateNodeTransform'; nodeId: string; transform: Partial<NodeTransform> }
    | { type: 'setNodeVisibility'; nodeId: string; visible: boolean }
    | { type: 'setNodeLocked'; nodeId: string; locked: boolean }
    | { type: 'setNodeName'; nodeId: string; name: string }
    | { type: 'groupNodes'; nodeIds: string[]; groupId: string; name?: string }
    | { type: 'ungroupNode'; nodeId: string }
    | { type: 'deleteSubtrees'; nodeIds: string[] }
    | { type: 'duplicateSubtrees'; nodeIds: string[]; mappings: DuplicateMappings }
    | { type: 'reorderNodes'; parentId: string; nodeIds: string[]; targetIndex: number }
    | { type: 'reparentNodes'; nodeIds: string[]; newParentId: string; targetIndex: number }
    | { type: 'transformNodes'; nodeIds: string[]; worldDelta: Matrix2D };

export interface SceneCommandResult {
    success: boolean;
    durationMs: number;
    command: SceneCommand;
    error?: Error;
    patch?: SceneCommandPatch | null;
}

export interface SceneCommandMergeContext extends SceneCommandResult {
    source: string;
}

export interface SceneCommandOptions {
    /** Human friendly source string for logging / telemetry */
    source?: string;
    /**
     * When provided, allows subsequent commands with the same key to merge into a single undo entry.
     * Useful for continuous gestures such as drag interactions.
     */
    mergeKey?: string;
    /** Marks the undo entry as transient so it can be replaced until finalized. */
    transient?: boolean;
    /** Optional guard to determine whether two telemetry events may merge. */
    canMergeWith?: (other: SceneCommandMergeContext) => boolean;
}

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
    const draft = state.exportSceneDraft();
    return {
        elements: draft.elementsOrder.map((id) => draft.elements[id]).filter(Boolean),
        elementsOrder: draft.elementsOrder,
        graph: draft.graph,
        sceneSettings: draft.sceneSettings,
        macros: draft.macros ?? null,
    };
}

function cloneCommand<T extends SceneCommand>(command: T): T {
    return JSON.parse(JSON.stringify(command)) as T;
}

function buildSceneCommandPatch(state: SceneStoreState, command: SceneCommand): SceneCommandPatch | null {
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
            const currentIndex = state.order.indexOf(command.elementId);
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
            const channelId = makeChannelId(command.elementId, command.propertyKey);
            // Already automated? No-op.
            if (state.automation.channels[channelId]) return null;
            // Capture current binding so undo can restore it
            const currentBinding = state.bindings.byElement[command.elementId]?.[command.propertyKey];
            const fallbackValue =
                currentBinding && currentBinding.type === 'constant' ? currentBinding.value : undefined;
            const undoCommands: SceneCommand[] = [
                {
                    type: 'disablePropertyAutomation',
                    elementId: command.elementId,
                    propertyKey: command.propertyKey,
                    fallbackValue,
                },
            ];
            // If the property was macro-bound, restore the macro binding after disabling automation
            if (currentBinding && currentBinding.type === 'macro') {
                undoCommands.push({
                    type: 'updateElementConfig',
                    elementId: command.elementId,
                    patch: { [command.propertyKey]: { type: 'macro', macroId: currentBinding.macroId } },
                });
            }
            return {
                redo: [cloneCommand(command)],
                undo: undoCommands,
            };
        }
        case 'disablePropertyAutomation': {
            const channelId = makeChannelId(command.elementId, command.propertyKey);
            const channel = state.automation.channels[channelId];
            if (!channel) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'enablePropertyAutomation',
                        elementId: command.elementId,
                        propertyKey: command.propertyKey,
                        valueType: channel.valueType,
                        initialKeyframes: channel.keyframes.map((kf) => ({ ...kf })),
                    },
                ],
            };
        }
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
                            elementId: channel.elementId,
                            propertyKey: channel.propertyKey,
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

function readConstantNumber(binding: BindingState | undefined): number | null {
    if (!binding || binding.type !== 'constant') return null;
    const value = typeof binding.value === 'number' ? binding.value : Number(binding.value);
    return Number.isFinite(value) ? value : null;
}

function maybeCenterAxis(
    axis: 'X' | 'Y',
    options: {
        config?: Record<string, unknown>;
        bindings: ElementBindings;
        sceneSize: number | undefined;
    }
): void {
    const { config = {}, bindings, sceneSize } = options;
    if (!Number.isFinite(sceneSize) || sceneSize == null) return;
    const offsetKey = `offset${axis}` as const;
    const anchorKey = `anchor${axis}` as const;
    if (Object.prototype.hasOwnProperty.call(config, offsetKey)) return;
    const offsetBinding = bindings[offsetKey];
    if (offsetBinding?.type === 'macro') return;
    const currentOffset = readConstantNumber(offsetBinding) ?? 0;
    if (currentOffset !== 0) return;
    const anchorBinding = bindings[anchorKey];
    const anchor = readConstantNumber(anchorBinding);
    const anchorValue = anchor == null ? 0.5 : anchor;
    if (Math.abs(anchorValue - 0.5) > 1e-4) return;
    bindings[offsetKey] = { type: 'constant', value: sceneSize / 2 };
}

function applyStoreCommand(store: SceneStoreState, command: SceneCommand) {
    switch (command.type) {
        case 'batch':
            command.commands.forEach((child) => applyStoreCommand(store, child));
            break;
        case 'addElement': {
            const input = createSceneElementInputFromSchema({
                id: command.elementId,
                type: command.elementType,
                config: command.config ?? {},
                index: command.targetIndex,
                createdAt: command.createdAt,
                createdBy: command.createdBy ?? command.elementType,
            });
            const bindings = { ...(input.bindings ?? {}) } as ElementBindings;
            const settings = store.settings;
            maybeCenterAxis('X', { config: command.config, bindings, sceneSize: settings.width });
            maybeCenterAxis('Y', { config: command.config, bindings, sceneSize: settings.height });
            store.addElement({ ...input, bindings });
            break;
        }
        case 'removeElement':
            store.removeElement(command.elementId);
            break;
        case 'updateElementConfig': {
            const patch = buildBindingsPatchFromConfig(command.patch);
            store.updateBindings(command.elementId, patch);
            break;
        }
        case 'moveElement':
            store.moveElement(command.elementId, command.targetIndex);
            break;
        case 'duplicateElement':
            store.duplicateElement(command.sourceId, command.newId, { insertAfter: command.insertAfter ?? true });
            break;
        case 'updateElementId':
            store.updateElementId(command.currentId, command.nextId);
            break;
        case 'clearScene': {
            const previousMacros = command.clearMacros === false ? (getMacroSnapshot() ?? undefined) : undefined;
            store.clearScene();
            useVisualAssetRegistryStore.getState()._clear();
            if (command.clearMacros === false && previousMacros) {
                store.replaceMacros(previousMacros);
            }
            useSceneMetadataStore.getState().setName(SceneNameGenerator.generate());
            useTimelineStore.setState({ playbackRange: undefined, playbackRangeUserDefined: false });
            break;
        }
        case 'resetSceneSettings':
            store.updateSettings(DEFAULT_SCENE_SETTINGS);
            break;
        case 'updateSceneSettings':
            store.updateSettings(command.patch as Partial<SceneSettingsState>);
            break;
        case 'loadSerializedScene':
            store.importScene(command.payload);
            break;
        case 'createMacro':
            store.createMacro(command.macroId, command.definition);
            break;
        case 'updateMacroValue':
            store.updateMacroValue(command.macroId, command.value);
            break;
        case 'renameMacro':
            store.renameMacro(command.currentId, command.nextId);
            break;
        case 'deleteMacro':
            store.deleteMacro(command.macroId);
            break;
        case 'reorderMacros':
            store.reorderMacros(command.order);
            break;
        case 'importMacros':
            replaceMacrosFromSnapshot(command.payload);
            break;
        case 'enablePropertyAutomation': {
            const channelId = makeChannelId(command.elementId, command.propertyKey);
            const channel = createChannel(command.elementId, command.propertyKey, command.valueType);
            if (command.initialKeyframes?.length) {
                channel.keyframes = [...command.initialKeyframes];
            }
            store.setAutomationChannel(channel);
            // Switch binding to keyframes
            store.updateBindings(command.elementId, {
                [command.propertyKey]: { type: 'keyframes', channelId },
            });
            break;
        }
        case 'disablePropertyAutomation': {
            const channelId = makeChannelId(command.elementId, command.propertyKey);
            // Resolve fallback: explicit value, or evaluate channel at current tick, or 0
            let fallback: unknown = command.fallbackValue;
            if (fallback === undefined) {
                const channel = store.automation.channels[channelId];
                if (channel && channel.keyframes.length > 0) {
                    // Evaluate at current playhead tick so value "freezes" at what user sees
                    try {
                        const currentTick = useTimelineStore.getState().timeline.currentTick;
                        const curve = new AutomationCurve(channel);
                        fallback = curve.evaluate(currentTick);
                    } catch {
                        fallback = channel.keyframes[0].value;
                    }
                } else {
                    fallback = 0;
                }
            }
            store.removeAutomationChannel(channelId);
            store.updateBindings(command.elementId, {
                [command.propertyKey]: { type: 'constant', value: fallback },
            });
            break;
        }
        case 'addKeyframe': {
            const channel = store.automation.channels[command.channelId];
            if (!channel) break;
            const nextKeyframes = insertKeyframeSorted(channel.keyframes, command.keyframe);
            store.updateAutomationKeyframes(command.channelId, nextKeyframes);
            break;
        }
        case 'removeKeyframe': {
            const channel = store.automation.channels[command.channelId];
            if (!channel) break;
            const nextKeyframes = removeKeyframeAtTick(channel.keyframes, command.tick);
            if (nextKeyframes.length === 0) {
                // Last keyframe removed — auto-disable the channel
                const removed = channel.keyframes.find((kf) => Math.abs(kf.tick - command.tick) < 0.5);
                const fallback: unknown = removed?.value ?? 0;
                store.removeAutomationChannel(command.channelId);
                store.updateBindings(channel.elementId, {
                    [channel.propertyKey]: { type: 'constant', value: fallback },
                });
            } else {
                store.updateAutomationKeyframes(command.channelId, nextKeyframes);
            }
            break;
        }
        case 'updateKeyframe': {
            const channel = store.automation.channels[command.channelId];
            if (!channel) break;
            const nextKeyframes = channel.keyframes.map((kf) => {
                if (Math.abs(kf.tick - command.tick) < 0.5) {
                    return { ...kf, ...command.patch };
                }
                return kf;
            });
            store.updateAutomationKeyframes(command.channelId, nextKeyframes);
            break;
        }
        case 'moveKeyframe': {
            const channel = store.automation.channels[command.channelId];
            if (!channel) break;
            const moving = channel.keyframes.find((kf) => Math.abs(kf.tick - command.fromTick) < 0.5);
            if (!moving) break;
            const withoutOld = removeKeyframeAtTick(channel.keyframes, command.fromTick);
            const movedKf: AutomationKeyframe = { ...moving, tick: command.toTick };
            const nextKeyframes = insertKeyframeSorted(withoutOld, movedKf);
            store.updateAutomationKeyframes(command.channelId, nextKeyframes);
            break;
        }
        case 'batchUpdateKeyframes': {
            store.updateAutomationKeyframes(command.channelId, command.keyframes);
            break;
        }
        case 'replaceGraph':
            if (command.expectedRevision != null && store.graph.revision !== command.expectedRevision) {
                throw new Error(
                    `Scene command revision conflict: expected ${command.expectedRevision}, received ${store.graph.revision}`
                );
            }
            store.replaceGraph(command.graph);
            break;
        case 'updateNodeTransform':
            store.updateNodeTransform(command.nodeId, command.transform);
            break;
        case 'setNodeVisibility':
            store.setNodeVisibility(command.nodeId, command.visible);
            break;
        case 'setNodeLocked':
            store.setNodeLocked(command.nodeId, command.locked);
            break;
        case 'setNodeName':
            store.setNodeName(command.nodeId, command.name);
            break;
        case 'groupNodes':
            store.replaceGraph(groupSceneNodes(store.graph, command.nodeIds, command.groupId, command.name));
            break;
        case 'ungroupNode':
            store.replaceGraph(ungroupSceneNode(store.graph, command.nodeId));
            break;
        case 'reorderNodes':
            store.replaceGraph(reorderSceneNodes(store.graph, command.parentId, command.nodeIds, command.targetIndex));
            break;
        case 'reparentNodes':
            store.replaceGraph(
                reparentSceneNodes(store.graph, command.nodeIds, command.newParentId, command.targetIndex)
            );
            break;
        case 'transformNodes':
            store.replaceGraph(transformSceneNodes(store.graph, command.nodeIds, command.worldDelta));
            break;
        case 'deleteSubtrees': {
            const graph = store.graph;
            const removedIds = new Set(subtreeNodeIds(graph, command.nodeIds));
            const elementIds = [...removedIds]
                .map((id) => graph.nodesById[id])
                .filter((node): node is Extract<typeof node, { kind: 'element' }> => node?.kind === 'element')
                .map((node) => node.elementId);
            const nextGraph = removeSubtrees(graph, command.nodeIds);
            for (const elementId of elementIds) useSceneStore.getState().removeElement(elementId);
            useSceneStore.getState().replaceGraph(nextGraph);
            break;
        }
        case 'duplicateSubtrees': {
            for (const [sourceElementId, newElementId] of Object.entries(command.mappings.elementIdMap)) {
                useSceneStore.getState().duplicateElement(sourceElementId, newElementId);
            }
            const current = useSceneStore.getState();
            const base = cloneSceneGraph(current.graph);
            for (const newElementId of Object.values(command.mappings.elementIdMap)) {
                const generatedNodeId = current.nodeIdByElementId[newElementId];
                const generated = generatedNodeId ? base.nodesById[generatedNodeId] : undefined;
                if (generated?.parentId) {
                    const parent = base.nodesById[generated.parentId];
                    if (parent && 'children' in parent) {
                        parent.children = parent.children.filter((id) => id !== generatedNodeId);
                    }
                    delete base.nodesById[generatedNodeId];
                }
            }
            current.replaceGraph(cloneSubtrees(base, command.nodeIds, command.mappings));
            break;
        }
        default:
            break;
    }
}

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function requiresRollbackSnapshot(command: SceneCommand): boolean {
    return [
        'batch',
        'replaceGraph',
        'groupNodes',
        'ungroupNode',
        'deleteSubtrees',
        'duplicateSubtrees',
        'reorderNodes',
        'reparentNodes',
        'transformNodes',
    ].includes(command.type);
}

export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult {
    const start = now();
    ensureMacroSync();
    const store = useSceneStore.getState();
    const snapshotBefore = requiresRollbackSnapshot(command) ? captureSceneSnapshot(store) : null;
    const patch = buildSceneCommandPatch(store, command);

    let result: SceneCommandResult;
    try {
        applyStoreCommand(store, command);
        result = {
            success: true,
            durationMs: now() - start,
            command,
            patch,
        };
    } catch (error) {
        if (snapshotBefore) {
            try {
                useSceneStore.getState().importScene(snapshotBefore);
            } catch {}
        }
        const err = error instanceof Error ? error : new Error(String(error));
        result = {
            success: false,
            durationMs: now() - start,
            command,
            error: err,
            patch: null,
        };
    }
    emitSceneCommandTelemetry(result, options);
    return result;
}

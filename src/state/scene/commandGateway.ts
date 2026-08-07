import {
    DEFAULT_SCENE_SETTINGS,
    useSceneStore,
    type BindingState,
    type ElementBindings,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneSettingsState,
    type SceneStoreState,
    migrateLegacyAudioFeatureBinding,
} from '@state/sceneStore';
import { deriveElementOrder } from '@state/scene-graph';
import { createSceneElementInputFromSchema } from './storeElementFactory';
import { ensureMacroSync, getMacroSnapshot, replaceMacrosFromSnapshot } from './macroSyncService';
import { emitSceneCommandTelemetry } from './sceneTelemetry';
import type { AutomationKeyframe, AutomationValueType, PropertyTarget } from '@automation/types';
import {
    channelIdForTarget,
    createChannel,
    elementPropertyTarget,
    insertKeyframeSorted,
    removeKeyframeAtTick,
} from '@automation/types';
import { AutomationCurve } from '@automation/automation-curve';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import type { NodeTransform } from '@state/scene-graph';
import { buildSceneSubtreeImport } from './subtreeBundle';
import { sceneCommandDefinition } from './commandDefinitions';
import type { SceneCommand } from './commandTypes';
import { applySceneGraphCommand } from './sceneGraphCommands';
export type { SceneCommand } from './commandTypes';

export interface SceneCommandResult {
    success: boolean;
    durationMs: number;
    command: SceneCommand;
    error?: Error;
    patch?: SceneCommandPatch | null;
}

function targetBinding(state: SceneStoreState, target: PropertyTarget): BindingState | undefined {
    return target.owner.kind === 'element'
        ? state.bindings.byElement[target.owner.id]?.[target.propertyPath]
        : state.nodeBindings[target.owner.id]?.[target.propertyPath];
}

function updateTargetBinding(store: SceneStoreState, target: PropertyTarget, binding: BindingState | null): void {
    if (target.owner.kind === 'element') {
        store.updateBindings(target.owner.id, { [target.propertyPath]: binding });
    } else {
        store.updateNodeBindings(target.owner.id, { [target.propertyPath]: binding });
    }
}

function staticNodeProperty(state: SceneStoreState, target: PropertyTarget): unknown {
    if (target.owner.kind !== 'node') return undefined;
    const node = state.graph.nodesById[target.owner.id];
    if (!node) return undefined;
    if (target.propertyPath === 'localVisible') return node.localVisible;
    if (target.propertyPath === 'localLocked') return node.localLocked;
    if (target.propertyPath === 'localOpacity') return node.localOpacity;
    return node.userNodeTransform[target.propertyPath as keyof NodeTransform];
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
    return state.exportSceneDraft();
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

function extractNodeAxis(
    axis: 'X' | 'Y',
    options: {
        config?: Record<string, unknown>;
        bindings: ElementBindings;
        sceneSize: number | undefined;
    }
): { value: number; binding?: BindingState } {
    const { config = {}, bindings, sceneSize } = options;
    const fallback = Number.isFinite(sceneSize) && sceneSize != null ? sceneSize / 2 : 0;
    const offsetKey = `offset${axis}` as const;
    const anchorKey = `anchor${axis}` as const;
    const configuredOffset = config[offsetKey];
    const offsetBinding =
        configuredOffset &&
        typeof configuredOffset === 'object' &&
        ['constant', 'macro', 'keyframes'].includes((configuredOffset as BindingState).type)
            ? (configuredOffset as BindingState)
            : bindings[offsetKey];
    delete bindings[offsetKey];
    if (offsetBinding && offsetBinding.type !== 'constant') {
        return { value: 0, binding: offsetBinding };
    }
    const rawConfiguredOffset = typeof configuredOffset === 'number' ? configuredOffset : undefined;
    const currentOffset = rawConfiguredOffset ?? readConstantNumber(offsetBinding) ?? 0;
    if (Object.prototype.hasOwnProperty.call(config, offsetKey) || currentOffset !== 0) {
        return { value: currentOffset };
    }
    const anchorBinding = bindings[anchorKey];
    const anchor = readConstantNumber(anchorBinding);
    const anchorValue = anchor == null ? 0.5 : anchor;
    return { value: Math.abs(anchorValue - 0.5) <= 1e-4 ? fallback : 0 };
}

function applyStoreCommand(store: SceneStoreState, command: SceneCommand) {
    if (applySceneGraphCommand(store, command)) return;

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
            const x = extractNodeAxis('X', { config: command.config, bindings, sceneSize: settings.width });
            const y = extractNodeAxis('Y', { config: command.config, bindings, sceneSize: settings.height });
            store.addElement({ ...input, bindings });
            const current = useSceneStore.getState();
            const nodeId = current.nodeIdByElementId[command.elementId];
            if (nodeId) {
                if (x.value !== 0 || y.value !== 0) {
                    current.updateNodeTransform(nodeId, { translationX: x.value, translationY: y.value });
                }
                const nodeBindingPatch: ElementBindingsPatch = {};
                if (x.binding) nodeBindingPatch.translationX = x.binding;
                if (y.binding) nodeBindingPatch.translationY = y.binding;
                if (Object.keys(nodeBindingPatch).length) current.updateNodeBindings(nodeId, nodeBindingPatch);
            }
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
        case 'importSubtreeBundle': {
            const { payload } = buildSceneSubtreeImport(store, command.bundle, {
                parentId: command.parentId,
                targetIndex: command.targetIndex,
            });
            store.importScene(payload);
            break;
        }
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
            const target = command.target;
            if (channelIdForTarget(store.automation, target)) break;
            const channel = createChannel(target, command.valueType, new Set(Object.keys(store.automation.channels)));
            if (command.initialKeyframes?.length) {
                channel.keyframes = [...command.initialKeyframes];
            }
            store.setAutomationChannel(channel);
            updateTargetBinding(useSceneStore.getState(), target, { type: 'keyframes', channelId: channel.id });
            break;
        }
        case 'disablePropertyAutomation': {
            const target = command.target;
            const channelId = channelIdForTarget(store.automation, target);
            if (!channelId) break;
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
                    const binding = targetBinding(store, target);
                    fallback =
                        binding?.type === 'constant'
                            ? binding.value
                            : binding?.type === 'macro'
                              ? store.macros.byId[binding.macroId]?.value
                              : staticNodeProperty(store, target);
                    if (fallback === undefined) fallback = 0;
                }
            }
            store.removeAutomationChannel(channelId);
            updateTargetBinding(useSceneStore.getState(), target, { type: 'constant', value: fallback });
            break;
        }
        case 'updatePropertyTargetBinding':
            updateTargetBinding(store, command.target, command.binding);
            break;
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
                updateTargetBinding(useSceneStore.getState(), channel.target, { type: 'constant', value: fallback });
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
        default:
            break;
    }
}

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult {
    const start = now();
    ensureMacroSync();
    const store = useSceneStore.getState();
    const definition = sceneCommandDefinition(command);
    const snapshotBefore = definition.rollback === 'inverse-patch' ? null : captureSceneSnapshot(store);
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

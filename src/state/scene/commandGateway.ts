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
import type {
    AutomationChannel,
    AutomationInterpolation,
    AutomationKeyframe,
    AutomationValueType,
} from '@automation/types';
import {
    createChannel,
    insertKeyframeSorted,
    makeChannelId,
    removeKeyframeAtTick,
} from '@automation/types';

export type SceneCommand =
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
          type: 'importMacros';
          payload: SceneSerializedMacros;
      }
    | {
          type: 'enablePropertyAutomation';
          elementId: string;
          propertyKey: string;
          valueType: AutomationValueType;
          interpolation?: AutomationInterpolation;
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
          patch: Partial<Pick<AutomationKeyframe, 'value' | 'easingId' | 'segmentInterpolation' | 'leftHandle' | 'rightHandle' | 'leftHandleType' | 'rightHandleType'>>;
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
      };

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

function buildConfigFromBindings(bindings: ElementBindings): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const [key, binding] of Object.entries(bindings)) {
        config[key] = bindingToConfigValue(binding);
    }
    return config;
}

function captureSceneSnapshot(state: SceneStoreState): SceneImportPayload {
    const draft = state.exportSceneDraft();
    return {
        elements: draft.elements,
        sceneSettings: draft.sceneSettings,
        macros: draft.macros ?? null,
    };
}

function cloneCommand<T extends SceneCommand>(command: T): T {
    return JSON.parse(JSON.stringify(command)) as T;
}

function buildSceneCommandPatch(state: SceneStoreState, command: SceneCommand): SceneCommandPatch | null {
    switch (command.type) {
        case 'addElement': {
            if (state.elements[command.elementId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'removeElement',
                        elementId: command.elementId,
                    },
                ],
            };
        }
        case 'removeElement': {
            const element = state.elements[command.elementId];
            if (!element) return null;
            const bindings = state.bindings.byElement[command.elementId] ?? {};
            const index = state.order.indexOf(command.elementId);
            const config = buildConfigFromBindings(bindings);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'addElement',
                        elementType: element.type,
                        elementId: element.id,
                        config,
                        targetIndex: index,
                        createdAt: element.createdAt,
                        createdBy: element.createdBy,
                    },
                ],
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
                undo: [
                    {
                        type: 'moveElement',
                        elementId: command.elementId,
                        targetIndex: currentIndex,
                    },
                ],
            };
        }
        case 'duplicateElement': {
            const source = state.elements[command.sourceId];
            if (!source || state.elements[command.newId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'removeElement',
                        elementId: command.newId,
                    },
                ],
            };
        }
        case 'updateElementId': {
            const element = state.elements[command.currentId];
            if (!element || command.currentId === command.nextId) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateElementId',
                        currentId: command.nextId,
                        nextId: command.currentId,
                    },
                ],
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
            const fallbackValue = currentBinding && currentBinding.type === 'constant' ? currentBinding.value : undefined;
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
                        interpolation: channel.interpolation,
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
            if ('easingId' in command.patch) undoPatch.easingId = existing.easingId;
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
            const previousMacros = command.clearMacros === false ? getMacroSnapshot() ?? undefined : undefined;
            store.clearScene();
            if (command.clearMacros === false && previousMacros) {
                store.replaceMacros(previousMacros);
            }
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
        case 'importMacros':
            replaceMacrosFromSnapshot(command.payload);
            break;
        case 'enablePropertyAutomation': {
            const channelId = makeChannelId(command.elementId, command.propertyKey);
            const channel = createChannel(
                command.elementId,
                command.propertyKey,
                command.valueType,
                command.interpolation ?? 'eased',
            );
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
                        const { useTimelineStore } = require('@state/timelineStore');
                        const currentTick = useTimelineStore.getState().timeline.currentTick;
                        const { AutomationCurve } = require('@automation/automation-curve');
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
            store.updateAutomationKeyframes(command.channelId, nextKeyframes);
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

import {
    DEFAULT_SCENE_SETTINGS,
    migrateLegacyAudioFeatureBinding,
    useSceneStore,
    type BindingState,
    type ElementBindings,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneSettingsState,
    type SceneStoreState,
} from '@state/sceneStore';
import type { AutomationKeyframe, PropertyTarget } from '@automation/types';
import { channelIdForTarget, createChannel, insertKeyframeSorted, removeKeyframeAtTick } from '@automation/types';
import { AutomationCurve } from '@automation/automation-curve';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import type { NodeTransform } from '@state/scene-graph';
import { createSceneElementInputFromSchema } from './storeElementFactory';
import { getMacroSnapshot, replaceMacrosFromSnapshot } from './macroSyncService';
import { buildSceneSubtreeImport } from './subtreeBundle';
import type { SceneCommand } from './commandTypes';
import { applySceneGraphCommand } from './sceneGraphCommands';
import { resolveMissingFontTokens } from './fonts';
import { createSceneSnapshot } from './snapshot';

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
    if (target.propertyPath === 'outputBlendMode' && node.kind === 'element') return node.outputBlendMode;
    return node.userNodeTransform[target.propertyPath as keyof NodeTransform];
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

export function applySceneStoreCommand(
    store: SceneStoreState,
    command: SceneCommand,
    getState: () => SceneStoreState = () => useSceneStore.getState()
) {
    if (applySceneGraphCommand(store, command, getState)) return;

    switch (command.type) {
        case 'batch':
            command.commands.forEach((child) => applySceneStoreCommand(getState(), child, getState));
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
            const current = getState();
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
        case 'restoreClearScene': {
            store.importScene(command.snapshot.scene);
            useSceneMetadataStore.getState().hydrate(command.snapshot.metadata);
            useTimelineStore.setState({
                playbackRange: command.snapshot.timeline.playbackRange,
                playbackRangeUserDefined: command.snapshot.timeline.playbackRangeUserDefined,
            });
            useVisualAssetRegistryStore.setState({
                assets: { ...command.snapshot.assets.assets },
                assetsOrder: [...command.snapshot.assets.assetsOrder],
            });
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
        case 'registerFontAsset':
            store.registerFontAsset(command.asset);
            break;
        case 'resolveMissingFontTokens': {
            const snapshot = createSceneSnapshot(getState());
            const resolved = resolveMissingFontTokens(snapshot, command.asset);
            if (resolved !== snapshot) store.importScene(resolved as SceneImportPayload);
            break;
        }
        case 'deleteFontAsset':
            store.deleteFontAsset(command.assetId);
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
            updateTargetBinding(getState(), target, { type: 'keyframes', channelId: channel.id });
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
            updateTargetBinding(getState(), target, { type: 'constant', value: fallback });
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
                updateTargetBinding(getState(), channel.target, { type: 'constant', value: fallback });
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

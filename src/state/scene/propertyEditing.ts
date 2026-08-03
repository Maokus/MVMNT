import {
    channelForTarget,
    createKeyframe,
    encodePropertyTarget,
    findKeyframeAtTick,
    type AutomationValueType,
    type PropertyTarget,
} from '@automation/types';
import { useSceneStore, type BindingState, type SceneStoreState } from '@state/sceneStore';
import { dispatchSceneCommand, type SceneCommand, type SceneCommandOptions } from './commandGateway';
import { resolveBindingStateValue } from '@bindings/resolve-binding-state';

export interface PropertyEdit {
    target: PropertyTarget;
    value: unknown;
    valueType: AutomationValueType | null;
    automatable?: boolean;
}

export interface PropertyEditContext {
    tick: number;
    autoKey: boolean;
    source: string;
    mergeKey?: string;
    transient?: boolean;
}

export function bindingForTarget(state: SceneStoreState, target: PropertyTarget): BindingState | undefined {
    return target.owner.kind === 'element'
        ? state.bindings.byElement[target.owner.id]?.[target.propertyPath]
        : state.nodeBindings[target.owner.id]?.[target.propertyPath];
}

export function authoredValueForTarget(state: SceneStoreState, target: PropertyTarget): unknown {
    const binding = bindingForTarget(state, target);
    if (binding?.type === 'constant') return binding.value;
    if (target.owner.kind === 'element') return undefined;
    const node = state.graph.nodesById[target.owner.id];
    if (!node) return undefined;
    if (target.propertyPath === 'localVisible') return node.localVisible;
    if (target.propertyPath === 'localLocked') return node.localLocked;
    if (target.propertyPath === 'localOpacity') return node.localOpacity;
    return node.userNodeTransform[target.propertyPath as keyof typeof node.userNodeTransform];
}

export function effectiveValueForTarget(state: SceneStoreState, target: PropertyTarget, tick: number): unknown {
    if (target.owner.kind === 'node') {
        const preview =
            state.transientNodeTransforms[target.owner.id]?.[
                target.propertyPath as keyof (typeof state.transientNodeTransforms)[string]
            ];
        if (typeof preview === 'number') return preview;
    }
    const binding = bindingForTarget(state, target);
    if (!binding) return authoredValueForTarget(state, target);
    return resolveBindingStateValue(binding, {
        tick,
        macroValue: (macroId) => state.macros.byId[macroId]?.value,
    });
}

function staticCommand(edit: PropertyEdit, binding: BindingState | undefined): SceneCommand | null {
    const { target, value } = edit;
    if (binding) {
        return { type: 'updatePropertyTargetBinding', target, binding: { type: 'constant', value } };
    }
    if (target.owner.kind === 'element') {
        return { type: 'updateElementConfig', elementId: target.owner.id, patch: { [target.propertyPath]: value } };
    }
    if (target.propertyPath === 'localVisible') {
        return { type: 'setNodeVisibility', nodeId: target.owner.id, visible: Boolean(value) };
    }
    if (target.propertyPath === 'localLocked') {
        return { type: 'setNodeLocked', nodeId: target.owner.id, locked: Boolean(value) };
    }
    if (target.propertyPath === 'localOpacity') {
        return { type: 'setNodeOpacity', nodeId: target.owner.id, opacity: Number(value) };
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return {
        type: 'updateNodeTransform',
        nodeId: target.owner.id,
        transform: { [target.propertyPath]: value },
    };
}

/**
 * Creates the canonical edit commands for both host and element properties.
 * Once a property is automated, editing it always writes the playhead key. Auto-key only
 * decides whether an unanimated property should become animated.
 */
export function buildPropertyEditCommands(
    state: SceneStoreState,
    edits: readonly PropertyEdit[],
    context: Pick<PropertyEditContext, 'tick' | 'autoKey'>
): SceneCommand[] {
    const commands: SceneCommand[] = [];
    for (const edit of edits) {
        const binding = bindingForTarget(state, edit.target);
        const channel = channelForTarget(state.automation, edit.target);
        if (binding?.type === 'keyframes' && channel) {
            const existing = findKeyframeAtTick(channel.keyframes, context.tick);
            commands.push({
                type: 'addKeyframe',
                channelId: channel.id,
                keyframe: existing
                    ? { ...existing, tick: context.tick, value: edit.value }
                    : createKeyframe(context.tick, edit.value),
            });
            continue;
        }
        if (context.autoKey && edit.automatable !== false && edit.valueType) {
            commands.push({
                type: 'enablePropertyAutomation',
                target: edit.target,
                valueType: edit.valueType,
                initialKeyframes: [createKeyframe(context.tick, edit.value)],
            });
            continue;
        }
        const command = staticCommand(edit, binding);
        if (command) commands.push(command);
    }
    return commands;
}

export function dispatchPropertyEdits(edits: readonly PropertyEdit[], context: PropertyEditContext) {
    const commands = buildPropertyEditCommands(useSceneStore.getState(), edits, context);
    if (!commands.length) return null;
    const command: SceneCommand = commands.length === 1 ? commands[0] : { type: 'batch', commands };
    const options: SceneCommandOptions = {
        source: context.source,
        mergeKey: context.mergeKey,
        transient: context.transient,
    };
    return dispatchSceneCommand(command, options);
}

export function buildSetAutomationCommands(
    state: SceneStoreState,
    targets: readonly { target: PropertyTarget; valueType: AutomationValueType; currentValue: unknown }[],
    enabled: boolean,
    tick: number
): SceneCommand[] {
    const commands: SceneCommand[] = [];
    for (const { target, valueType, currentValue } of targets) {
        const channel = channelForTarget(state.automation, target);
        if (enabled && !channel) {
            commands.push({
                type: 'enablePropertyAutomation',
                target,
                valueType,
                initialKeyframes: [createKeyframe(tick, currentValue)],
            });
        }
        if (!enabled && channel) {
            commands.push({ type: 'disablePropertyAutomation', target, fallbackValue: currentValue });
        }
    }
    return commands;
}

export function propertyEditMergeKey(targets: readonly PropertyTarget[], sessionId: string): string {
    return `property-edit:${targets.map(encodePropertyTarget).sort().join('|')}:${sessionId}`;
}

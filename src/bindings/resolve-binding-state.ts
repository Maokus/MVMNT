import { automationEvaluator } from '@automation/automation-evaluator';
import type { BindingState } from '@state/sceneStore';

export interface SerializedBindingContext {
    tick: number;
    macroValue(macroId: string): unknown;
}

export function resolveKeyframeValue(channelId: string, tick: number): unknown {
    return automationEvaluator.evaluate(channelId, tick);
}

/** Shared evaluator for the serialized binding state used by element and host-node owners. */
export function resolveBindingStateValue(binding: BindingState, context: SerializedBindingContext): unknown {
    if (binding.type === 'constant') return binding.value;
    if (binding.type === 'macro') return context.macroValue(binding.macroId);
    return resolveKeyframeValue(binding.channelId, context.tick);
}

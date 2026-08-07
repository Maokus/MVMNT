import type { BindingState } from '@state/sceneStore';

interface ResolveNodeTransformValueArgs {
    transientValue?: unknown;
    binding?: BindingState;
    fallback: unknown;
    macroValue: (macroId: string) => unknown;
    evaluateChannel: (channelId: string) => unknown;
}

/** Resolves the inspector value without coupling transform UI to Zustand state. */
export function resolveNodeTransformValue({
    transientValue,
    binding,
    fallback,
    macroValue,
    evaluateChannel,
}: ResolveNodeTransformValueArgs): unknown {
    if (typeof transientValue === 'number') return transientValue;
    if (!binding) return fallback;
    if (binding.type === 'constant') return binding.value;
    if (binding.type === 'macro') return macroValue(binding.macroId) ?? fallback;
    return evaluateChannel(binding.channelId) ?? fallback;
}

import type { FormInputChange } from '@workspace/forms/inputs/FormInput';

/** Normalizes the two value shapes emitted by form controls. */
export function unwrapTransformInputValue(change: unknown): unknown {
    return change && typeof change === 'object' && 'value' in change ? (change as FormInputChange).value : change;
}

/** Converts a form value to a finite transform number without coercing invalid input. */
export function readFiniteTransformInput(change: unknown): number | null {
    const value = Number(unwrapTransformInputValue(change));
    return Number.isFinite(value) ? value : null;
}

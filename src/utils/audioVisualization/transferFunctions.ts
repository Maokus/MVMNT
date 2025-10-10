import type { PropertyDefinition } from '@core/types';

export type TransferFunctionId = 'linear' | 'log' | 'power';

export interface TransferFunctionOptions {
    exponent?: number;
    base?: number;
    epsilon?: number;
}

const EPSILON = 1e-6;

function clampNormalized(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

function applyLinear(value: number): number {
    return clampNormalized(value);
}

function applyLogarithmic(value: number, options: TransferFunctionOptions = {}): number {
    const clamped = clampNormalized(value);
    if (clamped <= 0) {
        return 0;
    }
    const base = Number.isFinite(options.base) ? Math.max(2, options.base ?? 10) : 10;
    const epsilon = Number.isFinite(options.epsilon) ? Math.max(EPSILON, options.epsilon ?? EPSILON) : EPSILON;
    const numerator = Math.log(clamped * (base - 1) + 1 + epsilon);
    const denominator = Math.log(base + epsilon);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return clamped;
    }
    return clampNormalized(numerator / denominator);
}

function applyPower(value: number, options: TransferFunctionOptions = {}): number {
    const clamped = clampNormalized(value);
    const exponent = Number.isFinite(options.exponent) ? Math.max(EPSILON, options.exponent ?? 2) : 2;
    const result = Math.pow(clamped, exponent);
    if (!Number.isFinite(result)) {
        return clamped;
    }
    return clampNormalized(result);
}

export function applyTransferFunction(
    value: number,
    type: TransferFunctionId,
    options: TransferFunctionOptions = {},
): number {
    switch (type) {
        case 'log':
            return applyLogarithmic(value, options);
        case 'power':
            return applyPower(value, options);
        case 'linear':
        default:
            return applyLinear(value);
    }
}

export function applyTransferFunctionArray(
    values: readonly number[],
    type: TransferFunctionId,
    options: TransferFunctionOptions = {},
): number[] {
    return values.map((value) => applyTransferFunction(value, type, options));
}

export const TRANSFER_FUNCTION_LABELS: Record<TransferFunctionId, string> = {
    linear: 'Linear',
    log: 'Logarithmic',
    power: 'Power',
};

export interface TransferFunctionPropertyConfig {
    functionKey?: string;
    exponentKey?: string;
    label?: string;
    description?: string;
    exponentLabel?: string;
    exponentDescription?: string;
    defaultFunction?: TransferFunctionId;
    defaultExponent?: number;
    exponentRange?: {
        min?: number;
        max?: number;
        step?: number;
    };
}

export function createTransferFunctionProperties(
    config: TransferFunctionPropertyConfig = {},
): PropertyDefinition[] {
    const {
        functionKey = 'transferFunction',
        exponentKey = 'transferExponent',
        label = 'Transfer Function',
        description,
        exponentLabel = 'Transfer Exponent',
        exponentDescription,
        defaultFunction = 'linear',
        defaultExponent = 2,
        exponentRange = {},
    } = config;

    const transferProperty: PropertyDefinition = {
        key: functionKey,
        type: 'select',
        label,
        default: defaultFunction,
        description,
        options: (
            Object.entries(TRANSFER_FUNCTION_LABELS) as Array<[TransferFunctionId, string]>
        ).map(([value, optionLabel]) => ({ value, label: optionLabel })),
    };

    const exponentProperty: PropertyDefinition = {
        key: exponentKey,
        type: 'number',
        label: exponentLabel,
        default: defaultExponent,
        description: exponentDescription,
        min: exponentRange.min ?? 0.1,
        max: exponentRange.max ?? 8,
        step: exponentRange.step ?? 0.1,
        visibleWhen: [{ key: functionKey, equals: 'power' }],
    };

    return [transferProperty, exponentProperty];
}

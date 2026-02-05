import type { PropertyDefinition } from '@core/types';

export type TransferFunctionId = 'linear' | 'log' | 'power' | 'db';

export interface TransferFunctionOptions {
    exponent?: number;
    base?: number;
    epsilon?: number;
    decibelValue?: number;
    referenceDecibels?: number;
    gain?: number;
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

function applyDecibel(_value: number, options: TransferFunctionOptions = {}): number {
    if (!Number.isFinite(options.decibelValue) || !Number.isFinite(options.referenceDecibels)) {
        return 0;
    }
    const gain = Number.isFinite(options.gain) ? Math.max(0, options.gain ?? 1) : 1;
    const decibelValue = options.decibelValue as number;
    const reference = options.referenceDecibels as number;
    const amplitude = Math.pow(10, (decibelValue - reference) / 20);
    if (!Number.isFinite(amplitude)) {
        return 0;
    }
    return clampNormalized(amplitude * gain);
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
        case 'db':
            return applyDecibel(value, options);
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
    db: 'Decibel',
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

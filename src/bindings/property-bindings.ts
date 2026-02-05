/**
 * Property Binding System
 *
 * This system replaces direct property storage in scene elements with a binding system
 * that can either hold constant values or reference macros. This enables proper
 * serialization and macro management without the need for a separate assignments system.
 */

import { getMacroById, updateMacroValue } from '@state/scene/macroSyncService';
import { isTestEnvironment } from '@utils/env';

export type BindingType = 'constant' | 'macro';

export interface PropertyBindingContext {
    targetTime: number;
    sceneConfig: Record<string, unknown>;
}

export type PropertyBindingData = { type: 'constant'; value: any } | { type: 'macro'; macroId: string };

/**
 * Abstract base class for property bindings
 */
export abstract class PropertyBinding<T = any> {
    public readonly type: BindingType;

    constructor(type: BindingType) {
        this.type = type;
    }

    /**
     * Get the current value of the property
     */
    abstract getValue(): T;

    getValueWithContext?(context: PropertyBindingContext): T;

    /**
     * Set the value of the property
     */
    abstract setValue(value: T): void;

    /**
     * Serialize the binding to a data structure
     */
    abstract serialize(): PropertyBindingData;

    /**
     * Create a binding from serialized data
     */
    static fromSerialized(data: PropertyBindingData): PropertyBinding {
        switch (data.type) {
            case 'constant':
                // Unwrap any accidentally nested serialized constant bindings
                const unwrapConstant = (val: any, depth = 0): any => {
                    // Prevent pathological nesting
                    if (depth > 10) return val;
                    if (val && typeof val === 'object' && val.type === 'constant' && 'value' in val) {
                        return unwrapConstant(val.value, depth + 1);
                    }
                    return val;
                };
                return new ConstantBinding(unwrapConstant(data.value));
            case 'macro':
                if (!('macroId' in data) || !data.macroId) {
                    throw new Error('Macro binding requires macroId');
                }
                return new MacroBinding(data.macroId);
            default: {
                const unknownType = (data as { type?: string }).type ?? 'unknown';
                throw new Error(`Unknown binding type: ${unknownType}`);
            }
        }
    }
}

/**
 * Constant binding - holds a direct value
 */
export class ConstantBinding<T = any> extends PropertyBinding<T> {
    private value: T;

    constructor(value: T) {
        super('constant');
        this.value = value;
    }

    getValue(): T {
        return this.value;
    }

    setValue(value: T): void {
        this.value = value;
    }

    serialize(): PropertyBindingData {
        return {
            type: 'constant',
            value: this.value,
        };
    }
}

/**
 * Macro binding - references a macro by ID
 */
export class MacroBinding<T = any> extends PropertyBinding<T> {
    private macroId: string;

    constructor(macroId: string) {
        super('macro');
        this.macroId = macroId;
    }

    getValue(): T {
        const macro = getMacroById(this.macroId);
        if (!macro) {
            if (!isTestEnvironment()) {
                console.warn(`Macro '${this.macroId}' not found, returning undefined`);
            }
            return undefined as T;
        }
        return macro.value as T;
    }

    setValue(value: T): void {
        updateMacroValue(this.macroId, value);
    }

    getMacroId(): string {
        return this.macroId;
    }

    serialize(): PropertyBindingData {
        return {
            type: 'macro',
            macroId: this.macroId,
        };
    }
}

/**
 * Utility functions for working with property bindings
 */
export class PropertyBindingUtils {
    /**
     * Create a constant binding
     */
    static constant<T>(value: T): ConstantBinding<T> {
        return new ConstantBinding(value);
    }

    /**
     * Create a macro binding
     */
    static macro(macroId: string): MacroBinding {
        return new MacroBinding(macroId);
    }

    /**
     * Convert a raw value to a binding
     * If the value is already a binding, return it unchanged
     * Otherwise, create a constant binding
     */
    static ensureBinding<T>(value: T | PropertyBinding<T>): PropertyBinding<T> {
        if (value instanceof PropertyBinding) {
            return value;
        }
        return new ConstantBinding(value);
    }

    /**
     * Get the raw value from a binding or value
     */
    static getValue<T>(binding: T | PropertyBinding<T>): T {
        if (binding instanceof PropertyBinding) {
            return binding.getValue();
        }
        return binding;
    }

    /**
     * Set a value on a binding or return a new constant binding
     */
    static setValue<T>(binding: T | PropertyBinding<T>, value: T): PropertyBinding<T> {
        if (binding instanceof PropertyBinding) {
            binding.setValue(value);
            return binding;
        }
        return new ConstantBinding(value);
    }

    /**
     * Convert a binding to a serializable format
     */
    static serialize<T>(binding: T | PropertyBinding<T>): PropertyBindingData {
        if (binding instanceof PropertyBinding) {
            return binding.serialize();
        }
        // If it's not a binding, treat it as a constant
        return {
            type: 'constant',
            value: binding,
        };
    }

    /**
     * Check if a value is bound to a specific macro
     */
    static isBoundToMacro<T>(binding: T | PropertyBinding<T>, macroId: string): boolean {
        return binding instanceof MacroBinding && binding.getMacroId() === macroId;
    }
}

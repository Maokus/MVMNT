import type { RuntimeElementSchema, RuntimePropertyDefinition } from './schema';
import { debugLog } from '@utils/debug-log';

export type PropertyTransform<TValue, TElement> = (value: unknown, element: TElement) => TValue | undefined;

export interface PropertyDescriptor<TValue = unknown, TElement = unknown> {
    defaultValue?: TValue;
    transform?: PropertyTransform<TValue, TElement>;
}

export type PropertyDescriptorMap<TElement = unknown> = Record<string, PropertyDescriptor<any, TElement>>;

type DescriptorValue<TDescriptor> = TDescriptor extends PropertyDescriptor<infer TValue, any> ? TValue : never;

export type PropertySnapshot<TDescriptors extends PropertyDescriptorMap<TElement>, TElement = unknown> = {
    [K in keyof TDescriptors]: DescriptorValue<TDescriptors[K]>;
};

type SchemaOwner = { getConfigSchema(): RuntimeElementSchema };
const descriptorCache = new WeakMap<object, PropertyDescriptorMap<any>>();
const hasOwn = (object: unknown, key: PropertyKey): boolean =>
    typeof object === 'object' && object !== null && Object.prototype.hasOwnProperty.call(object, key);

export function getRuntimePropertyDescriptors<TElement>(ctor: SchemaOwner): PropertyDescriptorMap<TElement> {
    const cached = descriptorCache.get(ctor);
    if (cached) return cached;

    const descriptors: PropertyDescriptorMap<TElement> = {};
    try {
        for (const tab of ctor.getConfigSchema().tabs) {
            for (const group of tab.groups) {
                for (const property of group.properties as RuntimePropertyDefinition[]) {
                    const runtime = property.runtime;
                    if (!runtime) continue;
                    const key = runtime.runtimeKey ?? property.key;
                    if (!key) continue;

                    const descriptor: PropertyDescriptor<any, TElement> = {};
                    if (typeof runtime.transform === 'function') {
                        descriptor.transform = runtime.transform as PropertyTransform<any, TElement>;
                    }
                    if (hasOwn(runtime, 'defaultValue')) descriptor.defaultValue = runtime.defaultValue;
                    else if (hasOwn(property, 'default')) descriptor.defaultValue = property.default;
                    descriptors[key] = descriptor;
                }
            }
        }
    } catch (error) {
        debugLog('Failed to collect schema runtime descriptors', error);
    }
    descriptorCache.set(ctor, descriptors);
    return descriptors;
}

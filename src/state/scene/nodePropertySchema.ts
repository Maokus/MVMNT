import type { AutomationValueType } from '@automation/types';
import type { NodeTransform } from '@state/scene-graph';
import { hostPropertyDescriptors } from './propertyCatalog';

export interface HostNodePropertyDefinition {
    path: keyof NodeTransform | 'localVisible' | 'localOpacity';
    label: string;
    valueType: AutomationValueType;
    step?: number;
    degrees?: boolean;
}

/** Public editor schema for host-owned properties, independent of plugin schemas. */
export const HOST_NODE_PROPERTY_SCHEMA: readonly HostNodePropertyDefinition[] = hostPropertyDescriptors('__schema__')
    .filter((descriptor) => descriptor.definition.key !== 'localLocked')
    .map((descriptor) => ({
        path: descriptor.definition.key as keyof NodeTransform | 'localVisible' | 'localOpacity',
        label: descriptor.definition.label,
        valueType: descriptor.definition.type === 'number' ? 'number' : 'boolean',
        step: descriptor.definition.step,
        degrees: descriptor.presentation.unit === '°',
    }));

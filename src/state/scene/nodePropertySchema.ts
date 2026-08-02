import type { AutomationValueType } from '@automation/types';
import type { NodeTransform } from '@state/scene-graph';

export interface HostNodePropertyDefinition {
    path: keyof NodeTransform | 'localVisible';
    label: string;
    valueType: AutomationValueType;
    step?: number;
    degrees?: boolean;
}

/** Public editor schema for host-owned properties, independent of plugin schemas. */
export const HOST_NODE_PROPERTY_SCHEMA: readonly HostNodePropertyDefinition[] = [
    { path: 'translationX', label: 'X', valueType: 'number', step: 1 },
    { path: 'translationY', label: 'Y', valueType: 'number', step: 1 },
    { path: 'rotation', label: 'Rotation', valueType: 'number', step: 1, degrees: true },
    { path: 'uniformScale', label: 'Scale', valueType: 'number', step: 0.01 },
    { path: 'pivotX', label: 'Pivot X', valueType: 'number', step: 1 },
    { path: 'pivotY', label: 'Pivot Y', valueType: 'number', step: 1 },
    { path: 'localVisible', label: 'Visible', valueType: 'boolean' },
];

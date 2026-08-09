import type { AutomationValueType, PropertyOwner, PropertyTarget } from '@automation/types';
import type { ElementPropertyDefinition as PropertyDefinition } from '@mvmnt-app/plugin-sdk';
import type { RegisteredElementSchema as EnhancedConfigSchema } from '@core/scene/runtime/schema';
import { sceneElementRegistry } from '@core/scene/registry';

export interface PropertyPresentationCodec {
    unit?: string;
    toDisplay(value: unknown): unknown;
    fromDisplay(value: unknown): unknown;
    toDisplayDelta?(value: number): number;
    fromDisplayDelta?(value: number): number;
}

export interface InspectorPropertyDescriptor {
    id: string;
    target: PropertyTarget;
    definition: PropertyDefinition;
    tab: { id: string; label: string; order: number };
    group: { id: string; label: string; order: number };
    propertyOrder: number;
    presentation: PropertyPresentationCodec;
    capabilities: {
        automatable: boolean;
        macroAssignable: boolean;
        bulkEditable: boolean;
    };
}

const identityCodec: PropertyPresentationCodec = {
    toDisplay: (value) => value,
    fromDisplay: (value) => value,
};

const degreesCodec: PropertyPresentationCodec = {
    unit: '°',
    toDisplay: (value) => (typeof value === 'number' ? (value * 180) / Math.PI : value),
    fromDisplay: (value) => (typeof value === 'number' ? (value * Math.PI) / 180 : value),
    toDisplayDelta: (value) => (value * 180) / Math.PI,
    fromDisplayDelta: (value) => (value * Math.PI) / 180,
};

const percentCodec: PropertyPresentationCodec = {
    unit: '%',
    toDisplay: (value) => (typeof value === 'number' ? value * 100 : value),
    fromDisplay: (value) => (typeof value === 'number' ? value / 100 : value),
    toDisplayDelta: (value) => value * 100,
    fromDisplayDelta: (value) => value / 100,
};

const hostGroups = [
    {
        id: 'position',
        label: 'Position',
        properties: [
            { key: 'translationX', type: 'number', label: 'X', default: 0, step: 1 },
            { key: 'translationY', type: 'number', label: 'Y', default: 0, step: 1 },
        ],
    },
    {
        id: 'rotationScale',
        label: 'Rotation & Scale',
        properties: [
            { key: 'rotation', type: 'number', label: 'Rotation', default: 0, step: 1 },
            { key: 'scaleX', type: 'number', label: 'Scale X', default: 1, step: 1 },
            { key: 'scaleY', type: 'number', label: 'Scale Y', default: 1, step: 1 },
        ],
    },
    {
        id: 'pivot',
        label: 'Pivot',
        properties: [
            { key: 'pivotX', type: 'number', label: 'Pivot X', default: 0, step: 1 },
            { key: 'pivotY', type: 'number', label: 'Pivot Y', default: 0, step: 1 },
        ],
    },
    {
        id: 'nodeState',
        label: 'Node State',
        properties: [
            { key: 'localVisible', type: 'boolean', label: 'Visible', default: true },
            { key: 'localOpacity', type: 'number', label: 'Opacity', default: 1, step: 0.01, min: 0, max: 1 },
            { key: 'localLocked', type: 'boolean', label: 'Locked', default: false },
        ],
    },
] satisfies Array<{ id: string; label: string; properties: PropertyDefinition[] }>;

const macroTypes = new Set([
    'number',
    'string',
    'longString',
    'boolean',
    'color',
    'colorAlpha',
    'select',
    'file',
    'font',
    'timelineTrackRef',
    'assetRef',
]);

function capabilities(definition: PropertyDefinition, owner: PropertyOwner) {
    return {
        automatable:
            definition.key !== 'localLocked' &&
            ['number', 'boolean', 'color', 'colorAlpha', 'string', 'longString', 'font'].includes(definition.type),
        macroAssignable: definition.key !== 'localLocked' && macroTypes.has(definition.type),
        bulkEditable: true,
    };
}

function codecFor(owner: PropertyOwner, path: string): PropertyPresentationCodec {
    if (owner.kind === 'node' && path === 'rotation') return degreesCodec;
    if (owner.kind === 'node' && (path === 'scaleX' || path === 'scaleY')) return percentCodec;
    return identityCodec;
}

export function hostPropertyDescriptors(nodeId: string): InspectorPropertyDescriptor[] {
    const owner: PropertyOwner = { kind: 'node', id: nodeId };
    return hostGroups.flatMap((group, groupOrder) =>
        group.properties.map((definition, propertyOrder) => ({
            id: `host:${definition.key}`,
            target: { owner, propertyPath: definition.key },
            definition,
            tab: { id: 'transform', label: 'Transform', order: 0 },
            group: { id: group.id, label: group.label, order: groupOrder },
            propertyOrder,
            presentation: codecFor(owner, definition.key),
            capabilities: capabilities(definition, owner),
        }))
    );
}

export function elementPropertyDescriptors(elementId: string, elementType: string): InspectorPropertyDescriptor[] {
    const schema = sceneElementRegistry.getSchema(elementType) as EnhancedConfigSchema | null;
    if (!schema) return [];
    const owner: PropertyOwner = { kind: 'element', id: elementId };
    return schema.tabs.flatMap((tab, tabOrder) =>
        tab.groups.flatMap((group, groupOrder) =>
            group.properties.map((definition, propertyOrder) => ({
                id: `element:${elementType}:${definition.key}`,
                target: { owner, propertyPath: definition.key },
                definition,
                tab: { id: tab.id, label: tab.label, order: tabOrder + 1 },
                group: { id: group.id, label: group.label, order: groupOrder },
                propertyOrder,
                presentation: identityCodec,
                capabilities: capabilities(definition, owner),
            }))
        )
    );
}

export function descriptorForTarget(target: PropertyTarget, elementType?: string): InspectorPropertyDescriptor | null {
    const descriptors =
        target.owner.kind === 'node'
            ? hostPropertyDescriptors(target.owner.id)
            : elementPropertyDescriptors(target.owner.id, elementType ?? '');
    return descriptors.find((descriptor) => descriptor.target.propertyPath === target.propertyPath) ?? null;
}

export function fallbackDescriptor(
    target: PropertyTarget,
    valueType: AutomationValueType
): InspectorPropertyDescriptor {
    const definition: PropertyDefinition = {
        key: target.propertyPath,
        label: target.propertyPath,
        type: valueType === 'color' ? 'color' : valueType === 'string' ? 'string' : valueType,
    };
    return {
        id: `${target.owner.kind}:unknown:${target.propertyPath}`,
        target,
        definition,
        tab: { id: 'unknown', label: target.owner.kind === 'node' ? 'Host' : 'Content', order: 999 },
        group: { id: 'unknown', label: 'Other', order: 999 },
        propertyOrder: 999,
        presentation: codecFor(target.owner, target.propertyPath),
        capabilities: capabilities(definition, target.owner),
    };
}

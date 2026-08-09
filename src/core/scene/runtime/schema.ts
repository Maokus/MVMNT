import type {
    ElementPreset,
    ElementPropertyDefinition,
    ElementPropertyGroup,
    ElementPropertyLayoutNode,
    ElementPropertyTab,
    ElementPropertyVisibilityCondition,
} from '@mvmnt-app/plugin-sdk';
export type { ElementPreset } from '@mvmnt-app/plugin-sdk';

export type PropertyVisibilityCondition = ElementPropertyVisibilityCondition;
export type PropertyLayoutNode = ElementPropertyLayoutNode;

export interface RuntimePropertyElement {
    type: string;
    id: string | null;
}

export type PropertyRuntimeTransform = (value: unknown, element: RuntimePropertyElement) => unknown;

export interface PropertyRuntimeConfig {
    runtimeKey?: string;
    transform?: PropertyRuntimeTransform;
    defaultValue?: unknown;
}

/** Host-only extension used while legacy bound renderers are adapted to SDK definitions. */
export type RuntimePropertyDefinition = ElementPropertyDefinition & { runtime?: PropertyRuntimeConfig };

export type RuntimePropertyGroup = Omit<ElementPropertyGroup, 'properties'> & {
    properties: RuntimePropertyDefinition[];
};

export type RuntimePropertyTab = Omit<ElementPropertyTab, 'groups'> & { groups: RuntimePropertyGroup[] };

export interface RuntimeElementSchema {
    name: string;
    description: string;
    category?: string;
    tabs: RuntimePropertyTab[];
    presets?: ElementPreset[];
}

/** Serializable schema exposed by the registry to state and workspace consumers. */
export interface RegisteredElementSchema {
    name: string;
    description: string;
    category?: string;
    readonly tabs: readonly ElementPropertyTab[];
    readonly presets?: readonly ElementPreset[];
}

// Concise aliases for the class-oriented host adapter. They are intentionally runtime-private.
export type EnhancedConfigSchema = RuntimeElementSchema;
export type PropertyDefinition = RuntimePropertyDefinition;
export type PropertyGroup = RuntimePropertyGroup;
export type PropertyTab = RuntimePropertyTab;
export type SceneElementInterface = RuntimePropertyElement;

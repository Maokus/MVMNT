/**
 * Scene element base: SceneElement class, property descriptors, and prop factory helpers.
 *
 * @module @mvmnt/plugin-sdk/scene
 */

export {
    SceneElement,
    asNumber,
    asBoolean,
    asString,
    asTrimmedString,
    type PropertyTransform,
    type PropertyDescriptor,
    type PropertyDescriptorMap,
    type PropertySnapshot,
} from '@core/scene/elements/base';

export { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';

export type {
    EnhancedConfigSchema,
    SceneElementInterface,
    PropertyDefinition,
    PropertyRuntimeConfig,
    PropertyGroup,
    PropertyGroupPreset,
    PropertyVisibilityCondition,
} from '@core/types';

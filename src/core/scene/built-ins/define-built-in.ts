import type { ElementCapabilities, PluginElementDefinition } from '../../../../packages/plugin-sdk/src/scene';
import { loadBundledAssetForElement } from '@core/scene/plugins/bundled-asset-registry';
import { createPluginDefinitionScope } from '@core/scene/runtime/definition-runtime';
import { definePluginElement, type PluginElementDefinitionInput } from '../../../../packages/plugin-sdk/src/scene';
import { createPluginHostServices } from '@core/scene/plugins/host-api/plugin-api';
import type { CapabilityContext } from '../../../../packages/plugin-sdk/src/scene';
import type { AudioFeatureDemand, AudioFeatureRequirement } from '../../../../packages/plugin-sdk/src/audio';
import type { SceneElementRegistration } from '@core/scene/runtime/types';

// Built-ins receive the same private services as external SDK 2 definitions.
const builtInHostServices = createPluginHostServices().services;
const builtInCapabilities = new WeakMap<PluginElementDefinition<any, any>, ElementCapabilities>();

/** Defines a first-party element and records its grants outside the public SDK contract. */
export function defineBuiltInElement<
    Props extends Readonly<Record<string, unknown>>,
    State = undefined,
    Schema = unknown,
>(
    input: PluginElementDefinitionInput<Props, State, Schema> & { capabilities: ElementCapabilities }
): PluginElementDefinition<Props, State, Schema> {
    const { capabilities, ...definitionInput } = input;
    const definition = definePluginElement(definitionInput as PluginElementDefinitionInput<Props, State, Schema>);
    builtInCapabilities.set(definition, capabilities);
    return definition;
}

/** Returns the SDK 2 callback context attached at the built-in registry boundary. */
export function getEnginePrivateContext(element: any): CapabilityContext {
    if (!element?.__capabilityContext) {
        throw new Error('Engine-private renderer must be created through its SDK 2 definition');
    }
    return element.__capabilityContext as CapabilityContext;
}

/** Adapts one built-in definition to the same registry shape used by external plugins. */
export function createBuiltInRegistration(definition: PluginElementDefinition<any, any>): SceneElementRegistration {
    const scope = createPluginDefinitionScope(definition, {
        pluginId: 'mvmnt.builtin',
        services: builtInHostServices,
        capabilities: builtInCapabilities.get(definition),
        synchronousInitialization: true,
        loadAsset: (path) => loadBundledAssetForElement(definition.type, path),
        report: (diagnostic) => console.error(`[${definition.type}] ${diagnostic.code}: ${diagnostic.message}`),
    });
    return scope.createRegistration({ kind: 'built-in' });
}

/**
 * Transitional adapter for first-party renderers that still own engine-private
 * controllers/caches. The public registry sees an SDK 2 definition; the nested
 * class is never exposed to plugins and can be removed renderer-by-renderer.
 */
export function defineHostAdaptedBuiltIn(
    input: Omit<
        PluginElementDefinitionInput<Readonly<Record<string, unknown>>, any>,
        'schema' | 'load' | 'create' | 'render' | 'dispose'
    > & { capabilities: ElementCapabilities; featureRequirements?: readonly AudioFeatureRequirement[] },
    HostAdapter: any
): PluginElementDefinition<Readonly<Record<string, unknown>>, any> {
    const schema = HostAdapter.getConfigSchema();
    const { capabilities, featureRequirements, ...definitionInput } = input;
    const declaredDemands = definitionInput.audioFeatureDemands;
    return defineBuiltInElement({
        ...definitionInput,
        capabilities,
        schema,
        audioFeatureDemands(props): readonly AudioFeatureDemand[] {
            if (declaredDemands) return declaredDemands(props);
            const trackId = typeof props.audioTrackId === 'string' ? props.audioTrackId : null;
            return (featureRequirements ?? []).map((requirement, index) => ({
                ...requirement,
                id: `${requirement.feature}:${index}`,
                trackId,
            }));
        },
        create(props, context: CapabilityContext) {
            const adapter = new HostAdapter(input.type, { ...props });
            adapter.__capabilityContext = context;
            return adapter;
        },
        render(props, adapter, time) {
            for (const [key, value] of Object.entries(props)) adapter.setProperty(key, value);
            return adapter._buildRenderObjects({}, time.seconds);
        },
        dispose(adapter) {
            adapter.dispose();
        },
    });
}

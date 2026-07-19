import type { PluginElementDefinition } from '../../../../packages/plugin-sdk/src/scene';
import { loadBundledAssetForElement } from './bundled-asset-registry';
import { createPluginDefinitionScope } from './v2-runtime';
import { definePluginElement, type PluginElementDefinitionInput } from '../../../../packages/plugin-sdk/src/scene';
import { createPluginHostApi } from './host-api/plugin-api';
import { getRequiredPluginApi } from './plugin-sdk';
import { CallbackElementRenderer, type CapabilityContext } from '../../../../packages/plugin-sdk/src/scene';
import type { AudioFeatureRequirement } from '../../../../packages/plugin-sdk/src/audio';
import { registerScopedFeatureRequirements } from '@audio/audioElementMetadata';

// Built-ins are imported before app bootstrap installs the public plugin global.
// Give their SDK 2 scopes direct engine services so capability contexts do not
// depend on module/bootstrap ordering.
const builtInHostServices = createPluginHostApi().api;

class BuiltInContextBridge extends CallbackElementRenderer {
    override _buildRenderObjects(): readonly never[] {
        return [];
    }
}

/** Engine-private fallback retained for direct constructor tests; registry instances receive an SDK 2 callback facade. */
export function getEnginePrivateHostApi(element: any, ...requirements: any[]): any {
    return typeof element?.__hostApi === 'function'
        ? element.__hostApi(...requirements)
        : getRequiredPluginApi(element, requirements.at(-1) ?? []);
}

/** Host-only adapter used by the class-oriented scene registry and old constructor tests. */
export function createBuiltInDefinitionElementClass(definition: PluginElementDefinition<any, any>): any {
    const scope = createPluginDefinitionScope(definition, {
        pluginId: 'mvmnt.builtin',
        services: builtInHostServices,
        synchronousInitialization: true,
        loadAsset: (path) => loadBundledAssetForElement(definition.type, path),
        report: (diagnostic) => console.error(`[${definition.type}] ${diagnostic.code}: ${diagnostic.message}`),
    });
    return scope.createElementClass();
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
    > & { featureRequirements?: readonly AudioFeatureRequirement[] },
    HostAdapter: any
): PluginElementDefinition<Readonly<Record<string, unknown>>, any> {
    const schema = HostAdapter.getConfigSchema();
    let unregisterRequirements: (() => void) | undefined;
    return definePluginElement({
        ...input,
        schema,
        load() {
            if (input.featureRequirements?.length)
                unregisterRequirements = registerScopedFeatureRequirements(input.type, input.featureRequirements);
        },
        create(props, context: CapabilityContext) {
            const adapter = new HostAdapter(input.type, { ...props });
            const bridge = new BuiltInContextBridge();
            bridge.__attach(context, props);
            adapter.__hostApi = (...requirements: any[]) => bridge.__hostFacade(...requirements);
            return adapter;
        },
        render(props, adapter, time) {
            for (const [key, value] of Object.entries(props)) adapter.setProperty(key, value);
            return adapter._buildRenderObjects({}, time.seconds);
        },
        dispose(adapter) {
            adapter.dispose();
        },
        unload() {
            unregisterRequirements?.();
            unregisterRequirements = undefined;
        },
    });
}

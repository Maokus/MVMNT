import type { PluginElementDefinition } from '../../../../packages/plugin-sdk/src/scene';
import { loadBundledAssetForElement } from './bundled-asset-registry';
import { createPluginDefinitionScope } from './v2-runtime';
import { definePluginElement, type PluginElementDefinitionInput } from '../../../../packages/plugin-sdk/src/scene';
import { getPluginHostApi } from './host-api/get-plugin-host-api';

/** Host-only adapter used by the class-oriented scene registry and old constructor tests. */
export function createBuiltInDefinitionElementClass(definition: PluginElementDefinition<any, any>): any {
    const scope = createPluginDefinitionScope(definition, {
        pluginId: 'mvmnt.builtin',
        services: getPluginHostApi().api,
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
    input: Omit<PluginElementDefinitionInput<Readonly<Record<string, unknown>>, any>, 'schema' | 'create' | 'render' | 'dispose'>,
    HostAdapter: any,
): PluginElementDefinition<Readonly<Record<string, unknown>>, any> {
    const schema = HostAdapter.getConfigSchema();
    return definePluginElement({
        ...input,
        schema,
        create(props) { return new HostAdapter(input.type, { ...props }); },
        render(props, adapter, time) {
            for (const [key, value] of Object.entries(props)) adapter.setProperty(key, value);
            return adapter._buildRenderObjects({}, time.seconds);
        },
        dispose(adapter) { adapter.dispose(); },
    });
}

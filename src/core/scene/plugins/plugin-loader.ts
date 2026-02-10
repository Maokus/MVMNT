import { unzipSync } from 'fflate';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { usePluginStore, type PluginManifest } from '@state/pluginStore';
import { PluginBinaryStore } from '@persistence/plugin-binary-store';
import { satisfiesVersion } from './version-check';
import { version as MVMNT_VERSION } from '../../../../package.json';

export interface PluginLoadResult {
    success: boolean;
    pluginId?: string;
    error?: string;
    registeredTypes?: string[];
}

/**
 * Load a plugin from a .mvmnt-plugin bundle (ZIP file)
 */
export async function loadPlugin(bundleData: ArrayBuffer): Promise<PluginLoadResult> {
    try {
        // Unzip the bundle
        const uint8Data = new Uint8Array(bundleData);
        const files = unzipSync(uint8Data);

        // Read manifest
        const manifestData = files['manifest.json'];
        if (!manifestData) {
            return { success: false, error: 'Missing manifest.json in plugin bundle' };
        }

        const manifestText = new TextDecoder().decode(manifestData);
        const manifest: PluginManifest = JSON.parse(manifestText);

        // Validate manifest
        const validationError = validateManifest(manifest);
        if (validationError) {
            return { success: false, error: validationError };
        }

        // Check version compatibility
        if (!satisfiesVersion(MVMNT_VERSION, manifest.mvmntVersion)) {
            return {
                success: false,
                error: `Plugin requires MVMNT version ${manifest.mvmntVersion}, but current version is ${MVMNT_VERSION}`,
            };
        }

        // Check if plugin is already loaded
        const existingPlugin = usePluginStore.getState().plugins[manifest.id];
        if (existingPlugin) {
            return {
                success: false,
                error: `Plugin '${manifest.id}' is already loaded`,
            };
        }

        // Store the bundle for future use
        await PluginBinaryStore.put(manifest.id, bundleData);

        // Load and register each element
        const registeredTypes: string[] = [];
        const loadErrors: string[] = [];

        for (const elementManifest of manifest.elements) {
            try {
                // Get the bundled element code
                const entryData = files[elementManifest.entry];
                if (!entryData) {
                    loadErrors.push(`Missing entry file '${elementManifest.entry}' for element '${elementManifest.type}'`);
                    continue;
                }

                const code = new TextDecoder().decode(entryData);

                // Load the element class dynamically
                const ElementClass = await loadElementFromCode(code, elementManifest.type);

                // Register the element
                sceneElementRegistry.registerCustomElement(
                    elementManifest.type,
                    ElementClass,
                    {
                        pluginId: manifest.id,
                        overrideCategory: elementManifest.category,
                    }
                );

                registeredTypes.push(elementManifest.type);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                loadErrors.push(`Failed to load element '${elementManifest.type}': ${errorMsg}`);
            }
        }

        // If all elements failed to load, consider it a failure
        if (registeredTypes.length === 0) {
            return {
                success: false,
                error: `No elements could be loaded. Errors: ${loadErrors.join('; ')}`,
            };
        }

        // Add to plugin store
        usePluginStore.getState().addPlugin(manifest, true);

        // Log any partial failures
        if (loadErrors.length > 0) {
            console.warn(`[PluginLoader] Partial load for plugin '${manifest.id}':`, loadErrors);
        }

        return {
            success: true,
            pluginId: manifest.id,
            registeredTypes,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Failed to load plugin: ${errorMsg}`,
        };
    }
}

/**
 * Unload a plugin and unregister its elements
 */
export async function unloadPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const plugin = usePluginStore.getState().plugins[pluginId];
        if (!plugin) {
            return { success: false, error: `Plugin '${pluginId}' is not loaded` };
        }

        // Unregister all elements from the registry
        const unregistered = sceneElementRegistry.unregisterPlugin(pluginId);

        // Remove from plugin store
        usePluginStore.getState().removePlugin(pluginId);

        // Remove from storage
        await PluginBinaryStore.delete(pluginId);

        console.log(`[PluginLoader] Unloaded plugin '${pluginId}', unregistered ${unregistered.length} elements`);

        return { success: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMsg };
    }
}

/**
 * Reload a plugin from storage (used on app startup)
 */
export async function reloadPluginFromStorage(pluginId: string): Promise<PluginLoadResult> {
    try {
        const bundleData = await PluginBinaryStore.get(pluginId);
        if (!bundleData) {
            return { success: false, error: `Plugin '${pluginId}' not found in storage` };
        }

        return await loadPlugin(bundleData);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMsg };
    }
}

/**
 * Load all plugins from storage on app startup
 */
export async function loadAllPluginsFromStorage(): Promise<void> {
    try {
        const pluginIds = await PluginBinaryStore.listIds();
        
        for (const pluginId of pluginIds) {
            usePluginStore.getState().setLoading(pluginId, true);
            const result = await reloadPluginFromStorage(pluginId);
            usePluginStore.getState().setLoading(pluginId, false);

            if (!result.success) {
                console.error(`[PluginLoader] Failed to reload plugin '${pluginId}':`, result.error);
                usePluginStore.getState().setPluginError(pluginId, result.error || 'Unknown error');
            }
        }
    } catch (error) {
        console.error('[PluginLoader] Failed to load plugins from storage:', error);
    }
}

/**
 * Validate plugin manifest structure
 */
function validateManifest(manifest: any): string | null {
    if (!manifest || typeof manifest !== 'object') {
        return 'Invalid manifest: not an object';
    }

    const required = ['id', 'name', 'version', 'mvmntVersion', 'elements'];
    for (const field of required) {
        if (!manifest[field]) {
            return `Invalid manifest: missing required field '${field}'`;
        }
    }

    if (!Array.isArray(manifest.elements) || manifest.elements.length === 0) {
        return 'Invalid manifest: elements must be a non-empty array';
    }

    // Validate each element
    for (const element of manifest.elements) {
        const elemRequired = ['type', 'name', 'category', 'entry'];
        for (const field of elemRequired) {
            if (!element[field]) {
                return `Invalid manifest: element missing required field '${field}'`;
            }
        }
    }

    return null;
}

/**
 * Dynamically load an element class from bundled code
 */
async function loadElementFromCode(code: string, elementType: string): Promise<any> {
    try {
        // Create a module-like environment
        // The bundled code should export the element class as default
        const module: any = { exports: {} };
        
        // Create a function that evaluates the code
        // The code should be in the format that esbuild produces
        const loadFn = new Function('module', 'exports', 'require', code);
        
        // Mock require function for common imports
        const mockRequire = (id: string) => {
            // Map common imports to global scope
            if (id === 'react' || id === 'React') {
                return (globalThis as any).React;
            }
            if (id === 'react-dom') {
                return (globalThis as any).ReactDOM;
            }
            // Core imports should be available via window/globalThis
            if (id.startsWith('@core/') || id.startsWith('@audio/') || id.startsWith('@utils/')) {
                const path = id.replace(/^@core\//, 'MVMNT.core.')
                    .replace(/^@audio\//, 'MVMNT.audio.')
                    .replace(/^@utils\//, 'MVMNT.utils.');
                const parts = path.split('.');
                let obj: any = globalThis;
                for (const part of parts) {
                    obj = obj[part];
                    if (!obj) {
                        throw new Error(`Module not found: ${id} (tried ${path})`);
                    }
                }
                return obj;
            }
            throw new Error(`Module not found: ${id}`);
        };

        // Execute the code
        loadFn(module, module.exports, mockRequire);
        
        // Get the exported class
        const ElementClass = module.exports.default || module.exports[elementType];
        
        if (!ElementClass) {
            throw new Error(`Element class not found in module (expected default export or ${elementType} export)`);
        }

        return ElementClass;
    } catch (error) {
        throw new Error(`Failed to load element code: ${error instanceof Error ? error.message : String(error)}`);
    }
}

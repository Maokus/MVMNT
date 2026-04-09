import { unzipSync } from 'fflate';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import * as pluginSdkModule from '@core/scene/plugins/plugin-sdk';
import { usePluginStore, type PluginManifest } from '@state/pluginStore';
import { PluginBinaryStore } from '@persistence/plugin-binary-store';
import { PluginSettingsStore } from '@persistence/plugin-settings-store';
import { satisfiesVersion } from './version-check';
import { PLUGIN_API_VERSION } from './api-version';

export interface PluginLoadResult {
    success: boolean;
    pluginId?: string;
    /** Manifest is populated even on failure once the bundle has been parsed. */
    manifest?: PluginManifest;
    error?: string;
    registeredTypes?: string[];
    /** Element types that failed to register (collision or code error), but did not abort the load. */
    skippedElements?: string[];
}

interface LoadPluginOptions {
    allowExistingPlugin?: boolean;
    skipVersionCheck?: boolean;
    /** Allow installing a bundle whose version is older than the currently installed one. */
    allowDowngrade?: boolean;
}

const PLUGIN_RUNTIME_MODULES: Record<string, unknown> = {
    '@mvmnt/plugin-sdk': pluginSdkModule,
};

const LEGACY_INTERNAL_PREFIXES = ['@core/', '@audio/', '@utils/'];
const warnedLegacyImports = new Set<string>();

function warnLegacyPluginImport(id: string): void {
    if (!LEGACY_INTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix))) {
        return;
    }
    if (warnedLegacyImports.has(id)) {
        return;
    }
    warnedLegacyImports.add(id);
    console.warn(`[PluginLoader] Legacy plugin import detected: '${id}'. Prefer '@mvmnt/plugin-sdk'.`);
}

function dispatchPluginAvailabilityEvent(detail: {
    action: 'installed' | 'enabled' | 'disabled' | 'removed';
    pluginId: string;
    registeredTypes?: string[];
    unregisteredTypes?: string[];
}) {
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mvmnt-plugin-availability-changed', { detail }));
        }
    } catch {
        /* ignore event failures */
    }
}

/**
 * Load a plugin from a .mvmnt-plugin bundle (ZIP file)
 */
export async function loadPlugin(
    bundleData: ArrayBuffer,
    options: LoadPluginOptions = {}
): Promise<PluginLoadResult> {
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
        if (!options.skipVersionCheck) {
            const versionRange = manifest.apiVersion ?? manifest.mvmntVersion;
            if (manifest.mvmntVersion && !manifest.apiVersion) {
                console.warn(
                    `[PluginLoader] Plugin '${manifest.id}' uses deprecated 'mvmntVersion'. ` +
                    `Update its manifest to use 'apiVersion' instead.`
                );
            }
            if (!satisfiesVersion(PLUGIN_API_VERSION, versionRange!)) {
                return {
                    success: false,
                    manifest,
                    pluginId: manifest.id,
                    error: `Plugin requires API version ${versionRange}, but current API version is ${PLUGIN_API_VERSION}`,
                };
            }
        }

        // Check if plugin is already loaded
        const existingPlugin = usePluginStore.getState().plugins[manifest.id];
        if (existingPlugin && !options.allowExistingPlugin) {
            return {
                success: false,
                manifest,
                pluginId: manifest.id,
                error: `Plugin '${manifest.id}' is already loaded`,
            };
        }

        // Downgrade guard: reject if the incoming bundle is older than what's installed
        if (existingPlugin && !options.allowDowngrade) {
            if (!satisfiesVersion(manifest.version, `>=${existingPlugin.manifest.version}`)) {
                return {
                    success: false,
                    manifest,
                    pluginId: manifest.id,
                    error:
                        `Cannot install plugin '${manifest.id}' v${manifest.version}: ` +
                        `installed version v${existingPlugin.manifest.version} is newer. ` +
                        `Use upgradePlugin() to upgrade.`,
                };
            }
        }

        // Store the bundle for future use
        await PluginBinaryStore.put(manifest.id, bundleData);

        // Load and register each element
        const registeredTypes: string[] = [];
        const loadErrors: string[] = [];
        const skippedElements: string[] = [];

        for (const elementManifest of manifest.elements) {
            try {
                // Get the bundled element code
                const entryData = files[elementManifest.entry];
                if (!entryData) {
                    loadErrors.push(`Missing entry file '${elementManifest.entry}' for element '${elementManifest.type}'`);
                    skippedElements.push(elementManifest.type);
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
                        capabilities: elementManifest.capabilities,
                    }
                );

                registeredTypes.push(elementManifest.type);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                loadErrors.push(`Failed to load element '${elementManifest.type}': ${errorMsg}`);
                skippedElements.push(elementManifest.type);
            }
        }

        // If all elements failed to load, consider it a failure
        if (registeredTypes.length === 0) {
            return {
                success: false,
                manifest,
                pluginId: manifest.id,
                error: `No elements could be loaded. Errors: ${loadErrors.join('; ')}`,
            };
        }

        // Add to plugin store
        usePluginStore.getState().addPlugin(manifest, true);

        // Log any partial failures
        if (loadErrors.length > 0) {
            console.warn(`[PluginLoader] Partial load for plugin '${manifest.id}':`, loadErrors);
        }

        const result: PluginLoadResult = {
            success: true,
            pluginId: manifest.id,
            manifest,
            registeredTypes,
            skippedElements: skippedElements.length > 0 ? skippedElements : undefined,
        };
        dispatchPluginAvailabilityEvent({
            action: existingPlugin ? 'enabled' : 'installed',
            pluginId: manifest.id,
            registeredTypes,
        });

        return result;
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
        PluginSettingsStore.removeEntry(pluginId);

        dispatchPluginAvailabilityEvent({
            action: 'removed',
            pluginId,
            unregisteredTypes: unregistered,
        });

        console.log(`[PluginLoader] Unloaded plugin '${pluginId}', unregistered ${unregistered.length} elements`);

        return { success: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMsg };
    }
}

/**
 * Disable a plugin without removing it from storage or settings.
 */
export async function disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const plugin = usePluginStore.getState().plugins[pluginId];
        if (!plugin) {
            return { success: false, error: `Plugin '${pluginId}' is not loaded` };
        }

        const unregistered = sceneElementRegistry.unregisterPlugin(pluginId);
        usePluginStore.getState().disablePlugin(pluginId);
        PluginSettingsStore.setEnabled(pluginId, false);

        dispatchPluginAvailabilityEvent({
            action: 'disabled',
            pluginId,
            unregisteredTypes: unregistered,
        });

        return { success: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMsg };
    }
}

/**
 * Re-enable a plugin from persisted binary storage.
 */
export async function enablePlugin(pluginId: string): Promise<PluginLoadResult> {
    try {
        usePluginStore.getState().clearPluginError(pluginId);
        PluginSettingsStore.setEnabled(pluginId, true);
        return await reloadPluginFromStorage(pluginId, { allowExistingPlugin: true });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMsg };
    }
}

/**
 * Upgrade an installed plugin to a newer version from a bundle.
 *
 * - If the plugin is not yet installed, behaves like a normal install.
 * - If the incoming version is not strictly newer than the installed version, returns an error.
 * - Unloads the running plugin before installing the new bundle, so on failure the plugin
 *   will not be present until re-installed manually.
 */
export async function upgradePlugin(bundleData: ArrayBuffer): Promise<PluginLoadResult> {
    try {
        const uint8Data = new Uint8Array(bundleData);
        const files = unzipSync(uint8Data);

        const manifestData = files['manifest.json'];
        if (!manifestData) {
            return { success: false, error: 'Missing manifest.json in plugin bundle' };
        }

        const manifestText = new TextDecoder().decode(manifestData);
        const manifest: PluginManifest = JSON.parse(manifestText);

        const validationError = validateManifest(manifest);
        if (validationError) {
            return { success: false, manifest, error: validationError };
        }

        const existingPlugin = usePluginStore.getState().plugins[manifest.id];
        if (existingPlugin) {
            const isNewer = satisfiesVersion(manifest.version, `>${existingPlugin.manifest.version}`);
            if (!isNewer) {
                return {
                    success: false,
                    manifest,
                    pluginId: manifest.id,
                    error:
                        `Cannot upgrade '${manifest.id}': ` +
                        `incoming version v${manifest.version} is not newer than ` +
                        `installed v${existingPlugin.manifest.version}`,
                };
            }
            // Unload the old version before installing the new one
            await unloadPlugin(manifest.id);
        }

        return await loadPlugin(bundleData);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Failed to upgrade plugin: ${errorMsg}` };
    }
}

/**
 * Reload a plugin from storage (used on app startup)
 */
export async function reloadPluginFromStorage(
    pluginId: string,
    options: Pick<LoadPluginOptions, 'allowExistingPlugin'> = {}
): Promise<PluginLoadResult> {
    try {
        const bundleData = await PluginBinaryStore.get(pluginId);
        if (!bundleData) {
            return { success: false, error: `Plugin '${pluginId}' not found in storage` };
        }

        return await loadPlugin(bundleData, {
            allowExistingPlugin: options.allowExistingPlugin,
            // Version is re-checked on startup to catch host API major bumps between sessions.
        });
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
                if (result.manifest) {
                    // Manifest parsed but load failed (e.g. API version incompatible after host update).
                    // Register in store as disabled-with-error so the UI can surface it.
                    usePluginStore.getState().registerFailedPlugin(result.manifest, result.error ?? 'Failed to load');
                } else {
                    usePluginStore.getState().setPluginError(pluginId, result.error || 'Unknown error');
                }
            } else {
                const storedEnabled = PluginSettingsStore.getEnabled(pluginId);
                if (storedEnabled === false) {
                    sceneElementRegistry.unregisterPlugin(pluginId);
                    usePluginStore.getState().disablePlugin(pluginId);
                }
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

    const required = ['id', 'name', 'version', 'elements'];
    for (const field of required) {
        if (!manifest[field]) {
            return `Invalid manifest: missing required field '${field}'`;
        }
    }

    if (!manifest.apiVersion && !manifest.mvmntVersion) {
        return `Invalid manifest: missing required field 'apiVersion'`;
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
        return evaluateCommonJsModule(code, elementType);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/import declarations may only appear/.test(message) || /Unexpected token 'export'/.test(message)) {
            try {
                const transformed = transformEsModuleToCommonJs(code);
                return evaluateCommonJsModule(transformed, elementType);
            } catch (fallbackError) {
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                throw new Error(`Failed to load element code: ${fallbackMessage}`);
            }
        }
        throw new Error(`Failed to load element code: ${message}`);
    }
}

function evaluateCommonJsModule(code: string, elementType: string): any {
    const module: any = { exports: {} };
    const loadFn = new Function('module', 'exports', 'require', code);

    const mockRequire = (id: string) => {
        warnLegacyPluginImport(id);

        const directModule = PLUGIN_RUNTIME_MODULES[id];
        if (directModule) {
            return directModule;
        }

        if (id === 'react' || id === 'React') {
            return (globalThis as any).React;
        }
        if (id === 'react-dom') {
            return (globalThis as any).ReactDOM;
        }
        if (id === 'react/jsx-runtime') {
            return (globalThis as any).ReactJSXRuntime;
        }
        if (id === 'react/jsx-dev-runtime') {
            return (globalThis as any).ReactJSXDevRuntime;
        }
        if (id.startsWith('@core/') || id.startsWith('@audio/') || id.startsWith('@utils/')) {
            // Legacy compatibility: attempt to resolve internal aliases via the globalThis.MVMNT
            // namespace. This will fail in normal packaged-plugin contexts since those globals are
            // not populated. Plugins should import exclusively from '@mvmnt/plugin-sdk'.
            const path = id.replace(/^@core\//, 'MVMNT.core.')
                .replace(/^@audio\//, 'MVMNT.audio.')
                .replace(/^@utils\//, 'MVMNT.utils.')
                .replace(/\//g, '.');
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

    loadFn(module, module.exports, mockRequire);

    const ElementClass = resolveElementExport(module.exports, elementType);
    if (!ElementClass) {
        throw new Error(`Element class not found in module (expected default export or ${elementType} export)`);
    }

    return ElementClass;
}

function resolveElementExport(exportsObj: any, elementType: string): any {
    if (!exportsObj) return null;
    if (typeof exportsObj === 'function') return exportsObj;
    if (exportsObj.default) return exportsObj.default;
    if (exportsObj[elementType]) return exportsObj[elementType];

    const normalizedType = normalizeElementType(elementType);
    const candidateKeys = [normalizedType, `${normalizedType}Element`];

    for (const key of candidateKeys) {
        if (exportsObj[key]) return exportsObj[key];
    }

    const exportEntries = Object.entries(exportsObj).filter(([, value]) => typeof value === 'function');
    if (exportEntries.length === 1) {
        return exportEntries[0][1];
    }

    const elementLike = exportEntries.find(([, value]) => typeof (value as any).getConfigSchema === 'function');
    if (elementLike) return elementLike[1];

    return null;
}

function normalizeElementType(elementType: string): string {
    return elementType
        .split(/[^a-zA-Z0-9]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function transformEsModuleToCommonJs(code: string): string {
    let transformed = code;
    let importIndex = 0;

    transformed = transformed.replace(/^\s*import\s+type\s+[^;]+;?/gm, '');

    transformed = transformed.replace(/^\s*import\s+['"]([^'"]+)['"];?/gm, 'require("$1");');

    transformed = transformed.replace(/^\s*import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/gm, (_match, clause, specifier) => {
        const requireVar = `__mvmnt_import_${importIndex++}`;
        const lines: string[] = [`const ${requireVar} = require("${specifier}");`];

        const trimmedClause = String(clause).trim();
        let defaultPart: string | null = null;
        let namedPart: string | null = null;
        let namespacePart: string | null = null;

        if (trimmedClause.includes(',')) {
            const [first, rest] = trimmedClause.split(',', 2).map((value: string) => value.trim());
            defaultPart = first || null;
            if (rest.startsWith('{')) {
                namedPart = rest;
            } else if (rest.startsWith('*')) {
                namespacePart = rest;
            }
        } else if (trimmedClause.startsWith('{')) {
            namedPart = trimmedClause;
        } else if (trimmedClause.startsWith('*')) {
            namespacePart = trimmedClause;
        } else if (trimmedClause.length > 0) {
            defaultPart = trimmedClause;
        }

        if (defaultPart) {
            lines.push(`const ${defaultPart} = ${requireVar};`);
        }

        if (namespacePart) {
            const match = namespacePart.match(/\*\s+as\s+(\w+)/);
            if (match) {
                lines.push(`const ${match[1]} = ${requireVar};`);
            }
        }

        if (namedPart) {
            const normalized = namedPart.replace(/\{([\s\S]*)\}/, '$1').trim();
            const mapped = normalized.replace(/\s+as\s+/g, ': ');
            lines.push(`const { ${mapped} } = ${requireVar};`);
        }

        return lines.join('\n');
    });

    transformed = transformed.replace(/^\s*export\s+default\s+/gm, 'module.exports.default = ');

    transformed = transformed.replace(/^\s*export\s+\{([^}]+)\};?/gm, (_match, specifiers) => {
        const assignments = String(specifiers)
            .split(',')
            .map((raw) => raw.trim())
            .filter(Boolean)
            .map((spec) => {
                const [original, alias] = spec.split(/\s+as\s+/).map((value) => value.trim());
                const exportName = alias || original;
                if (exportName === 'default') {
                    return `module.exports.default = ${original};`;
                }
                return `exports.${exportName} = ${original};`;
            });
        return assignments.join('\n');
    });

    transformed = transformed.replace(/^\s*export\s+(const|let|var|function|class)\s+/gm, '$1 ');

    return transformed;
}

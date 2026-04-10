import { unzipSync } from 'fflate';
import { parseModule } from 'meriyah';
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

// ---------------------------------------------------------------------------
// Asset registry
// ---------------------------------------------------------------------------
// Stores per-plugin bundled asset bytes, keyed by path relative to assets/ dir.
const pluginAssetRegistry = new Map<string, Map<string, Uint8Array>>();
// Blob URLs created for assets — revoked when the plugin is fully unloaded.
const pluginBlobUrls = new Map<string, string[]>();

// Dev-mode asset base paths (populated by dev-plugin-loader when using native Vite imports).
// Maps pluginId → base URL path (e.g. '/src/plugins/extraspack1/assets').
const devAssetBasePaths = new Map<string, string>();

/**
 * Register a plugin's asset directory for dev-mode loading.
 * Called by dev-plugin-loader.ts when the element is loaded via native Vite import()
 * rather than through the normal ZIP bundle path.
 */
export function registerDevPluginAssets(pluginId: string, assetBasePath: string): void {
    devAssetBasePaths.set(pluginId, assetBasePath);
}

function registerPluginAssets(pluginId: string, files: Record<string, Uint8Array>): void {
    const assetMap = new Map<string, Uint8Array>();
    for (const [filePath, data] of Object.entries(files)) {
        if (filePath.startsWith('assets/')) {
            assetMap.set(filePath.slice('assets/'.length), data);
        }
    }
    if (assetMap.size > 0) {
        pluginAssetRegistry.set(pluginId, assetMap);
    }
}

function revokePluginAssets(pluginId: string): void {
    const urls = pluginBlobUrls.get(pluginId);
    if (urls) {
        for (const url of urls) {
            URL.revokeObjectURL(url);
        }
    }
    pluginBlobUrls.delete(pluginId);
    pluginAssetRegistry.delete(pluginId);
}

export function loadBundledAssetForPlugin(pluginId: string, assetPath: string): Promise<string> {
    // Dev mode: serve directly from the Vite dev server URL (no blob conversion needed).
    const devBasePath = devAssetBasePaths.get(pluginId);
    if (devBasePath) {
        return Promise.resolve(`${devBasePath}/${assetPath}`);
    }

    const pluginAssets = pluginAssetRegistry.get(pluginId);
    if (!pluginAssets) {
        return Promise.reject(new Error(`[PluginLoader] No assets registered for plugin '${pluginId}'`));
    }
    const data = pluginAssets.get(assetPath);
    if (!data) {
        const available = [...pluginAssets.keys()].join(', ') || 'none';
        return Promise.reject(
            new Error(`[PluginLoader] Asset '${assetPath}' not found in plugin '${pluginId}'. Available: ${available}`)
        );
    }
    const mime = guessMimeType(assetPath);
    // Copy into a plain ArrayBuffer (fflate returns Uint8Array<ArrayBufferLike>).
    const blob = new Blob([new Uint8Array(data)], { type: mime });
    const url = URL.createObjectURL(blob);
    const urls = pluginBlobUrls.get(pluginId) ?? [];
    urls.push(url);
    pluginBlobUrls.set(pluginId, urls);
    return Promise.resolve(url);
}

function guessMimeType(assetPath: string): string {
    const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        tiff: 'image/tiff',
        tif: 'image/tiff',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        mp4: 'video/mp4',
        webm: 'video/webm',
        json: 'application/json',
        woff: 'font/woff',
        woff2: 'font/woff2',
        ttf: 'font/ttf',
        otf: 'font/otf',
    };
    return mimeMap[ext] ?? 'application/octet-stream';
}
// ---------------------------------------------------------------------------

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

        // Register bundled assets so elements can load them via loadBundledAsset()
        registerPluginAssets(manifest.id, files as Record<string, Uint8Array>);

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
                const ElementClass = await loadElementFromCode(code, elementManifest.type, manifest.id);

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

        // Revoke any blob URLs created for bundled assets
        revokePluginAssets(pluginId);

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
async function loadElementFromCode(code: string, elementType: string, pluginId: string): Promise<any> {
    try {
        return evaluateCommonJsModule(code, elementType, pluginId);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/import declarations may only appear/.test(message) || /Unexpected token 'export'/.test(message)) {
            try {
                const transformed = transformEsModuleToCommonJs(code);
                return evaluateCommonJsModule(transformed, elementType, pluginId);
            } catch (fallbackError) {
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                throw new Error(`Failed to load element code: ${fallbackMessage}`);
            }
        }
        throw new Error(`Failed to load element code: ${message}`);
    }
}

function evaluateCommonJsModule(code: string, elementType: string, pluginId: string): any {
    const module: any = { exports: {} };
    const loadFn = new Function('module', 'exports', 'require', code);

    const mockRequire = (id: string) => {
        warnLegacyPluginImport(id);

        if (id === '@mvmnt/plugin-sdk') {
            // Inject a per-plugin loadBundledAsset bound to this plugin's asset registry.
            return {
                ...pluginSdkModule,
                loadBundledAsset: (path: string) => loadBundledAssetForPlugin(pluginId, path),
            };
        }

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

/**
 * Transform ES module syntax to CommonJS using an AST-based approach (meriyah).
 * Only invoked as a fallback when the primary CJS eval detects ESM syntax errors.
 */
function transformEsModuleToCommonJs(code: string): string {
    const ast = parseModule(code, { ranges: true } as any);

    // Collect patches: [start, end, replacement]. Applied in reverse position order.
    const patches: Array<[number, number, string]> = [];
    let importIndex = 0;

    const getRange = (node: any): [number, number] => node.range ?? [node.start, node.end];

    for (const node of (ast as any).body) {
        const [start, end] = getRange(node);

        if (node.type === 'ImportDeclaration') {
            // Skip type-only imports (TypeScript) — they have no runtime value
            if (node.importKind === 'type') continue;

            const src = node.source.value as string;

            if (node.specifiers.length === 0) {
                // import 'side-effect'
                patches.push([start, end, `require("${src}");`]);
            } else {
                const v = `__mvmnt_import_${importIndex++}`;
                const lines: string[] = [`const ${v} = require("${src}");`];

                for (const spec of node.specifiers) {
                    if (spec.type === 'ImportDefaultSpecifier') {
                        lines.push(`const ${spec.local.name} = ${v}.default !== undefined ? ${v}.default : ${v};`);
                    } else if (spec.type === 'ImportNamespaceSpecifier') {
                        lines.push(`const ${spec.local.name} = ${v};`);
                    } else {
                        // ImportSpecifier: import { foo as bar }
                        const imported = (spec.imported as any).name as string;
                        const local = spec.local.name as string;
                        lines.push(
                            imported === local
                                ? `const { ${imported} } = ${v};`
                                : `const { ${imported}: ${local} } = ${v};`
                        );
                    }
                }

                patches.push([start, end, lines.join('\n')]);
            }
        } else if (node.type === 'ExportDefaultDeclaration') {
            const decl = node.declaration as any;
            if ((decl.type === 'ClassDeclaration' || decl.type === 'FunctionDeclaration') && decl.id) {
                // Named class/function: keep the declaration, append exports assignment after.
                patches.push([start, start + 'export default '.length, '']);
                patches.push([end, end, `\nmodule.exports.default = ${decl.id.name as string};`]);
            } else {
                // Anonymous or expression: inline assignment.
                patches.push([start, start + 'export default '.length, 'module.exports.default = ']);
            }
        } else if (node.type === 'ExportNamedDeclaration') {
            const decl = (node as any).declaration;
            const specs = (node as any).specifiers as any[];
            const srcVal = (node as any).source?.value as string | undefined;

            if (decl) {
                // export const/let/var X, export function X, export class X
                const names: string[] = [];
                if (decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations) {
                        if (d.id.type === 'Identifier') names.push(d.id.name as string);
                    }
                } else if (
                    (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
                    decl.id
                ) {
                    names.push(decl.id.name as string);
                }
                // Remove 'export ' prefix; append exports assignments after the declaration.
                patches.push([start, start + 'export '.length, '']);
                if (names.length > 0) {
                    patches.push([end, end, '\n' + names.map((n) => `exports.${n} = ${n};`).join('\n')]);
                }
            } else if (specs.length > 0) {
                if (srcVal) {
                    // export { a, b } from 'source'
                    const v = `__mvmnt_import_${importIndex++}`;
                    const lines = [`const ${v} = require("${srcVal}");`];
                    for (const s of specs) {
                        const exp = (s.exported as any).name as string;
                        const loc = (s.local as any).name as string;
                        lines.push(
                            exp === 'default'
                                ? `module.exports.default = ${v}.${loc};`
                                : `exports.${exp} = ${v}.${loc};`
                        );
                    }
                    patches.push([start, end, lines.join('\n')]);
                } else {
                    // export { a, b as c }
                    const assignments = specs.map((s: any) => {
                        const exp = (s.exported as any).name as string;
                        const loc = (s.local as any).name as string;
                        return exp === 'default'
                            ? `module.exports.default = ${loc};`
                            : `exports.${exp} = ${loc};`;
                    });
                    patches.push([start, end, assignments.join('\n')]);
                }
            }
        } else if (node.type === 'ExportAllDeclaration') {
            // export * from 'source' / export * as ns from 'source'
            const srcVal = (node as any).source.value as string;
            const exported = (node as any).exported;
            const v = `__mvmnt_import_${importIndex++}`;
            if (exported) {
                patches.push([start, end, `const ${v} = require("${srcVal}");\nexports.${(exported as any).name as string} = ${v};`]);
            } else {
                patches.push([start, end, `Object.assign(exports, require("${srcVal}"));`]);
            }
        }
    }

    // Apply patches in reverse position order so earlier positions remain valid.
    patches.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let result = code;
    for (const [s, e, text] of patches) {
        result = result.slice(0, s) + text + result.slice(e);
    }
    return result;
}

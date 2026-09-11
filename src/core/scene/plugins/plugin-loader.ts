import { unzipSync } from 'fflate';
import { parseModule } from 'meriyah';
import { sceneElementRegistry } from '@core/scene/registry';
import * as pluginSdkRenderModule from '@core/scene/plugins/sdk/render';
import * as pluginSdkV2ApiModule from '../../../../packages/plugin-sdk/src/api';
import * as pluginSdkV2AnimationModule from '../../../../packages/plugin-sdk/src/animation';
import * as pluginSdkV2AudioModule from '../../../../packages/plugin-sdk/src/audio';
import * as pluginSdkV2SafetyModule from '../../../../packages/plugin-sdk/src/safety';
import * as pluginSdkV2TimelineModule from '../../../../packages/plugin-sdk/src/timeline';
import * as pluginSdkV2TimingModule from '../../../../packages/plugin-sdk/src/timing';
import * as pluginSdkV2UtilsModule from '../../../../packages/plugin-sdk/src/utils';
import * as pluginSdkV2SceneModule from '../../../../packages/plugin-sdk/src/scene';
import * as pluginSdkV2VisualAssetsModule from '../../../../packages/plugin-sdk/src/visual-assets';
import {
    ensureFontLoaded as ensureHostFontLoaded,
    parseFontSelection as parseHostFontSelection,
} from '@fonts/font-loader';
import { usePluginStore, type PluginManifest } from '@state/pluginStore';
import { PluginBinaryStore } from '@persistence/plugin-binary-store';
import { PluginSettingsStore } from '@persistence/plugin-settings-store';
import { satisfiesVersion } from './version-check';
import { registerElementAssetLoader } from './bundled-asset-registry';
import { isPluginElementDefinition } from '../../../../packages/plugin-sdk/src/scene';
import { createPluginDefinitionScope, type PluginDefinitionScope } from '@core/scene/runtime/definition-runtime';
import { normalizeElementCapabilities, validateArchivePaths, validatePluginManifest } from './plugin-contract';
import { createPluginHostServices } from './host-api/plugin-api';
import { validateSimulationDeterminism } from './simulation-determinism';

export type PluginHostErrorCode =
    'unsafe-archive' | 'invalid-manifest' | 'plugin-conflict' | 'element-registration' | 'storage' | 'host-runtime';

export interface PluginHostError {
    code: PluginHostErrorCode;
    message: string;
}

interface PluginLoadSuccess {
    success: true;
    error?: undefined;
    failure?: undefined;
    pluginId?: string;
    manifest?: PluginManifest;
    registeredTypes?: string[];
    /** Element types that failed to register (collision or code error), but did not abort the load. */
    skippedElements?: string[];
}

interface PluginLoadFailure {
    success: false;
    pluginId?: string;
    /** Manifest is populated once the bundle has been parsed. */
    manifest?: PluginManifest;
    error: string;
    failure: PluginHostError;
}

export type PluginLoadResult = PluginLoadSuccess | PluginLoadFailure;

function pluginLoadFailure(
    code: PluginHostErrorCode,
    message: string,
    context: Pick<PluginLoadFailure, 'pluginId' | 'manifest'> = {}
): PluginLoadFailure {
    return { success: false, ...context, error: message, failure: { code, message } };
}

export interface LoadPluginOptions {
    allowExistingPlugin?: boolean;
    /** Allow installing a bundle whose version is older than the currently installed one. */
    allowDowngrade?: boolean;
    /** Development bundles remain in memory and must not appear as installed plugins. */
    persist?: boolean;
    source?: 'installed' | 'development';
}

// V2 intentionally omits global capability accessors from domain modules. The current
// render/schema implementations are host-provided; definition callbacks receive data APIs.
const pluginSdkV2RenderModule = {
    RenderObject: pluginSdkRenderModule.RenderObject,
    BoxRenderObject: pluginSdkRenderModule.BoxRenderObject,
    EmptyRenderObject: pluginSdkRenderModule.EmptyRenderObject,
    Rectangle: pluginSdkRenderModule.Rectangle,
    Text: pluginSdkRenderModule.Text,
    Line: pluginSdkRenderModule.Line,
    Arc: pluginSdkRenderModule.Arc,
    Poly: pluginSdkRenderModule.Poly,
    BezierPath: pluginSdkRenderModule.BezierPath,
    GlowLayer: pluginSdkRenderModule.GlowLayer,
    CompositeLayer: pluginSdkRenderModule.CompositeLayer,
    ClipLayer: pluginSdkRenderModule.ClipLayer,
    VisualMedia: pluginSdkRenderModule.VisualMedia,
    PixelGrid: pluginSdkRenderModule.PixelGrid,
};
const pluginSdkV2UtilsRuntimeModule = Object.freeze({
    ...pluginSdkV2UtilsModule,
    ensureFontLoaded: ensureHostFontLoaded,
    parseFontSelection: parseHostFontSelection,
}) satisfies typeof pluginSdkV2UtilsModule;
const pluginSdkV2SceneRuntimeModule = Object.freeze({ ...pluginSdkV2SceneModule });
const pluginSdkV2RootModule = {
    ...pluginSdkV2ApiModule,
    ...pluginSdkV2AnimationModule,
    ...pluginSdkV2SceneRuntimeModule,
    ...pluginSdkV2SafetyModule,
    ...pluginSdkV2UtilsRuntimeModule,
};
const V2_PLUGIN_RUNTIME_MODULES: Record<string, unknown> = {
    '@mvmnt-app/plugin-sdk': Object.freeze({ ...pluginSdkV2RootModule }),
    '@mvmnt-app/plugin-sdk/api': pluginSdkV2ApiModule,
    '@mvmnt-app/plugin-sdk/animation': pluginSdkV2AnimationModule,
    '@mvmnt-app/plugin-sdk/audio': pluginSdkV2AudioModule,
    '@mvmnt-app/plugin-sdk/render': pluginSdkV2RenderModule,
    '@mvmnt-app/plugin-sdk/scene': pluginSdkV2SceneRuntimeModule,
    '@mvmnt-app/plugin-sdk/safety': pluginSdkV2SafetyModule,
    '@mvmnt-app/plugin-sdk/timeline': pluginSdkV2TimelineModule,
    '@mvmnt-app/plugin-sdk/timing': pluginSdkV2TimingModule,
    '@mvmnt-app/plugin-sdk/utils': pluginSdkV2UtilsRuntimeModule,
    '@mvmnt-app/plugin-sdk/visual-assets': pluginSdkV2VisualAssetsModule,
};

export function getPluginRuntimeModuleIds(): readonly string[] {
    return Object.freeze(Object.keys(V2_PLUGIN_RUNTIME_MODULES));
}

export function getPluginRuntimeExportNames(moduleId: string): readonly string[] {
    const runtimeModule = V2_PLUGIN_RUNTIME_MODULES[moduleId];
    return Object.freeze(runtimeModule && typeof runtimeModule === 'object' ? Object.keys(runtimeModule) : []);
}

const pluginDefinitionScopes = new Map<string, PluginDefinitionScope[]>();
const developmentPluginBundles = new Map<string, ArrayBuffer>();

/**
 * Returns the current development bundle for snapshot packaging. Development
 * plugins remain session-only: this cache is cleared when they are unloaded.
 */
export function getDevelopmentPluginBundle(pluginId: string): ArrayBuffer | undefined {
    if (usePluginStore.getState().plugins[pluginId]?.source !== 'development') return undefined;
    return developmentPluginBundles.get(pluginId)?.slice(0);
}

async function disposePluginDefinitionScopes(pluginId: string): Promise<void> {
    const scopes = pluginDefinitionScopes.get(pluginId) ?? [];
    pluginDefinitionScopes.delete(pluginId);
    await Promise.allSettled(scopes.map((scope) => scope.dispose()));
}

const pluginHostServices = createPluginHostServices().services;

// ---------------------------------------------------------------------------
// Asset registry
// ---------------------------------------------------------------------------
// Stores per-plugin bundled asset bytes, keyed by path relative to assets/ dir.
const pluginAssetRegistry = new Map<string, Map<string, Uint8Array>>();
// Blob URLs created for assets — revoked when the plugin is fully unloaded.
const pluginBlobUrls = new Map<string, string[]>();

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
export async function loadPlugin(bundleData: ArrayBuffer, options: LoadPluginOptions = {}): Promise<PluginLoadResult> {
    try {
        // Unzip the bundle
        const uint8Data = new Uint8Array(bundleData);
        const files = unzipSync(uint8Data);
        const archivePathErrors = validateArchivePaths(Object.keys(files));
        if (archivePathErrors.length > 0) return pluginLoadFailure('unsafe-archive', archivePathErrors.join('; '));

        // Read manifest
        const manifestData = files['manifest.json'];
        if (!manifestData) {
            return pluginLoadFailure('invalid-manifest', 'Missing manifest.json in plugin bundle');
        }

        const manifestText = new TextDecoder().decode(manifestData);
        const manifest: PluginManifest = JSON.parse(manifestText);

        // Validate manifest
        const validationErrors = validatePluginManifest(manifest);
        if (validationErrors.length > 0) {
            return pluginLoadFailure('invalid-manifest', validationErrors.join('; '));
        }

        // validatePluginManifest already enforces the supported SDK 2 range.

        // Check if plugin is already loaded
        const existingPlugin = usePluginStore.getState().plugins[manifest.id];
        if (existingPlugin && !options.allowExistingPlugin) {
            return pluginLoadFailure('plugin-conflict', `Plugin '${manifest.id}' is already loaded`, {
                manifest,
                pluginId: manifest.id,
            });
        }

        // Downgrade guard: reject if the incoming bundle is older than what's installed
        if (existingPlugin && !options.allowDowngrade) {
            if (!satisfiesVersion(manifest.version, `>=${existingPlugin.manifest.version}`)) {
                return pluginLoadFailure(
                    'plugin-conflict',
                    `Cannot install plugin '${manifest.id}' v${manifest.version}: ` +
                        `installed version v${existingPlugin.manifest.version} is newer. ` +
                        `Use upgradePlugin() to upgrade.`,
                    { manifest, pluginId: manifest.id }
                );
            }
        }

        const persist = options.persist ?? true;
        const source = options.source ?? 'installed';

        // Development bundles are deliberately session-only.
        if (persist) await PluginBinaryStore.put(manifest.id, bundleData);

        // Register bundled assets so elements can load them via loadBundledAsset()
        registerPluginAssets(manifest.id, files as Record<string, Uint8Array>);

        // Load and register each element
        const registeredTypes: string[] = [];
        const loadErrors: string[] = [];
        const skippedElements: string[] = [];

        for (const elementManifest of manifest.elements) {
            let definitionScope: PluginDefinitionScope | undefined;
            try {
                const available = new Set(pluginHostServices.capabilities);
                const missing = (normalizeElementCapabilities(elementManifest).required ?? []).filter(
                    (capability) => !available.has(capability as any)
                );
                if (missing.length > 0) {
                    loadErrors.push(
                        `Element '${elementManifest.type}' requires unavailable capabilities: ${missing.join(', ')}`
                    );
                    skippedElements.push(elementManifest.type);
                    continue;
                }
                // Get the bundled element code
                const entryData = files[elementManifest.entry];
                if (!entryData) {
                    loadErrors.push(
                        `Missing entry file '${elementManifest.entry}' for element '${elementManifest.type}'`
                    );
                    skippedElements.push(elementManifest.type);
                    continue;
                }

                const code = new TextDecoder().decode(entryData);

                const loadedExport = await loadElementFromCode(code, elementManifest.type);
                if (!isPluginElementDefinition(loadedExport)) {
                    throw new Error(`SDK 2 element '${elementManifest.type}' must export definePluginElement(...)`);
                }
                if (loadedExport.type !== elementManifest.type) {
                    throw new Error(
                        `Definition type '${loadedExport.type}' does not match manifest type '${elementManifest.type}'`
                    );
                }
                validateSimulationDeterminism(loadedExport);
                const scope = createPluginDefinitionScope(loadedExport, {
                    pluginId: manifest.id,
                    runtimeElementType: `${manifest.id}:${elementManifest.type}`,
                    services: pluginHostServices,
                    capabilities: normalizeElementCapabilities(elementManifest),
                    loadAsset: (path) => loadBundledAssetForPlugin(manifest.id, path),
                    report: (diagnostic) =>
                        console.warn(
                            `[PluginLoader] ${manifest.id}/${elementManifest.type}: ${diagnostic.code}: ${diagnostic.message}`
                        ),
                });
                if (!(await scope.ready)) throw new Error(scope.failure?.message ?? 'Definition load failed');
                definitionScope = scope;
                const registration = scope.createRegistration({ kind: 'plugin', pluginId: manifest.id }, manifest.name);
                const registryKey = sceneElementRegistry.register(registration);

                // Wire loadBundledAsset() for this element type.
                const pluginId = manifest.id;
                registerElementAssetLoader(registryKey, (path) => loadBundledAssetForPlugin(pluginId, path));

                if (definitionScope) {
                    const scopes = pluginDefinitionScopes.get(manifest.id) ?? [];
                    scopes.push(definitionScope);
                    pluginDefinitionScopes.set(manifest.id, scopes);
                }

                registeredTypes.push(registryKey);
            } catch (error) {
                if (definitionScope) await definitionScope.dispose();
                const errorMsg = error instanceof Error ? error.message : String(error);
                loadErrors.push(`Failed to load element '${elementManifest.type}': ${errorMsg}`);
                skippedElements.push(elementManifest.type);
            }
        }

        // If all elements failed to load, consider it a failure
        if (registeredTypes.length === 0) {
            await disposePluginDefinitionScopes(manifest.id);
            revokePluginAssets(manifest.id);
            if (persist) await PluginBinaryStore.delete(manifest.id);
            return pluginLoadFailure(
                'element-registration',
                `No elements could be loaded. Errors: ${loadErrors.join('; ')}`,
                { manifest, pluginId: manifest.id }
            );
        }

        // Add to plugin store
        usePluginStore.getState().addPlugin(manifest, true, source);
        if (source === 'development') developmentPluginBundles.set(manifest.id, bundleData.slice(0));

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
        return pluginLoadFailure('host-runtime', `Failed to load plugin: ${errorMsg}`);
    }
}

/**
 * Unload a plugin and unregister its elements
 */
export async function unloadPlugin(
    pluginId: string,
    options: { removePersisted?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
    try {
        const plugin = usePluginStore.getState().plugins[pluginId];
        if (!plugin) {
            return { success: false, error: `Plugin '${pluginId}' is not loaded` };
        }

        // Unregister all elements from the registry
        const unregistered = sceneElementRegistry.unregisterPlugin(pluginId);
        await disposePluginDefinitionScopes(pluginId);

        // Remove from plugin store
        usePluginStore.getState().removePlugin(pluginId);
        developmentPluginBundles.delete(pluginId);

        // Development bundles never own persistent storage. Callers may also
        // request a runtime-only teardown while performing a hot replacement.
        if (options.removePersisted ?? plugin.source !== 'development') {
            await PluginBinaryStore.delete(pluginId);
            PluginSettingsStore.removeEntry(pluginId);
        }

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
        return pluginLoadFailure('host-runtime', errorMsg);
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
        await disposePluginDefinitionScopes(pluginId);
        revokePluginAssets(pluginId);
        usePluginStore.getState().disablePlugin(pluginId);
        if (plugin.source !== 'development') PluginSettingsStore.setEnabled(pluginId, false);

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
        return pluginLoadFailure('storage', errorMsg, { pluginId });
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
        const archivePathErrors = validateArchivePaths(Object.keys(files));
        if (archivePathErrors.length > 0) return pluginLoadFailure('unsafe-archive', archivePathErrors.join('; '));

        const manifestData = files['manifest.json'];
        if (!manifestData) {
            return pluginLoadFailure('invalid-manifest', 'Missing manifest.json in plugin bundle');
        }

        const manifestText = new TextDecoder().decode(manifestData);
        const manifest: PluginManifest = JSON.parse(manifestText);

        const validationErrors = validatePluginManifest(manifest);
        if (validationErrors.length > 0) {
            return pluginLoadFailure('invalid-manifest', validationErrors.join('; '), { manifest });
        }

        const existingPlugin = usePluginStore.getState().plugins[manifest.id];
        if (existingPlugin) {
            const isNewer = satisfiesVersion(manifest.version, `>${existingPlugin.manifest.version}`);
            if (!isNewer) {
                return pluginLoadFailure(
                    'plugin-conflict',
                    `Cannot upgrade '${manifest.id}': ` +
                        `incoming version v${manifest.version} is not newer than ` +
                        `installed v${existingPlugin.manifest.version}`,
                    { manifest, pluginId: manifest.id }
                );
            }
            // Unload the old version before installing the new one
            await unloadPlugin(manifest.id);
        }

        return await loadPlugin(bundleData);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return pluginLoadFailure('host-runtime', `Failed to upgrade plugin: ${errorMsg}`);
    }
}

/**
 * Reload a plugin from storage for an explicit re-enable operation.
 */
export async function reloadPluginFromStorage(
    pluginId: string,
    options: Pick<LoadPluginOptions, 'allowExistingPlugin'> = {}
): Promise<PluginLoadResult> {
    try {
        const bundleData = await PluginBinaryStore.get(pluginId);
        if (!bundleData) {
            return pluginLoadFailure('storage', `Plugin '${pluginId}' not found in storage`, { pluginId });
        }

        return await loadPlugin(bundleData, {
            allowExistingPlugin: options.allowExistingPlugin,
            // Re-check the version when restoring a stored plugin after a host update.
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return pluginLoadFailure('storage', errorMsg, { pluginId });
    }
}

/**
 * Validate plugin manifest structure
 */
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
        const directModule = V2_PLUGIN_RUNTIME_MODULES[id];
        if (directModule) {
            return directModule;
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
    if (isPluginElementDefinition(exportsObj)) return exportsObj;
    if (typeof exportsObj === 'function') return exportsObj;
    if (exportsObj.default) return exportsObj.default;
    if (exportsObj[elementType]) return exportsObj[elementType];

    const definition = Object.values(exportsObj).find(isPluginElementDefinition);
    if (definition) return definition;

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
                } else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
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
                        return exp === 'default' ? `module.exports.default = ${loc};` : `exports.${exp} = ${loc};`;
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
                patches.push([
                    start,
                    end,
                    `const ${v} = require("${srcVal}");\nexports.${(exported as any).name as string} = ${v};`,
                ]);
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

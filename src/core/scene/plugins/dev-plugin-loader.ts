/**
 * Development Plugin Loader
 * 
 * Loads custom element plugins from the src/plugins/ directory during development.
 * This provides a preview of the Phase 3 runtime loading system.
 * 
 * Features:
 * - Scans src/plugins/ directory for plugin.json files
 * - Dynamically imports element modules
 * - Registers elements using the central registry
 * - Logs errors without crashing the app
 * 
 * @module dev-plugin-loader
 */

import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { debugLog } from '@utils/debug-log';

interface PluginManifest {
    id: string;
    name: string;
    version: string;
    mvmntVersion: string;
    description?: string;
    author?: string;
    elements: PluginElementDefinition[];
}

interface PluginElementDefinition {
    type: string;
    name: string;
    category: string;
    description?: string;
    entry: string;
    capabilities?: string[];
}

interface LoadResult {
    success: boolean;
    pluginId: string;
    pluginName: string;
    elementsLoaded: number;
    errors: string[];
}

/**
 * Path configuration for plugin loading
 */
const PLUGIN_BASE_PATH = '/src/plugins';

/**
 * Check if we're in a dev environment where we can load plugins
 */
function isDevEnvironment(): boolean {
    // Only load dev plugins in development mode
    return import.meta.env?.DEV === true;
}

/**
 * Validate plugin manifest structure
 */
function validateManifest(manifest: any): manifest is PluginManifest {
    if (!manifest || typeof manifest !== 'object') {
        return false;
    }
    
    if (typeof manifest.id !== 'string' || manifest.id.length < 3) {
        return false;
    }
    
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
        return false;
    }
    
    if (typeof manifest.version !== 'string') {
        return false;
    }
    
    if (typeof manifest.mvmntVersion !== 'string') {
        return false;
    }
    
    if (!Array.isArray(manifest.elements) || manifest.elements.length === 0) {
        return false;
    }
    
    for (const element of manifest.elements) {
        if (!element.type || !element.name || !element.category || !element.entry) {
            return false;
        }
    }
    
    return true;
}

/**
 * Load a plugin manifest from a JSON file
 */
async function loadPluginManifest(pluginPath: string): Promise<PluginManifest | null> {
    try {
        const manifestUrl = `${pluginPath}/plugin.json`;
        const response = await fetch(manifestUrl);
        
        if (!response.ok) {
            return null;
        }
        
        const manifest = await response.json();
        
        if (!validateManifest(manifest)) {
            console.error(`[DevPluginLoader] Invalid manifest structure in ${pluginPath}`);
            return null;
        }
        
        return manifest;
    } catch (error) {
        // Plugin doesn't exist or can't be loaded - this is expected for many potential paths
        return null;
    }
}

/**
 * Load and register a single element from a plugin
 */
async function loadElement(
    pluginPath: string,
    element: PluginElementDefinition,
    pluginId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Construct the module path
        // In dev mode, import .ts files directly (Vite transpiles on-the-fly)
        // In production (for bundled .mvmnt-plugin files), use .js
        const entryFile = isDevEnvironment() 
            ? element.entry 
            : element.entry.replace('.ts', '.js');
        const modulePath = `${pluginPath}/${entryFile}`;
        
        debugLog(`[DevPluginLoader] Importing element module: ${modulePath}`);
        
        // Dynamically import the element module
        const module = await import(/* @vite-ignore */ modulePath);
        
        // Find the exported element class
        // Try common export patterns
        const elementKey = Object.keys(module).find(key => key.endsWith('Element'));
        const ElementClass = 
            module.default || 
            (elementKey ? module[elementKey] : null) ||
            module[Object.keys(module)[0]];
        
        if (!ElementClass) {
            return {
                success: false,
                error: `No element class found in ${element.entry}`
            };
        }
        
        // Check if it has the required getConfigSchema method
        if (typeof ElementClass.getConfigSchema !== 'function') {
            return {
                success: false,
                error: `Element class missing getConfigSchema() method`
            };
        }
        
        // Register the element with the registry
        sceneElementRegistry.registerElementFromClass(element.type, ElementClass);
        
        debugLog(`[DevPluginLoader] Registered element: ${element.type} from plugin ${pluginId}`);
        
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[DevPluginLoader] Failed to load element ${element.type}:`, error);
        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Load a single plugin
 */
async function loadPlugin(pluginPath: string): Promise<LoadResult | null> {
    const manifest = await loadPluginManifest(pluginPath);
    
    if (!manifest) {
        return null;
    }
    
    console.log(`[DevPluginLoader] Loading plugin: ${manifest.name} (${manifest.id})`);
    
    const errors: string[] = [];
    let elementsLoaded = 0;
    
    // Load each element
    for (const element of manifest.elements) {
        const result = await loadElement(pluginPath, element, manifest.id);
        
        if (result.success) {
            elementsLoaded++;
        } else if (result.error) {
            errors.push(`${element.type}: ${result.error}`);
        }
    }
    
    return {
        success: elementsLoaded > 0,
        pluginId: manifest.id,
        pluginName: manifest.name,
        elementsLoaded,
        errors
    };
}

/**
 * Discover available plugins by scanning the src/plugins directory
 * 
 * Uses Vite's import.meta.glob to discover all plugin.json files at build time.
 */
async function discoverPlugins(): Promise<string[]> {
    const discoveredPlugins: string[] = [];
    
    try {
        // Use Vite's import.meta.glob to discover all plugin.json files
        // This works at build time and is safe for both dev and production
        const pluginManifests = import.meta.glob('/src/plugins/*/plugin.json', { eager: false });
        
        // Extract plugin paths from the manifest paths
        for (const manifestPath of Object.keys(pluginManifests)) {
            // Extract plugin directory name from path like "/src/plugins/myplugin/plugin.json"
            const match = manifestPath.match(/\/src\/plugins\/([\w.-]+)\/plugin\.json$/);
            if (match) {
                const pluginId = match[1];
                const pluginPath = `${PLUGIN_BASE_PATH}/${pluginId}`;
                discoveredPlugins.push(pluginPath);
            }
        }
        
        debugLog(`[DevPluginLoader] Discovered ${discoveredPlugins.length} plugin(s)`);
    } catch (error) {
        console.error('[DevPluginLoader] Error discovering plugins:', error);
    }
    
    return discoveredPlugins;
}

/**
 * Load all dev plugins
 * 
 * This is the main entry point for loading development plugins.
 * Call this during app initialization to load custom elements.
 */
export async function loadDevPlugins(): Promise<void> {
    if (!isDevEnvironment()) {
        debugLog('[DevPluginLoader] Not in dev environment, skipping plugin loading');
        return;
    }
    
    console.log('[DevPluginLoader] Initializing development plugin loader...');
    
    try {
        const pluginPaths = await discoverPlugins();
        
        if (pluginPaths.length === 0) {
            debugLog('[DevPluginLoader] No plugins discovered');
            return;
        }
        
        const results: LoadResult[] = [];
        
        for (const pluginPath of pluginPaths) {
            const result = await loadPlugin(pluginPath);
            if (result) {
                results.push(result);
            }
        }
        
        // Log summary
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        if (successful.length > 0) {
            console.log(`[DevPluginLoader] Successfully loaded ${successful.length} plugin(s):`);
            successful.forEach(r => {
                console.log(`  ✓ ${r.pluginName}: ${r.elementsLoaded} element(s)`);
            });
        }
        
        if (failed.length > 0) {
            console.warn(`[DevPluginLoader] Failed to load ${failed.length} plugin(s):`);
            failed.forEach(r => {
                console.warn(`  ✗ ${r.pluginName}`);
                r.errors.forEach(err => console.warn(`    - ${err}`));
            });
        }
        
        if (successful.length === 0 && failed.length === 0) {
            debugLog('[DevPluginLoader] No plugins found');
        }
    } catch (error) {
        console.error('[DevPluginLoader] Failed to load plugins:', error);
    }
}

/**
 * Manually load a specific plugin by path
 * 
 * Useful for testing or explicit plugin loading
 */
export async function loadDevPlugin(pluginId: string): Promise<LoadResult | null> {
    if (!isDevEnvironment()) {
        console.warn('[DevPluginLoader] Not in dev environment');
        return null;
    }
    
    const pluginPath = `${PLUGIN_BASE_PATH}/${pluginId.split('.').pop()}`;
    return await loadPlugin(pluginPath);
}

/**
 * Get registry for testing purposes
 */
export function getRegistry() {
    return sceneElementRegistry;
}

/**
 * Per-element-type asset loader registry.
 *
 * Both plugin-loader.ts (production ZIP path) and dev-plugin-loader.ts (Vite native import
 * path) register a loader here for each element type they load. SceneElement.loadBundledAsset
 * calls loadBundledAssetForElement(this.type, path) via a direct import — no require() needed
 * and no circular dependency.
 */

const elementAssetLoaders = new Map<string, (path: string) => Promise<string>>();

export function registerElementAssetLoader(
    elementType: string,
    loader: (path: string) => Promise<string>
): void {
    elementAssetLoaders.set(elementType, loader);
}

export function loadBundledAssetForElement(elementType: string, assetPath: string): Promise<string> {
    const loader = elementAssetLoaders.get(elementType);
    if (!loader) {
        return Promise.reject(
            new Error(
                `[PluginLoader] loadBundledAsset() called from element '${elementType}' but no asset loader is registered. ` +
                `Ensure the plugin ZIP contains an assets/ directory with the requested file.`
            )
        );
    }
    return loader(assetPath);
}

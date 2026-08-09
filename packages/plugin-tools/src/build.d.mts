export interface PluginBuildResult {
    manifest: any;
    bundledManifest: any;
    bytes: Buffer;
}
export function buildPluginArchive(pluginDirectory: string, options?: { minify?: boolean }): Promise<PluginBuildResult>;
export function writePluginArchive(
    pluginDirectory: string,
    outputPath?: string
): Promise<PluginBuildResult & { outputPath: string }>;

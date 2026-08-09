export const SDK_RUNTIME_MODULES: readonly string[];
export const SDK_CAPABILITIES: readonly string[];
export function extractModuleSpecifiers(source: string): string[];
export function validateElementImports(source: string, label: string): string[];
export function validateCapabilityDeclaration(value: unknown, label: string): string[];
export function validateManifest(manifest: unknown, pluginDirectory?: string): string[];
export function readAndValidatePlugin(pluginDirectory: string): any;

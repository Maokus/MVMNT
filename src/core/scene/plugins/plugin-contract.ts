import sdkManifest from '../../../../packages/plugin-sdk/sdk-manifest.json';
import type { PluginElementManifest, PluginManifest } from '@state/pluginStore';
import { satisfiesVersion } from './version-check';

export const SDK_RUNTIME_MODULE_IDS = Object.freeze([...sdkManifest.runtimeModules]);
export const SDK_CAPABILITIES = Object.freeze([...sdkManifest.capabilities]);
export const SUPPORTED_API_RANGE = '^2.0.0';

const validArchivePath = (value: string): boolean =>
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !value.split(/[\\/]/).includes('..');

export function validateArchivePaths(paths: readonly string[]): string[] {
    return paths
        .filter((path) => !validArchivePath(path))
        .map((path) => `Unsafe plugin archive path '${path}'`);
}

export function supportsPluginApiRange(range: string): boolean {
    return satisfiesVersion('2.0.0', range);
}

export function normalizeElementCapabilities(element: PluginElementManifest): {
    required: string[];
    optional: string[];
} {
    return {
        required: [...(element.capabilities?.required ?? [])],
        optional: [...(element.capabilities?.optional ?? [])],
    };
}

export function validateCapabilityDeclaration(capabilities: unknown, label: string): string[] {
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
        return [`${label}: capabilities must be an object with required and optional arrays`];
    }
    const value = capabilities as { required?: unknown; optional?: unknown };
    const required = value.required ?? [];
    const optional = value.optional ?? [];
    if (!Array.isArray(required) || !Array.isArray(optional)) {
        return [`${label}: capabilities.required and capabilities.optional must be arrays`];
    }
    const all = [...required, ...optional];
    const errors: string[] = [];
    for (const capability of all) {
        if (typeof capability !== 'string' || !SDK_CAPABILITIES.includes(capability as any)) {
            errors.push(`${label}: unknown capability '${String(capability)}'`);
        }
    }
    if (new Set(all).size !== all.length) errors.push(`${label}: capability declarations contain duplicates`);
    return errors;
}

export function validatePluginManifest(manifest: unknown): string[] {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['Invalid manifest: not an object'];
    const value = manifest as Partial<PluginManifest>;
    const errors: string[] = [];
    for (const field of ['id', 'name', 'version'] as const) {
        if (!value[field] || typeof value[field] !== 'string') errors.push(`Invalid manifest: missing required field '${field}'`);
    }
    const range = value.apiVersion;
    if (!range) errors.push("Invalid manifest: missing required field 'apiVersion'");
    else if (!supportsPluginApiRange(range))
        errors.push(`Unsupported plugin API range '${range}'. MVMNT requires ${SUPPORTED_API_RANGE}`);
    if (!Array.isArray(value.elements) || value.elements.length === 0) {
        errors.push('Invalid manifest: elements must be a non-empty array');
        return errors;
    }
    const types = new Set<string>();
    value.elements.forEach((element, index) => {
        const label = `Element ${index + 1}`;
        if (!element?.type || typeof element.type !== 'string') errors.push(`${label}: missing type`);
        else if (types.has(element.type)) errors.push(`${label}: duplicate type '${element.type}'`);
        else types.add(element.type);
        if (!element?.entry || typeof element.entry !== 'string') errors.push(`${label}: missing entry`);
        else if (!validArchivePath(element.entry)) errors.push(`${label}: entry must be a safe relative archive path`);
        errors.push(...validateCapabilityDeclaration(element?.capabilities, label));
    });
    return errors;
}

export function capabilityDeclarationsMatch(
    manifest: PluginElementManifest,
    definition: { capabilities?: { required?: readonly string[]; optional?: readonly string[] } },
): boolean {
    const expected = normalizeElementCapabilities(manifest);
    const actual = {
        required: [...(definition.capabilities?.required ?? [])],
        optional: [...(definition.capabilities?.optional ?? [])],
    };
    return expected.required.length === actual.required.length &&
        expected.optional.length === actual.optional.length &&
        expected.required.every((value, index) => value === actual.required[index]) &&
        expected.optional.every((value, index) => value === actual.optional[index]);
}

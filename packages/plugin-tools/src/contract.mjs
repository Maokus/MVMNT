import fs from 'node:fs';
import path from 'node:path';
import { isValidPluginId, targetsSdk2 } from '@mvmnt-app/plugin-contract';

export const SDK_RUNTIME_MODULES = Object.freeze([
    '@mvmnt-app/plugin-sdk',
    '@mvmnt-app/plugin-sdk/api',
    '@mvmnt-app/plugin-sdk/animation',
    '@mvmnt-app/plugin-sdk/audio',
    '@mvmnt-app/plugin-sdk/render',
    '@mvmnt-app/plugin-sdk/scene',
    '@mvmnt-app/plugin-sdk/safety',
    '@mvmnt-app/plugin-sdk/timeline',
    '@mvmnt-app/plugin-sdk/timing',
    '@mvmnt-app/plugin-sdk/utils',
    '@mvmnt-app/plugin-sdk/visual-assets',
]);

export const SDK_CAPABILITIES = Object.freeze([
    'timeline.read',
    'audio.features.read',
    'audio.raw.read',
    'timing.conversion',
    'midi.utils',
    'audio.calculators.register',
]);

const PRIVATE_PREFIXES = [
    '@core/',
    '@audio/',
    '@utils/',
    '@state/',
    '@selectors/',
    '@persistence/',
    '@constants/',
    '@types/',
    '@app/',
    '@workspace/',
    '@context/',
    '@fonts/',
    '@assets/',
    '@export/',
    '@bindings/',
    '@math/',
    '@pages/',
    '@devtools/',
    '@config/',
];

export function extractModuleSpecifiers(source) {
    const found = new Set();
    for (const pattern of [
        /import\s+[^'"\n]+\s+from\s+['"]([^'"\n]+)['"]/g,
        /import\s+['"]([^'"\n]+)['"]/g,
        /require\(\s*['"]([^'"\n]+)['"]\s*\)/g,
        /import\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    ]) {
        let match;
        while ((match = pattern.exec(source))) found.add(match[1]);
    }
    return [...found];
}

export function validateElementImports(source, label) {
    const errors = [];
    for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
        if (SDK_RUNTIME_MODULES.includes(specifier)) continue;
        if (specifier === '@mvmnt/plugin-sdk' || specifier.startsWith('@mvmnt/plugin-sdk/')) {
            errors.push(`${label}: use '@mvmnt-app/plugin-sdk', not '${specifier}'`);
        } else if (PRIVATE_PREFIXES.some((prefix) => specifier.startsWith(prefix))) {
            errors.push(`${label}: import '${specifier}' is application-private`);
        }
    }
    return errors;
}

export function validateCapabilityDeclaration(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [`${label}: capabilities must contain required and optional arrays`];
    const required = value.required ?? [];
    const optional = value.optional ?? [];
    if (!Array.isArray(required) || !Array.isArray(optional)) return [`${label}: capability lists must be arrays`];
    const all = [...required, ...optional];
    const errors = all
        .filter((capability) => !SDK_CAPABILITIES.includes(capability))
        .map((capability) => `${label}: unknown capability '${capability}'`);
    if (new Set(all).size !== all.length) errors.push(`${label}: duplicate capability declaration`);
    return errors;
}

export function validateManifest(manifest, pluginDirectory) {
    const errors = [];
    if (!isValidPluginId(manifest?.id)) errors.push('Missing or invalid "id" field');
    if (!manifest?.name || typeof manifest.name !== 'string') errors.push('Missing or invalid "name" field');
    if (!manifest?.version || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(manifest.version))
        errors.push('Missing or invalid semantic "version" field');
    if (!targetsSdk2(manifest?.apiVersion)) errors.push('"apiVersion" must target SDK 2');
    if (!Array.isArray(manifest?.elements) || !manifest.elements.length)
        return [...errors, 'Missing or empty "elements" array'];
    const types = new Set();
    for (const [index, element] of manifest.elements.entries()) {
        const label = `Element ${index + 1}`;
        if (!element.type || !/^[a-z][a-z0-9-]*$/.test(element.type)) errors.push(`${label}: invalid type`);
        else if (types.has(element.type)) errors.push(`${label}: duplicate type '${element.type}'`);
        else types.add(element.type);
        if (!element.entry || !/\.(?:js|mjs|ts|tsx)$/.test(element.entry)) errors.push(`${label}: invalid entry`);
        else if (path.isAbsolute(element.entry) || element.entry.split(/[\\/]/).includes('..'))
            errors.push(`${label}: unsafe entry path`);
        else if (pluginDirectory && !fs.existsSync(path.join(pluginDirectory, element.entry)))
            errors.push(`${label}: entry not found: ${element.entry}`);
        errors.push(...validateCapabilityDeclaration(element.capabilities, label));
    }
    return errors;
}

export function readAndValidatePlugin(pluginDirectory) {
    const manifestPath = path.join(pluginDirectory, 'plugin.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`plugin.json not found in ${pluginDirectory}`);
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        throw new Error(`Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const errors = validateManifest(manifest, pluginDirectory);
    for (const element of manifest.elements ?? []) {
        const entry = path.join(pluginDirectory, element.entry ?? '');
        if (fs.existsSync(entry)) errors.push(...validateElementImports(fs.readFileSync(entry, 'utf8'), element.type));
    }
    if (errors.length) throw new Error(errors.join('\n  - '));
    return manifest;
}

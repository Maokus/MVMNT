import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const sdkManifest = Object.freeze(JSON.parse(
    fs.readFileSync(path.resolve(here, '../packages/plugin-sdk/sdk-manifest.json'), 'utf8')
));

export const SDK_RUNTIME_MODULES = Object.freeze([...sdkManifest.runtimeModules]);
export const PLUGIN_EXTERNALS = Object.freeze([
    ...SDK_RUNTIME_MODULES,
]);

const PRIVATE_PREFIXES = [
    '@core/', '@audio/', '@utils/', '@state/', '@selectors/', '@persistence/',
    '@constants/', '@types/', '@app/', '@workspace/', '@context/', '@fonts/',
    '@assets/', '@export/', '@bindings/', '@math/', '@pages/', '@devtools/', '@config/',
];

export function extractModuleSpecifiers(sourceCode) {
    const specifiers = new Set();
    const patterns = [
        /import\s+[^'"\n]+\s+from\s+['"]([^'"\n]+)['"]/g,
        /import\s+['"]([^'"\n]+)['"]/g,
        /require\(\s*['"]([^'"\n]+)['"]\s*\)/g,
        /import\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(sourceCode))) specifiers.add(match[1]);
    }
    return [...specifiers];
}

export function validateElementImports(sourceCode, elementName) {
    const errors = [];
    const warnings = [];
    for (const specifier of extractModuleSpecifiers(sourceCode)) {
        if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
        if (PLUGIN_EXTERNALS.includes(specifier)) continue;
        if (specifier === '@mvmnt/plugin-sdk' || specifier.startsWith('@mvmnt/plugin-sdk/')) {
            errors.push(`${elementName}: SDK 2 plugins must import '@mvmnt-app/plugin-sdk', not '${specifier}'.`);
            continue;
        }
        if (PRIVATE_PREFIXES.some((prefix) => specifier.startsWith(prefix))) {
            errors.push(`${elementName}: Import '${specifier}' is application-private. Use '@mvmnt-app/plugin-sdk'.`);
        }
    }
    return { errors, warnings };
}

export function validateCapabilityDeclaration(capabilities, label) {
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
        return [`${label}: capabilities must contain required and optional arrays`];
    }
    const required = capabilities.required ?? [];
    const optional = capabilities.optional ?? [];
    if (!Array.isArray(required) || !Array.isArray(optional)) return [`${label}: capability lists must be arrays`];
    const all = [...required, ...optional];
    const errors = all
        .filter((capability) => !sdkManifest.capabilities.includes(capability))
        .map((capability) => `${label}: unknown capability '${capability}'`);
    if (new Set(all).size !== all.length) errors.push(`${label}: duplicate capability declaration`);
    return errors;
}

export function validateManifestContract(manifest, pluginDir, builtInTypes = []) {
    const errors = [];
    if (!manifest?.id || !/^[a-z0-9.-]{3,}$/.test(manifest.id)) errors.push('Missing or invalid "id" field');
    if (!manifest?.name || typeof manifest.name !== 'string') errors.push('Missing or invalid "name" field');
    if (!manifest?.version || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(manifest.version)) errors.push('Missing or invalid semantic "version" field');
    if (!manifest?.apiVersion) errors.push('Missing "apiVersion" field');
    else if (!/(?:\^|>=)?2\./.test(manifest.apiVersion)) errors.push('"apiVersion" must target SDK 2');
    if (!Array.isArray(manifest?.elements) || manifest.elements.length === 0) return [...errors, 'Missing or empty "elements" array'];
    const types = new Set();
    manifest.elements.forEach((element, index) => {
        const label = `Element ${index + 1}`;
        if (!element.type || !/^[a-z][a-z0-9-]*$/.test(element.type)) errors.push(`${label}: invalid type`);
        else if (types.has(element.type)) errors.push(`${label}: duplicate type '${element.type}'`);
        else if (builtInTypes.includes(element.type)) errors.push(`${label}: type conflicts with a built-in element`);
        else types.add(element.type);
        if (!element.entry || !/\.(?:js|mjs|ts)$/.test(element.entry)) errors.push(`${label}: invalid entry`);
        else if (path.isAbsolute(element.entry) || element.entry.split(/[\\/]/).includes('..')) errors.push(`${label}: unsafe entry path`);
        else if (pluginDir && !fs.existsSync(path.join(pluginDir, element.entry))) errors.push(`${label}: entry not found: ${element.entry}`);
        errors.push(...validateCapabilityDeclaration(element.capabilities, label));
    });
    return errors;
}

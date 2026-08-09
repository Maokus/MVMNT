#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = resolve(packageRoot, 'templates');

// Keep source and manifest requirements together so every generated element passes
// the plugin contract's exact capability matching check.
const templateCapabilities = Object.freeze({
    'audio-reactive': { required: ['audio.raw.read'], optional: [] },
    'basic-shape': { required: [], optional: [] },
    'bundled-image': { required: [], optional: [] },
    'grid-atlas': { required: [], optional: [] },
    'image-atlas': { required: [], optional: [] },
    'image-simple': { required: [], optional: [] },
    'midi-notes': { required: ['timeline.read', 'midi.utils'], optional: [] },
    minimal: { required: [], optional: [] },
    'text-display': { required: [], optional: [] },
});

const discoveredTemplateNames = readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const missingDescriptors = discoveredTemplateNames.filter((name) => !templateCapabilities[name]);
const missingTemplates = Object.keys(templateCapabilities).filter((name) => !discoveredTemplateNames.includes(name));
if (missingDescriptors.length || missingTemplates.length) {
    throw new Error(
        [
            missingDescriptors.length
                ? `Templates missing capability descriptors: ${missingDescriptors.join(', ')}`
                : '',
            missingTemplates.length ? `Capability descriptors missing templates: ${missingTemplates.join(', ')}` : '',
        ]
            .filter(Boolean)
            .join('. ')
    );
}
const templateNames = Object.keys(templateCapabilities).sort();

function usage() {
    return `Usage:
  npm create mvmnt-plugin@latest -- [create] [options]
  npm create mvmnt-plugin@latest -- add [element-type] [options]

Create options:
  --name <plugin-id>       Plugin ID, for example com.example.pulse
  --plugin-name <name>     Plugin display name (defaults from the plugin ID)
  --element-name <name>    First element display name (defaults from its type)
  --description <text>     Element description
  --template <name>        Starter template (${templateNames.join(', ')})
  --dir <path>             Output directory (defaults to the final plugin-ID segment)

Add options:
  --element <type>         Element type (or pass it after "add")
  --element-name <name>    Element display name (defaults from its type)
  --description <text>     Element description
  --template <name>        Starter template (${templateNames.join(', ')})
  --dir <path>             Existing plugin directory (defaults to the current directory)

General options:
  --help                   Show this help message`;
}

function parseArgs(args) {
    const remaining = [...args];
    let command = 'create';
    if (remaining[0] === 'create' || remaining[0] === 'add') command = remaining.shift();

    const options = {
        command,
        name: undefined,
        pluginName: undefined,
        element: undefined,
        elementName: undefined,
        description: undefined,
        template: undefined,
        dir: undefined,
        help: false,
    };
    const valueOptions = new Map([
        ['--name', 'name'],
        ['--plugin-name', 'pluginName'],
        ['--element', 'element'],
        ['--element-name', 'elementName'],
        ['--description', 'description'],
        ['--template', 'template'],
        ['--dir', 'dir'],
    ]);

    for (let index = 0; index < remaining.length; index += 1) {
        const arg = remaining[index];
        if (arg === '--help' || arg === '-h') options.help = true;
        else if (valueOptions.has(arg)) {
            const value = remaining[++index];
            if (!value || value.startsWith('--')) throw new Error(`Expected a value after ${arg}`);
            options[valueOptions.get(arg)] = value;
        } else if (command === 'add' && !arg.startsWith('-') && !options.element) {
            options.element = arg;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    if (command === 'add' && (options.name || options.pluginName)) {
        throw new Error(
            'The add command reads plugin identity from plugin.json; use --element for the new element type.'
        );
    }
    if (command === 'create' && options.element) {
        throw new Error('The create command derives its first element type from the final plugin-ID segment.');
    }
    return options;
}

function validatePluginId(pluginId) {
    return /^[a-z0-9.-]{3,}$/.test(pluginId) && !pluginId.startsWith('.') && !pluginId.endsWith('.');
}

function validateElementType(elementType) {
    return /^[a-z][a-z0-9-]*$/.test(elementType);
}

function targetsSdk2(apiVersion) {
    return /(?:^|[^0-9])2\./.test(apiVersion ?? '');
}

function toTitleCase(value) {
    return value
        .split(/[-.]/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

function escapeSingleQuoted(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
}

function replaceProjectTokens(source, values) {
    return source.replace(
        /{{(PLUGIN_ID|PLUGIN_NAME|ELEMENT_TYPE|ELEMENT_NAME|ELEMENT_DESCRIPTION)}}/g,
        (_match, key) => values[key]
    );
}

function renderElementSource(templateName, values) {
    const templatePath = resolve(templatesDir, templateName, 'src', 'element.ts');
    const sourceValues = {
        ...values,
        PLUGIN_NAME: escapeSingleQuoted(values.PLUGIN_NAME),
        ELEMENT_NAME: escapeSingleQuoted(values.ELEMENT_NAME),
        ELEMENT_DESCRIPTION: escapeSingleQuoted(values.ELEMENT_DESCRIPTION),
    };
    return replaceProjectTokens(readFileSync(templatePath, 'utf8'), sourceValues)
        .replace(/type: '[^']+'/, `type: '${escapeSingleQuoted(values.ELEMENT_TYPE)}'`)
        .replace(/metadata: \{ name: '[^']+'/, `metadata: { name: '${escapeSingleQuoted(values.ELEMENT_NAME)}'`)
        .replace(/description: '[^']+'/, `description: '${escapeSingleQuoted(values.ELEMENT_DESCRIPTION)}'`);
}

function templateAssetFiles(templateName) {
    const assetRoot = resolve(templatesDir, templateName, 'assets');
    if (!existsSync(assetRoot)) return [];
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory)) {
            const path = resolve(directory, entry);
            if (statSync(path).isDirectory()) visit(path);
            else if (entry !== '.gitkeep') files.push(relative(assetRoot, path));
        }
    };
    visit(assetRoot);
    return files;
}

function copyTemplateAssets(templateName, targetDir) {
    const assetRoot = resolve(templatesDir, templateName, 'assets');
    for (const asset of templateAssetFiles(templateName)) {
        const destination = resolve(targetDir, 'assets', asset);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(resolve(assetRoot, asset), destination);
    }
}

function elementValues({ pluginId, pluginName, elementType, elementName, description }) {
    const resolvedElementName = elementName || toTitleCase(elementType);
    return {
        PLUGIN_ID: pluginId,
        PLUGIN_NAME: pluginName || toTitleCase(pluginId.split('.').at(-1)),
        ELEMENT_TYPE: elementType,
        ELEMENT_NAME: resolvedElementName,
        ELEMENT_DESCRIPTION: description || `A custom ${resolvedElementName.toLowerCase()} element`,
    };
}

function readManifest(pluginDir) {
    const manifestPath = resolve(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath)) throw new Error(`Expected an existing plugin manifest at ${manifestPath}`);
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        throw new Error(`Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!validatePluginId(manifest.id)) throw new Error('plugin.json has a missing or invalid plugin ID.');
    if (!targetsSdk2(manifest.apiVersion)) throw new Error('The add command only supports SDK 2 plugins.');
    if (!Array.isArray(manifest.elements) || manifest.elements.length === 0) {
        throw new Error('plugin.json must contain a non-empty elements array.');
    }
    return { manifest, manifestPath };
}

async function promptForCreate(options) {
    if (options.name && options.template) return options;
    if (!input.isTTY) throw new Error('Pass both --name and --template when creating non-interactively.');

    const prompt = readline.createInterface({ input, output });
    try {
        options.name ??= (await prompt.question('Plugin ID (for example com.example.pulse): ')).trim();
        options.template ??= (await prompt.question(`Template (${templateNames.join(', ')}): `)).trim() || 'minimal';
        options.dir ??= (await prompt.question('Output directory (leave blank for default): ')).trim() || undefined;
    } finally {
        prompt.close();
    }
    return options;
}

async function promptForAdd(options) {
    if (options.element && options.template) return options;
    if (!input.isTTY) throw new Error('Pass an element type and --template when adding non-interactively.');

    const prompt = readline.createInterface({ input, output });
    try {
        options.element ??= (await prompt.question('Element type (kebab-case): ')).trim();
        options.template ??= (await prompt.question(`Template (${templateNames.join(', ')}): `)).trim() || 'minimal';
    } finally {
        prompt.close();
    }
    return options;
}

function validateTemplate(templateName) {
    if (!templateNames.includes(templateName)) {
        throw new Error(`Unknown template '${templateName}'. Available templates: ${templateNames.join(', ')}`);
    }
}

function createPlugin(options) {
    if (!validatePluginId(options.name)) {
        throw new Error('Plugin ID must contain lowercase letters, numbers, dots, and hyphens (minimum 3 characters).');
    }
    validateTemplate(options.template);

    const elementType = options.name.split('.').at(-1);
    if (!validateElementType(elementType))
        throw new Error('The final plugin-ID segment must be a valid kebab-case element type.');

    const targetDir = resolve(options.dir ?? elementType);
    if (existsSync(targetDir)) throw new Error(`Refusing to overwrite existing directory: ${targetDir}`);

    const values = elementValues({
        pluginId: options.name,
        pluginName: options.pluginName,
        elementType,
        elementName: options.elementName,
        description: options.description,
    });
    const commonDir = resolve(templatesDir, 'minimal');
    const manifest = JSON.parse(replaceProjectTokens(readFileSync(resolve(commonDir, 'plugin.json'), 'utf8'), values));
    manifest.name = values.PLUGIN_NAME;
    manifest.elements[0].capabilities = templateCapabilities[options.template];

    mkdirSync(targetDir, { recursive: false });
    mkdirSync(resolve(targetDir, 'assets'));
    copyTemplateAssets(options.template, targetDir);
    writeFileSync(resolve(targetDir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(
        resolve(targetDir, 'package.json'),
        replaceProjectTokens(readFileSync(resolve(commonDir, 'package.json'), 'utf8'), values)
    );
    writeFileSync(resolve(targetDir, 'tsconfig.json'), readFileSync(resolve(commonDir, 'tsconfig.json'), 'utf8'));
    writeFileSync(
        resolve(targetDir, 'README.md'),
        replaceProjectTokens(readFileSync(resolve(commonDir, 'README.md'), 'utf8'), values)
    );
    mkdirSync(resolve(targetDir, 'src'));
    writeFileSync(resolve(targetDir, 'src', `${elementType}.ts`), renderElementSource(options.template, values));

    console.log(`Created ${options.name} in ${targetDir}`);
    console.log('\nNext steps:');
    console.log(`  cd ${targetDir}`);
    console.log('  npm install');
    console.log('  npm run check');
}

function addElement(options) {
    validateTemplate(options.template);
    if (!validateElementType(options.element)) {
        throw new Error(
            'Element type must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.'
        );
    }

    const pluginDir = resolve(options.dir ?? '.');
    const { manifest, manifestPath } = readManifest(pluginDir);
    if (manifest.elements.some((element) => element.type === options.element)) {
        throw new Error(`Element type '${options.element}' already exists in this plugin.`);
    }

    const entry = `src/${options.element}.ts`;
    const elementPath = resolve(pluginDir, entry);
    if (existsSync(elementPath)) throw new Error(`Refusing to overwrite existing element file: ${elementPath}`);
    const assetConflicts = templateAssetFiles(options.template).filter((asset) =>
        existsSync(resolve(pluginDir, 'assets', asset))
    );
    if (assetConflicts.length) {
        throw new Error(`Refusing to overwrite existing template assets: ${assetConflicts.join(', ')}`);
    }

    const values = elementValues({
        pluginId: manifest.id,
        pluginName: manifest.name,
        elementType: options.element,
        elementName: options.elementName,
        description: options.description,
    });
    const nextManifest = {
        ...manifest,
        elements: [
            ...manifest.elements,
            {
                type: options.element,
                entry,
                capabilities: templateCapabilities[options.template],
            },
        ],
    };

    mkdirSync(dirname(elementPath), { recursive: true });
    mkdirSync(resolve(pluginDir, 'assets'), { recursive: true });
    writeFileSync(elementPath, renderElementSource(options.template, values));
    copyTemplateAssets(options.template, pluginDir);
    writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

    console.log(`Added ${options.element} to ${manifest.id}`);
    console.log(`Created ${elementPath}`);
    console.log(`Updated ${manifestPath} (${nextManifest.elements.length} elements)`);
    console.log('\nNext step:');
    console.log(`  cd ${pluginDir} && npm run check`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }
    if (options.command === 'add') {
        await promptForAdd(options);
        addElement(options);
    } else {
        await promptForCreate(options);
        createPlugin(options);
    }
}

main().catch((error) => {
    console.error(`create-mvmnt-plugin: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});

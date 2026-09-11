#!/usr/bin/env node
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';
import prompts from 'prompts';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = resolve(packageRoot, 'templates');

// Keep source and manifest requirements together so every generated element passes
// the plugin contract's exact capability matching check.
const templates = Object.freeze({
    minimal: {
        title: 'Minimal',
        description: 'A clean starting point for a custom element',
        capabilities: { required: [], optional: [] },
    },
    'basic-shape': {
        title: 'Basic shape',
        description: 'Draw and animate a configurable rectangle',
        capabilities: { required: [], optional: [] },
    },
    'text-display': {
        title: 'Text display',
        description: 'Render configurable text on the canvas',
        capabilities: { required: [], optional: [] },
    },
    'midi-notes': {
        title: 'MIDI notes',
        description: 'Read note events from the timeline',
        capabilities: { required: ['timeline.read', 'midi.utils'], optional: [] },
    },
    'midi-spring': {
        title: 'MIDI spring',
        description: 'Build a deterministic, MIDI-driven simulation',
        capabilities: { required: ['timeline.read'], optional: [] },
    },
    'audio-reactive': {
        title: 'Audio reactive',
        description: 'React to raw audio samples',
        capabilities: { required: ['audio.raw.read'], optional: [] },
    },
    'image-simple': {
        title: 'Simple image',
        description: 'Display an image selected by the user',
        capabilities: { required: [], optional: [] },
    },
    'bundled-image': {
        title: 'Bundled image',
        description: 'Package and render an image asset with the plugin',
        capabilities: { required: [], optional: [] },
    },
    'image-atlas': {
        title: 'Image atlas',
        description: 'Animate frames from a texture atlas',
        capabilities: { required: [], optional: [] },
    },
    'grid-atlas': {
        title: 'Grid atlas',
        description: 'Animate an evenly spaced sprite sheet',
        capabilities: { required: [], optional: [] },
    },
});

const discoveredTemplateNames = readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const missingDescriptors = discoveredTemplateNames.filter((name) => !templates[name]);
const missingTemplates = Object.keys(templates).filter((name) => !discoveredTemplateNames.includes(name));
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
const templateNames = Object.keys(templates);
const promptOptions = { onCancel: () => false };

function usage() {
    return `Usage:
  npm create mvmnt-plugin@latest -- [create] [options]
  npm create mvmnt-plugin@latest -- add [element-type] [options]

Create options:
  --name <plugin-id>       Plugin ID, for example com.example.pulse
  --plugin-name <name>     Plugin display name (defaults from the plugin ID)
  --element <type>         First element type (defaults from the plugin ID)
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
    let command;
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
    return options;
}

function nearestPluginDirectory(startDirectory) {
    let directory = resolve(startDirectory);
    while (true) {
        if (existsSync(resolve(directory, 'plugin.json'))) return directory;
        const parent = dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
    }
}

function templateChoices() {
    return templateNames.map((value) => ({
        title: templates[value].title,
        description: templates[value].description,
        value,
    }));
}

function requirePromptValue(value) {
    if (value === undefined) throw new Error('Operation cancelled.');
    return value;
}

async function selectCommand(options) {
    if (options.command) return options.command;
    if (options.name || options.pluginName) return 'create';

    const hasExplicitDirectory = Boolean(options.dir);
    const requestedDirectory = options.dir ? resolve(options.dir) : process.cwd();
    const pluginDir = hasExplicitDirectory
        ? existsSync(resolve(requestedDirectory, 'plugin.json'))
            ? requestedDirectory
            : undefined
        : nearestPluginDirectory(requestedDirectory);
    if (options.element) {
        options.dir ??= pluginDir;
        return 'add';
    }
    if (!pluginDir) return 'create';

    if (!input.isTTY || !output.isTTY) return 'add';

    let pluginName = 'this plugin';
    try {
        pluginName = readManifest(pluginDir).manifest.name || pluginName;
    } catch {
        // Let the selected add flow show the manifest-specific validation error.
    }
    console.log(`\nDetected ${pluginName} in ${pluginDir}.`);
    const response = await prompts(
        {
            type: 'select',
            name: 'command',
            message: 'What would you like to create?',
            choices: [
                { title: 'Add a scene element', description: `Add another element to ${pluginName}`, value: 'add' },
                { title: 'Create a new plugin', description: 'Scaffold a separate plugin project', value: 'create' },
            ],
            initial: 0,
        },
        promptOptions
    );
    const command = requirePromptValue(response.command);
    if (command === 'add') options.dir ??= pluginDir;
    return command;
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

export function toTitleCase(value) {
    return value
        .split(/[-.]/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

export function createPromptQuestions(options) {
    return [
        {
            type: options.name ? null : 'text',
            name: 'name',
            message: 'Plugin ID',
            initial: 'com.example.my-plugin',
            validate: (value) =>
                validatePluginId(value)
                    ? true
                    : 'Use lowercase letters, numbers, dots, and hyphens (minimum 3 characters).',
        },
        {
            type: options.dir ? null : 'text',
            name: 'dir',
            message: 'Plugin directory',
            initial: (_previous, values) => (values.name ?? options.name ?? '').split('.').at(-1),
        },
        {
            type: options.element ? null : 'text',
            name: 'element',
            message: 'Element type',
            initial: 'my-plugin-element',
            validate: (value) =>
                validateElementType(value) ? true : 'Use a kebab-case name, such as my-plugin-element.',
        },
        {
            type: options.elementName ? null : 'text',
            name: 'elementName',
            message: 'Element name',
            initial: (_previous, values) => toTitleCase(values.element ?? options.element ?? ''),
        },
        {
            type: options.template ? null : 'select',
            name: 'template',
            message: 'Choose a starter template',
            choices: templateChoices(),
            initial: 0,
        },
    ];
}

export function addPromptQuestions(options) {
    return [
        {
            type: options.element ? null : 'text',
            name: 'element',
            message: 'Element type (kebab-case identifier)',
            initial: 'my-plugin-element',
            validate: (value) =>
                validateElementType(value) ? true : 'Use a kebab-case name, such as my-plugin-element.',
        },
        {
            type: options.elementName ? null : 'text',
            name: 'elementName',
            message: 'Element name',
            initial: (_previous, values) => toTitleCase(values.element ?? options.element ?? ''),
        },
        {
            type: options.template ? null : 'select',
            name: 'template',
            message: 'Choose a starter template',
            choices: templateChoices(),
            initial: 0,
        },
    ];
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
    if (!input.isTTY) {
        if (!options.name || !options.template) {
            throw new Error('Pass both --name and --template when creating non-interactively.');
        }
        return options;
    }

    const response = await prompts(createPromptQuestions(options), promptOptions);
    if (!options.name) options.name = requirePromptValue(response.name)?.trim();
    if (!options.dir) options.dir = requirePromptValue(response.dir)?.trim() || undefined;
    if (!options.element) options.element = requirePromptValue(response.element)?.trim();
    if (!options.elementName) options.elementName = requirePromptValue(response.elementName)?.trim() || undefined;
    if (!options.template) options.template = requirePromptValue(response.template);
    return options;
}

async function promptForAdd(options) {
    if (!input.isTTY) {
        if (!options.element || !options.template) {
            throw new Error('Pass an element type and --template when adding non-interactively.');
        }
        return options;
    }

    const response = await prompts(addPromptQuestions(options), promptOptions);
    if (!options.element) options.element = requirePromptValue(response.element)?.trim();
    if (!options.elementName) options.elementName = requirePromptValue(response.elementName)?.trim() || undefined;
    if (!options.template) options.template = requirePromptValue(response.template);
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

    const elementType = options.element ?? options.name.split('.').at(-1);
    if (!validateElementType(elementType)) throw new Error('Element type must be a valid kebab-case identifier.');

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
    manifest.elements[0].capabilities = templates[options.template].capabilities;

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
                capabilities: templates[options.template].capabilities,
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
    options.command = await selectCommand(options);
    if (options.command === 'add') {
        if (!options.dir) options.dir = nearestPluginDirectory(process.cwd());
        await promptForAdd(options);
        addElement(options);
    } else {
        await promptForCreate(options);
        createPlugin(options);
    }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`create-mvmnt-plugin: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}

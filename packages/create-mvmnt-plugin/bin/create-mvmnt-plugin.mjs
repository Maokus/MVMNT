#!/usr/bin/env node
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    realpathSync,
    renameSync,
    rmSync,
    rmdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';
import { isValidPluginId, targetsSdk2 } from '@mvmnt-app/plugin-contract';
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
    if (options.element && pluginDir) {
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

function validateElementType(elementType) {
    return /^[a-z][a-z0-9-]*$/.test(elementType);
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
                isValidPluginId(value)
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
    return value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function renderRequiredPlaceholders(source, values, required, label) {
    const missing = required.filter((key) => !source.includes(`{{${key}}}`));
    if (missing.length) throw new Error(`${label} is missing required placeholders: ${missing.join(', ')}`);

    let rendered = source;
    for (const [key, value] of Object.entries(values)) rendered = rendered.split(`{{${key}}}`).join(value);
    const unresolved = [...rendered.matchAll(/{{([A-Z0-9_]+)}}/g)].map((match) => match[1]);
    if (unresolved.length)
        throw new Error(`${label} contains unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`);
    return rendered;
}

export function renderElementTemplate(source, values, label = 'Element template') {
    return renderRequiredPlaceholders(
        source,
        {
            ELEMENT_TYPE: escapeSingleQuoted(values.ELEMENT_TYPE),
            ELEMENT_NAME: escapeSingleQuoted(values.ELEMENT_NAME),
            ELEMENT_DESCRIPTION: escapeSingleQuoted(values.ELEMENT_DESCRIPTION),
        },
        ['ELEMENT_TYPE', 'ELEMENT_NAME', 'ELEMENT_DESCRIPTION'],
        label
    );
}

function renderElementSource(templateName, values) {
    const templatePath = resolve(templatesDir, templateName, 'src', 'element.ts');
    return renderElementTemplate(readFileSync(templatePath, 'utf8'), values, templatePath);
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

function readTemplateAssets(templateName) {
    const assetRoot = resolve(templatesDir, templateName, 'assets');
    return templateAssetFiles(templateName).map((asset) => ({
        path: `assets/${asset}`,
        contents: readFileSync(resolve(assetRoot, asset)),
    }));
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
    let source;
    try {
        source = readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(source);
    } catch (error) {
        throw new Error(`Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isValidPluginId(manifest?.id)) throw new Error('plugin.json has a missing or invalid plugin ID.');
    if (!targetsSdk2(manifest?.apiVersion)) throw new Error('The add command only supports SDK 2 plugins.');
    if (!Array.isArray(manifest?.elements) || manifest.elements.length === 0) {
        throw new Error('plugin.json must contain a non-empty elements array.');
    }
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
        throw new Error('plugin.json has a missing or invalid plugin name.');
    }
    const types = new Set();
    for (const element of manifest.elements) {
        if (
            !element ||
            typeof element !== 'object' ||
            !validateElementType(element.type) ||
            typeof element.entry !== 'string' ||
            !element.entry
        ) {
            throw new Error('plugin.json contains an invalid element entry.');
        }
        if (types.has(element.type)) throw new Error(`plugin.json contains duplicate element type '${element.type}'.`);
        types.add(element.type);
    }
    return { manifest, manifestPath, source };
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

function serializeJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function writePlan(root, files, directories = []) {
    for (const directory of directories) mkdirSync(resolve(root, directory), { recursive: true });
    for (const file of files) {
        const destination = resolve(root, file.path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, file.contents);
    }
}

function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function ensureDirectory(directory, root, createdDirectories) {
    const missing = [];
    let current = directory;
    while (current !== root && !existsSync(current)) {
        missing.push(current);
        current = dirname(current);
    }
    for (const path of missing.reverse()) {
        mkdirSync(path);
        createdDirectories.push(path);
    }
}

function createPlan(options, targetDir, elementType) {
    const values = elementValues({
        pluginId: options.name,
        pluginName: options.pluginName,
        elementType,
        elementName: options.elementName,
        description: options.description,
    });
    const commonDir = resolve(templatesDir, 'minimal');
    const manifestPath = resolve(commonDir, 'plugin.json');
    const packagePath = resolve(commonDir, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const packageManifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    const sdkRange = packageManifest.dependencies?.['@mvmnt-app/plugin-sdk'];
    if (!targetsSdk2(sdkRange)) throw new Error(`${packagePath} must depend on SDK 2.`);

    manifest.id = values.PLUGIN_ID;
    manifest.name = values.PLUGIN_NAME;
    manifest.apiVersion = sdkRange;
    manifest.elements = [
        {
            type: elementType,
            entry: `src/${elementType}.ts`,
            capabilities: templates[options.template].capabilities,
        },
    ];
    packageManifest.name = values.PLUGIN_ID;

    return {
        targetDir,
        directories: ['assets'],
        files: [
            { path: 'plugin.json', contents: serializeJson(manifest) },
            { path: 'package.json', contents: serializeJson(packageManifest) },
            { path: 'tsconfig.json', contents: readFileSync(resolve(commonDir, 'tsconfig.json')) },
            {
                path: 'README.md',
                contents: renderRequiredPlaceholders(
                    readFileSync(resolve(commonDir, 'README.md'), 'utf8'),
                    values,
                    ['PLUGIN_NAME'],
                    resolve(commonDir, 'README.md')
                ),
            },
            { path: `src/${elementType}.ts`, contents: renderElementSource(options.template, values) },
            ...readTemplateAssets(options.template),
        ],
    };
}

function commitCreatePlan(plan) {
    const parent = dirname(plan.targetDir);
    const stagingDir = mkdtempSync(resolve(parent, '.create-mvmnt-plugin-'));
    try {
        writePlan(stagingDir, plan.files, plan.directories);
        if (existsSync(plan.targetDir)) throw new Error(`Refusing to overwrite existing directory: ${plan.targetDir}`);
        renameSync(stagingDir, plan.targetDir);
    } catch (error) {
        rmSync(stagingDir, { recursive: true, force: true });
        throw error;
    }
}

function createPlugin(options) {
    if (!isValidPluginId(options.name)) {
        throw new Error('Plugin ID must contain lowercase letters, numbers, dots, and hyphens (minimum 3 characters).');
    }
    validateTemplate(options.template);

    const elementType = options.element ?? options.name.split('.').at(-1);
    if (!validateElementType(elementType)) throw new Error('Element type must be a valid kebab-case identifier.');

    const targetDir = resolve(options.dir ?? elementType);
    if (existsSync(targetDir)) throw new Error(`Refusing to overwrite existing directory: ${targetDir}`);

    const plan = createPlan(options, targetDir, elementType);
    commitCreatePlan(plan);

    console.log(`Created ${options.name} in ${targetDir}`);
    console.log('\nNext steps:');
    console.log(`  cd ${shellQuote(targetDir)}`);
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
    const { manifest, manifestPath, source: originalManifestSource } = readManifest(pluginDir);
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

    const files = [
        { path: entry, contents: renderElementSource(options.template, values) },
        ...readTemplateAssets(options.template),
        { path: 'plugin.json', contents: serializeJson(nextManifest) },
    ];
    const stagingDir = mkdtempSync(resolve(pluginDir, '.create-mvmnt-plugin-'));
    const movedFiles = [];
    const createdDirectories = [];
    let backupPath;
    try {
        writePlan(stagingDir, files);
        for (const file of files.slice(0, -1)) {
            const destination = resolve(pluginDir, file.path);
            if (existsSync(destination)) throw new Error(`Refusing to overwrite existing file: ${destination}`);
            const destinationDirectory = dirname(destination);
            ensureDirectory(destinationDirectory, pluginDir, createdDirectories);
            renameSync(resolve(stagingDir, file.path), destination);
            movedFiles.push(destination);
        }

        backupPath = resolve(stagingDir, 'plugin.original.json');
        if (readFileSync(manifestPath, 'utf8') !== originalManifestSource) {
            throw new Error('plugin.json changed while the add operation was being prepared; no changes were applied.');
        }
        renameSync(manifestPath, backupPath);
        try {
            renameSync(resolve(stagingDir, 'plugin.json'), manifestPath);
        } catch (error) {
            renameSync(backupPath, manifestPath);
            backupPath = undefined;
            throw error;
        }
        try {
            rmSync(backupPath, { force: true });
        } catch {
            // The committed manifest is authoritative; final staging cleanup gets another chance.
        }
        backupPath = undefined;
    } catch (error) {
        if (backupPath && !existsSync(manifestPath) && existsSync(backupPath)) renameSync(backupPath, manifestPath);
        for (const file of movedFiles.reverse()) rmSync(file, { force: true });
        for (const directory of createdDirectories.reverse()) {
            try {
                rmdirSync(directory);
            } catch {
                // Preserve directories that were populated concurrently.
            }
        }
        throw error;
    } finally {
        try {
            rmSync(stagingDir, { recursive: true, force: true });
        } catch {
            // A stale private staging directory is safer than rolling back a committed operation.
        }
    }

    console.log(`Added ${options.element} to ${manifest.id}`);
    console.log(`Created ${elementPath}`);
    console.log(`Updated ${manifestPath} (${nextManifest.elements.length} elements)`);
    console.log('\nNext step:');
    console.log(`  cd ${shellQuote(pluginDir)} && npm run check`);
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

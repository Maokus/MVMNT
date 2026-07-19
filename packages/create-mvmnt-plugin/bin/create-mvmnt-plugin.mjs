#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = resolve(packageRoot, 'templates');
const templateNames = ['minimal'];

function usage() {
    return `Usage: npm create mvmnt-plugin@latest -- [options]

Options:
  --name <plugin-id>  Plugin ID, for example com.example.pulse
  --template <name>   Starter template (${templateNames.join(', ')})
  --dir <path>        Output directory (defaults to the final plugin-ID segment)
  --help              Show this help message`;
}

function parseArgs(args) {
    const options = { name: undefined, template: undefined, dir: undefined, help: false };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg === '--name' || arg === '--template' || arg === '--dir') {
            const value = args[++index];
            if (!value || value.startsWith('--')) throw new Error(`Expected a value after ${arg}`);
            options[arg.slice(2)] = value;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    return options;
}

function validatePluginId(pluginId) {
    return /^[a-z0-9.-]{3,}$/.test(pluginId) && !pluginId.startsWith('.') && !pluginId.endsWith('.');
}

function toTitleCase(value) {
    return value.split(/[-.]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function replaceTokens(source, values) {
    return source.replace(/{{(PLUGIN_ID|PLUGIN_NAME|ELEMENT_TYPE)}}/g, (_match, key) => values[key]);
}

async function promptForMissing(options) {
    if (options.name && options.template) return options;
    if (!input.isTTY) throw new Error('Pass both --name and --template when running non-interactively.');

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

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }
    await promptForMissing(options);
    if (!validatePluginId(options.name)) throw new Error('Plugin ID must contain lowercase letters, numbers, dots, and hyphens (minimum 3 characters).');
    if (!templateNames.includes(options.template)) throw new Error(`Unknown template '${options.template}'. Available templates: ${templateNames.join(', ')}`);

    const elementType = options.name.split('.').at(-1);
    if (!/^[a-z][a-z0-9-]*$/.test(elementType)) throw new Error('The final plugin-ID segment must be a valid kebab-case element type.');

    const targetDir = resolve(options.dir ?? elementType);
    if (existsSync(targetDir)) throw new Error(`Refusing to overwrite existing directory: ${targetDir}`);

    const values = {
        PLUGIN_ID: options.name,
        PLUGIN_NAME: toTitleCase(elementType),
        ELEMENT_TYPE: elementType,
    };
    const templateDir = resolve(templatesDir, options.template);
    mkdirSync(targetDir, { recursive: false });
    cpSync(resolve(templateDir, 'assets'), resolve(targetDir, 'assets'), { recursive: true });
    writeFileSync(resolve(targetDir, 'plugin.json'), replaceTokens(readFileSync(resolve(templateDir, 'plugin.json'), 'utf8'), values));
    writeFileSync(resolve(targetDir, 'package.json'), replaceTokens(readFileSync(resolve(templateDir, 'package.json'), 'utf8'), values));
    writeFileSync(resolve(targetDir, 'tsconfig.json'), readFileSync(resolve(templateDir, 'tsconfig.json'), 'utf8'));
    writeFileSync(resolve(targetDir, 'README.md'), replaceTokens(readFileSync(resolve(templateDir, 'README.md'), 'utf8'), values));
    mkdirSync(resolve(targetDir, 'src'));
    writeFileSync(resolve(targetDir, 'src', `${elementType}.ts`), replaceTokens(readFileSync(resolve(templateDir, 'src', 'element.ts'), 'utf8'), values));

    console.log(`Created ${options.name} in ${targetDir}`);
    console.log('\nNext steps:');
    console.log(`  cd ${targetDir}`);
    console.log('  npm install');
    console.log('  npm run typecheck');
}

main().catch((error) => {
    console.error(`create-mvmnt-plugin: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});

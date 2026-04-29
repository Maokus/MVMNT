#!/usr/bin/env node
/**
 * Scaffold Script for Example Plugins
 *
 * Copies a complete example plugin from src/core/scene/elements/_examples/
 * into src/plugins/ under a user-supplied plugin ID.
 *
 * Usage: npm run create-example
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const examplesDir = path.join(projectRoot, 'src/core/scene/elements/_examples');

// ---------------------------------------------------------------------------
// Example registry — derived by reading the _examples directory at run-time.
// Each example folder must contain a plugin.json with at least { id, name, description }.
// ---------------------------------------------------------------------------
function loadExamples() {
    const entries = fs.readdirSync(examplesDir, { withFileTypes: true });
    const examples = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginJsonPath = path.join(examplesDir, entry.name, 'plugin.json');
        if (!fs.existsSync(pluginJsonPath)) continue;

        try {
            const meta = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
            examples.push({
                dir: entry.name,
                id: meta.id ?? entry.name,
                name: meta.name ?? entry.name,
                description: meta.description ?? '',
            });
        } catch {
            // skip malformed plugin.json
        }
    }

    return examples;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function validatePluginId(id) {
    if (!id || id.length < 3) return 'Plugin ID must be at least 3 characters';
    if (!/^[a-z0-9.-]+$/.test(id)) return 'Plugin ID can only contain lowercase letters, numbers, dots, and hyphens';
    return null;
}

/** Recursively copy a directory, skipping nothing. */
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log('='.repeat(60));
    console.log('MVMNT Example Plugin Scaffold');
    console.log('='.repeat(60));
    console.log();

    const examples = loadExamples();
    if (examples.length === 0) {
        console.error('No examples found in', examplesDir);
        process.exit(1);
    }

    // Step 1: Pick an example
    console.log('Available examples:\n');
    examples.forEach((ex, i) => {
        console.log(`  ${i + 1}. ${ex.name}`);
        if (ex.description) console.log(`     ${ex.description}`);
    });
    console.log();

    const choice = await prompt(`Choose example (1-${examples.length}): `);
    const idx = parseInt(choice, 10) - 1;
    if (idx < 0 || idx >= examples.length || Number.isNaN(idx)) {
        console.error('Invalid choice.');
        process.exit(1);
    }
    const example = examples[idx];

    // Step 2: Choose a plugin ID for the output
    console.log(`\nExample: ${example.name}`);
    console.log(`Default plugin ID: ${example.id}`);
    console.log();

    let pluginId = await prompt(`Plugin ID (leave blank to use "${example.id}"): `);
    if (!pluginId) pluginId = example.id;

    const validationError = validatePluginId(pluginId);
    if (validationError) {
        console.error(`Error: ${validationError}`);
        process.exit(1);
    }

    // Step 3: Determine output directory
    const pluginDirName = pluginId.split('.').pop();
    const pluginDir = path.join(projectRoot, 'src/plugins', pluginDirName);

    if (fs.existsSync(pluginDir)) {
        console.error(`Error: Plugin directory already exists: ${path.relative(projectRoot, pluginDir)}`);
        console.error('Choose a different plugin ID or remove the existing directory.');
        process.exit(1);
    }

    // Step 4: Copy example → src/plugins/<id>/
    console.log('\n' + '='.repeat(60));
    console.log('Copying example...');
    console.log('='.repeat(60));

    const srcDir = path.join(examplesDir, example.dir);
    copyDir(srcDir, pluginDir);
    console.log(`✓ Copied to: ${path.relative(projectRoot, pluginDir)}`);

    // Step 5: Update plugin.json with the new plugin ID
    const pluginJsonPath = path.join(pluginDir, 'plugin.json');
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    pluginJson.id = pluginId;
    pluginJson.author = 'Your Name';
    fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n');
    console.log(`✓ Updated plugin.json (id = "${pluginId}")`);

    // Step 6: Print next steps
    console.log('\n' + '='.repeat(60));
    console.log('Done!');
    console.log('='.repeat(60));
    console.log(`\nPlugin "${pluginJson.name}" copied to: ${path.relative(projectRoot, pluginDir)}`);
    console.log('\nNext steps:');
    console.log('  1. Start the dev server: npm run dev');
    console.log('  2. Open the app and add your element to a scene');
    console.log(`  3. Edit the element file in ${path.relative(projectRoot, pluginDir)} to customise`);
    console.log('\nSee docs/creating-custom-elements.md for more information.');
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});

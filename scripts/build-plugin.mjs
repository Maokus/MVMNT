#!/usr/bin/env node
/**
 * Build Script for Custom Element Plugins
 * 
 * Bundles a plugin directory into a distributable .mvmnt-plugin file:
 * - Validates plugin.json against schema
 * - Bundles each element entry with esbuild
 * - Packages as a ZIP with .mvmnt-plugin extension
 * 
 * Usage: npm run build-plugin [pluginDir]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as fflate from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Built-in element types that cannot be overridden
const BUILTIN_ELEMENT_TYPES = [
    'background', 'image', 'progressDisplay', 'textOverlay', 'timeDisplay',
    'timeUnitPianoRoll', 'movingNotesPianoRoll', 'notesPlayedTracker',
    'notesPlayingDisplay', 'chordEstimateDisplay', 'audioSpectrum',
    'audioVolumeMeter', 'audioWaveform', 'audioLockedOscilloscope', 'debug'
];

const PLUGIN_PUBLIC_IMPORTS = new Set([
    '@mvmnt/plugin-sdk',
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
]);

const LEGACY_INTERNAL_IMPORT_PREFIXES = ['@core/', '@audio/', '@utils/'];

const BLOCKED_INTERNAL_IMPORT_PREFIXES = [
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

function extractModuleSpecifiers(sourceCode) {
    const specifiers = new Set();
    const patterns = [
        /import\s+[^'"\n]+\s+from\s+['"]([^'"\n]+)['"]/g,
        /import\s+['"]([^'"\n]+)['"]/g,
        /require\(\s*['"]([^'"\n]+)['"]\s*\)/g,
        /import\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    ];

    for (const pattern of patterns) {
        let match = pattern.exec(sourceCode);
        while (match) {
            specifiers.add(match[1]);
            match = pattern.exec(sourceCode);
        }
    }

    return [...specifiers];
}

function validateElementImports(sourceCode, elementName) {
    const errors = [];
    const warnings = [];
    const moduleSpecifiers = extractModuleSpecifiers(sourceCode);

    for (const specifier of moduleSpecifiers) {
        if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
            continue;
        }

        if (PLUGIN_PUBLIC_IMPORTS.has(specifier)) {
            continue;
        }

        const blockedPrefix = BLOCKED_INTERNAL_IMPORT_PREFIXES.find((prefix) => specifier.startsWith(prefix));
        if (blockedPrefix) {
            errors.push(
                `${elementName}: Import '${specifier}' is not part of the public plugin API. Use '@mvmnt/plugin-sdk' instead.`
            );
            continue;
        }

        const legacyPrefix = LEGACY_INTERNAL_IMPORT_PREFIXES.find((prefix) => specifier.startsWith(prefix));
        if (legacyPrefix) {
            warnings.push(
                `${elementName}: Import '${specifier}' is a legacy internal alias. Migrate to '@mvmnt/plugin-sdk'.`
            );
        }
    }

    return { errors, warnings };
}

/**
 * Validate plugin manifest against schema
 */
function validateManifest(manifest, pluginDir) {
    const errors = [];
    
    // Required fields
    if (!manifest.id || typeof manifest.id !== 'string') {
        errors.push('Missing or invalid "id" field');
    } else if (!/^[a-z0-9.-]+$/.test(manifest.id) || manifest.id.length < 3) {
        errors.push('Invalid "id": must be at least 3 characters and contain only lowercase letters, numbers, dots, and hyphens');
    }
    
    if (!manifest.name || typeof manifest.name !== 'string') {
        errors.push('Missing or invalid "name" field');
    }
    
    if (!manifest.version || typeof manifest.version !== 'string') {
        errors.push('Missing or invalid "version" field');
    } else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.version)) {
        errors.push('Invalid "version": must follow semantic versioning (e.g., 1.0.0)');
    }
    
    if (!manifest.mvmntVersion || typeof manifest.mvmntVersion !== 'string') {
        errors.push('Missing or invalid "mvmntVersion" field');
    }
    
    if (!manifest.elements || !Array.isArray(manifest.elements) || manifest.elements.length === 0) {
        errors.push('Missing or empty "elements" array');
    } else {
        // Validate each element
        const elementTypes = new Set();
        
        manifest.elements.forEach((element, index) => {
            const elementPrefix = `Element ${index + 1}`;
            
            // Required element fields
            if (!element.type || typeof element.type !== 'string') {
                errors.push(`${elementPrefix}: Missing or invalid "type" field`);
            } else {
                if (!/^[a-z][a-z0-9-]*$/.test(element.type)) {
                    errors.push(`${elementPrefix}: Invalid "type": must start with a letter and contain only lowercase letters, numbers, and hyphens`);
                }
                
                // Check for duplicate types within this plugin
                if (elementTypes.has(element.type)) {
                    errors.push(`${elementPrefix}: Duplicate element type "${element.type}" in this plugin`);
                }
                elementTypes.add(element.type);
                
                // Check for collisions with built-in types
                if (BUILTIN_ELEMENT_TYPES.includes(element.type)) {
                    errors.push(`${elementPrefix}: Element type "${element.type}" conflicts with a built-in element`);
                }
            }
            
            if (!element.name || typeof element.name !== 'string') {
                errors.push(`${elementPrefix}: Missing or invalid "name" field`);
            }
            
            if (!element.category || typeof element.category !== 'string') {
                errors.push(`${elementPrefix}: Missing or invalid "category" field`);
            }
            // Note: We allow any string for category to support plugin-specific categories
            // Standard categories are: shapes, effects, text, particles, audio-reactive, midi, utility, custom
            
            if (!element.entry || typeof element.entry !== 'string') {
                errors.push(`${elementPrefix}: Missing or invalid "entry" field`);
            } else {
                if (!/\.(js|mjs|ts)$/.test(element.entry)) {
                    errors.push(`${elementPrefix}: Invalid "entry": must end with .js, .mjs, or .ts`);
                }
                
                // Check if entry file exists
                const entryPath = path.join(pluginDir, element.entry);
                if (!fs.existsSync(entryPath)) {
                    errors.push(`${elementPrefix}: Entry file not found: ${element.entry}`);
                }
            }
            
            // Validate capabilities if present
            if (element.capabilities && !Array.isArray(element.capabilities)) {
                errors.push(`${elementPrefix}: "capabilities" must be an array`);
            } else if (element.capabilities) {
                const validCapabilities = ['audio-analysis', 'midi-events', 'network', 'storage'];
                element.capabilities.forEach(cap => {
                    if (!validCapabilities.includes(cap)) {
                        errors.push(`${elementPrefix}: Invalid capability "${cap}": must be one of ${validCapabilities.join(', ')}`);
                    }
                });
            }
        });
    }
    
    return errors;
}

/**
 * Bundle a single element with esbuild
 */
async function bundleElement(element, pluginDir, outputDir) {
    const entryPath = path.join(pluginDir, element.entry);
    const outputFileName = element.entry.replace(/\.ts$/, '.js');
    const outputPath = path.join(outputDir, 'elements', outputFileName);
    
    console.log(`  Bundling ${element.name} (${element.type})...`);
    
    try {
        await build({
            entryPoints: [entryPath],
            bundle: true,
            format: 'cjs',
            outfile: outputPath,
            platform: 'browser',
            target: 'es2020',
            minify: true,
            sourcemap: false,
            external: [
                '@mvmnt/plugin-sdk',
                'react',
                'react-dom',
                '@core/*',
                '@audio/*',
                '@utils/*',
                '@state/*',
                '@types/*',
                '@constants/*',
            ],
        });
        
        return outputFileName;
    } catch (error) {
        throw new Error(`Failed to bundle ${element.name}: ${error.message}`);
    }
}

/**
 * Create a ZIP archive with .mvmnt-plugin extension
 */
async function createPluginBundle(manifest, buildDir, outputPath) {
    console.log(`  Creating plugin bundle...`);
    
    const files = {};
    
    // Add manifest.json
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    
    // Add bundled element files
    const elementsDir = path.join(buildDir, 'elements');
    if (fs.existsSync(elementsDir)) {
        const elementFiles = fs.readdirSync(elementsDir);
        for (const file of elementFiles) {
            const filePath = path.join(elementsDir, file);
            const content = fs.readFileSync(filePath);
            files[`elements/${file}`] = content;
        }
    }
    
    // Add assets if they exist
    const assetsDir = path.join(buildDir, 'assets');
    if (fs.existsSync(assetsDir)) {
        const walkDir = (dir, prefix = '') => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const relativePath = path.join(prefix, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    walkDir(fullPath, relativePath);
                } else {
                    files[`assets/${relativePath}`] = fs.readFileSync(fullPath);
                }
            }
        };
        walkDir(assetsDir);
    }
    
    // Create ZIP using fflate
    const zipped = fflate.zipSync(files, {
        level: 9,
        comment: `MVMNT Plugin: ${manifest.name} v${manifest.version}`,
    });
    
    // Write to file
    fs.writeFileSync(outputPath, zipped);
    
    return outputPath;
}

/**
 * Validate element class for required methods
 */
function validateElementClass(elementCode, elementName) {
    const errors = [];
    
    // Check for getConfigSchema static method (with or without override keyword)
    if (!elementCode.includes('static getConfigSchema()') && 
        !elementCode.includes('static getConfigSchema (') &&
        !elementCode.includes('static override getConfigSchema()') &&
        !elementCode.includes('static override getConfigSchema (')) {
        errors.push(`${elementName}: Missing static getConfigSchema() method`);
    }
    
    // Check for render implementation (_buildRenderObjects is the actual implementation method)
    if (!elementCode.includes('_buildRenderObjects(') && 
        !elementCode.includes('_buildRenderObjects (') &&
        !elementCode.includes('render(') && 
        !elementCode.includes('render (')) {
        errors.push(`${elementName}: Missing render implementation (_buildRenderObjects or render method)`);
    }
    
    // Check that class extends SceneElement
    if (!elementCode.includes('extends SceneElement')) {
        errors.push(`${elementName}: Class must extend SceneElement`);
    }
    
    return errors;
}

/**
 * Build a plugin from a directory
 */
async function buildPlugin(pluginDir, outPath = null) {
    console.log('='.repeat(60));
    console.log('MVMNT Plugin Builder');
    console.log('='.repeat(60));
    console.log();
    
    // Read plugin.json
    const pluginJsonPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(pluginJsonPath)) {
        throw new Error(`plugin.json not found in ${pluginDir}`);
    }
    
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to parse plugin.json: ${error.message}`);
    }
    
    console.log(`Building plugin: ${manifest.name} v${manifest.version}`);
    console.log(`Plugin ID: ${manifest.id}`);
    console.log(`Elements: ${manifest.elements?.length || 0}`);
    console.log();
    
    // Validate manifest
    console.log('Validating manifest...');
    const validationErrors = validateManifest(manifest, pluginDir);
    if (validationErrors.length > 0) {
        console.error('Validation failed:');
        validationErrors.forEach(error => console.error(`  ✗ ${error}`));
        throw new Error('Manifest validation failed');
    }
    console.log('✓ Manifest is valid');
    console.log();
    
    // Validate element classes
    console.log('Validating element classes...');
    const classValidationErrors = [];
    for (const element of manifest.elements) {
        const entryPath = path.join(pluginDir, element.entry);
        const elementCode = fs.readFileSync(entryPath, 'utf8');
        const errors = validateElementClass(elementCode, element.name);
        classValidationErrors.push(...errors);
    }
    if (classValidationErrors.length > 0) {
        console.error('Element class validation failed:');
        classValidationErrors.forEach(error => console.error(`  ✗ ${error}`));
        throw new Error('Element class validation failed');
    }
    console.log('✓ All element classes are valid');
    console.log();

    // Validate imports against public plugin API contract
    console.log('Validating plugin imports...');
    const importValidationErrors = [];
    const importValidationWarnings = [];
    for (const element of manifest.elements) {
        const entryPath = path.join(pluginDir, element.entry);
        const elementCode = fs.readFileSync(entryPath, 'utf8');
        const { errors, warnings } = validateElementImports(elementCode, element.name);
        importValidationErrors.push(...errors);
        importValidationWarnings.push(...warnings);
    }

    if (importValidationWarnings.length > 0) {
        console.warn('Import compatibility warnings:');
        importValidationWarnings.forEach(warning => console.warn(`  ⚠ ${warning}`));
        console.warn('  ⚠ Legacy aliases still work for now but will be removed in a future release.');
    }

    if (importValidationErrors.length > 0) {
        console.error('Plugin import validation failed:');
        importValidationErrors.forEach(error => console.error(`  ✗ ${error}`));
        throw new Error('Plugin import validation failed');
    }

    console.log('✓ Plugin imports use the public contract');
    console.log();
    
    // Create build directory
    const buildDir = path.join(pluginDir, '.build');
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
    }
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(path.join(buildDir, 'elements'), { recursive: true });
    
    // Bundle elements
    console.log('Bundling elements...');
    const bundledManifest = { ...manifest, elements: [] };
    
    for (const element of manifest.elements) {
        const bundledEntry = await bundleElement(element, pluginDir, buildDir);
        bundledManifest.elements.push({
            ...element,
            entry: `elements/${bundledEntry}`,
        });
        console.log(`  ✓ ${element.name}`);
    }
    console.log();
    
    // Copy assets if they exist
    const assetsDir = path.join(pluginDir, 'assets');
    if (fs.existsSync(assetsDir)) {
        console.log('Copying assets...');
        const buildAssetsDir = path.join(buildDir, 'assets');
        fs.mkdirSync(buildAssetsDir, { recursive: true });
        
        const copyDir = (src, dest) => {
            const items = fs.readdirSync(src);
            for (const item of items) {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);
                const stat = fs.statSync(srcPath);
                if (stat.isDirectory()) {
                    fs.mkdirSync(destPath, { recursive: true });
                    copyDir(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        };
        
        copyDir(assetsDir, buildAssetsDir);
        console.log('✓ Assets copied');
        console.log();
    }
    
    // Create plugin bundle
    console.log('Creating plugin bundle...');
    const outputFileName = `${manifest.id}-${manifest.version}.mvmnt-plugin`;
    const outputPath = outPath
        ? path.resolve(outPath)
        : path.join(projectRoot, 'dist', outputFileName);

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    await createPluginBundle(bundledManifest, buildDir, outputPath);
    console.log(`✓ Bundle created: ${outputFileName}`);
    console.log();
    
    // Clean up build directory
    fs.rmSync(buildDir, { recursive: true });
    
    // Display statistics
    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    console.log('='.repeat(60));
    console.log('Build Complete!');
    console.log('='.repeat(60));
    console.log(`Output: ${path.relative(projectRoot, outputPath)}`);
    console.log(`Size: ${sizeKB} KB`);
    console.log(`Elements: ${manifest.elements.length}`);
    manifest.elements.forEach(element => {
        console.log(`  - ${element.name} (${element.type})`);
    });
    console.log();
}

/**
 * Main entry point
 */
async function main() {
    const rawArgs = process.argv.slice(2);

    // Parse --out <path> flag
    const outFlagIndex = rawArgs.findIndex(a => a === '--out');
    let outPath = null;
    const args = [...rawArgs];
    if (outFlagIndex >= 0) {
        outPath = rawArgs[outFlagIndex + 1] ?? null;
        args.splice(outFlagIndex, 2);
    }

    // Detect available plugins

    const pluginsDir = path.join(projectRoot, 'src/plugins');

    if (!fs.existsSync(pluginsDir)) {
        console.error('Error: No plugins directory found. Run "npm run create-element" to create a plugin.');
        process.exit(1);
    }

    const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .filter(dir => fs.existsSync(path.join(pluginsDir, dir.name, 'plugin.json')));
    
    // If no argument provided, list available plugins
    if (args.length === 0) {
        
        
        if (pluginDirs.length === 0) {
            console.error('Error: No valid plugins found. Run "npm run create-element" to create a plugin.');
            process.exit(1);
        }
        
        console.log('Detected plugins:');
        pluginDirs.forEach(dir => {
            const pluginJsonPath = path.join(pluginsDir, dir.name, 'plugin.json');
            try {
                const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
                console.log(`  ${dir.name} - ${manifest.name} v${manifest.version} (${manifest.elements?.length || 0} elements)`);
            } catch (error) {
                console.log(`  ${dir.name} - (invalid plugin.json)`);
            }
        });
        console.log();
        console.log('Usage: npm run build-plugin <plugin-dir>');
        console.log('Example: npm run build-plugin src/plugins/myplugin');
        process.exit(0);
    }
    
    // Build specified plugin
    let inputPluginDir = args[0];
    let pluginDir;
    
    // If relative path, resolve it
    if (!path.isAbsolute(inputPluginDir)) {
        pluginDir = path.join(projectRoot, inputPluginDir);
    } else {
        pluginDir = inputPluginDir;
    }

    if (!fs.existsSync(pluginDir)) {
        // Check if it's a plugin name in the plugins directory
        const matchedPluginDirs = pluginDirs.filter(dir => dir.name === inputPluginDir);
        if (matchedPluginDirs.length > 0) {
            pluginDir = path.join(pluginsDir, matchedPluginDirs[0].name);
        }
    }
    
    if (!fs.existsSync(pluginDir)) {
        console.error(`Error: Plugin directory not found: ${inputPluginDir}`);
        process.exit(1);
    }
    
    try {
        await buildPlugin(pluginDir, outPath);
    } catch (error) {
        console.error(`\nBuild failed: ${error.message}`);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();

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
import { BUILTIN_ELEMENT_TYPES } from './built-in-element-types.mjs';
import {
    PLUGIN_EXTERNALS,
    targetsFrozenV1,
    validateElementImports,
    validateManifestContract,
} from './plugin-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Validate plugin manifest against schema
 */
function validateManifest(manifest, pluginDir) {
    return validateManifestContract(manifest, pluginDir, BUILTIN_ELEMENT_TYPES);
}

/**
 * Bundle a single element with esbuild
 */
async function bundleElement(element, pluginDir, outputDir) {
    const entryPath = path.join(pluginDir, element.entry);
    const outputFileName = element.entry.replace(/\.ts$/, '.js');
    const outputPath = path.join(outputDir, 'elements', outputFileName);
    
    console.log(`  Bundling ${element.type}...`);
    
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
            external: [...PLUGIN_EXTERNALS],
        });
        
        return outputFileName;
    } catch (error) {
        throw new Error(`Failed to bundle ${element.type}: ${error.message}`);
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
    if (elementCode.includes('definePluginElement')) {
        if (!elementCode.includes('render')) errors.push(`${elementName}: SDK 2.x definition must provide render()`);
        return errors;
    }
    
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

    if (targetsFrozenV1(manifest)) {
        throw new Error(
            `Plugin '${manifest.id}' targets ${manifest.apiVersion ?? manifest.mvmntVersion}. New builds must target SDK ^2.0.0; existing installed v1 bundles remain loadable during the compatibility window.`
        );
    }
    
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
        const errors = validateElementClass(elementCode, element.type);
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
        const { errors, warnings } = validateElementImports(elementCode, element.type, manifest.apiVersion);
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
        console.log(`  ✓ ${element.type}`);
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
        console.log(`  - ${element.type}`);
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

    // A plugin is always supplied by path. Plugins are external projects rather
    // than subdirectories of this application repository.
    if (args.length === 0) {
        console.error('Usage: npm run build-plugin -- <plugin-directory> [--out <bundle-path>]');
        console.error('Example: npm run build-plugin -- /absolute/path/to/myplugin');
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

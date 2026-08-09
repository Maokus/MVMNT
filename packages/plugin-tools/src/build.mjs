import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import * as fflate from 'fflate';
import { SDK_RUNTIME_MODULES, readAndValidatePlugin } from './contract.mjs';

function addDirectory(files, directory, prefix) {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory)) {
        const fullPath = path.join(directory, item);
        const archivePath = path.posix.join(prefix, item);
        if (fs.statSync(fullPath).isDirectory()) addDirectory(files, fullPath, archivePath);
        else files[archivePath] = fs.readFileSync(fullPath);
    }
}

function copyDirectory(source, destination) {
    if (!fs.existsSync(source)) return;
    fs.mkdirSync(destination, { recursive: true });
    for (const item of fs.readdirSync(source)) {
        const from = path.join(source, item);
        const to = path.join(destination, item);
        if (fs.statSync(from).isDirectory()) copyDirectory(from, to);
        else fs.copyFileSync(from, to);
    }
}

export async function buildPluginArchive(pluginDirectory, options = {}) {
    const directory = path.resolve(pluginDirectory);
    const manifest = readAndValidatePlugin(directory);
    const buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvmnt-plugin-build-'));
    try {
        fs.mkdirSync(path.join(buildDirectory, 'elements'), { recursive: true });
        const bundledManifest = { ...manifest, elements: [] };
        for (const element of manifest.elements) {
            const outputName = element.entry.replace(/\.(?:ts|tsx|js|jsx|mjs)$/, '.js');
            const outputPath = path.join(buildDirectory, 'elements', outputName);
            await build({
                entryPoints: [path.join(directory, element.entry)],
                bundle: true,
                format: 'cjs',
                outfile: outputPath,
                platform: 'browser',
                target: 'es2020',
                minify: options.minify ?? true,
                sourcemap: false,
                external: [...SDK_RUNTIME_MODULES],
            });
            bundledManifest.elements.push({ ...element, entry: `elements/${outputName}` });
        }
        copyDirectory(path.join(directory, 'assets'), path.join(buildDirectory, 'assets'));
        const files = { 'manifest.json': new TextEncoder().encode(JSON.stringify(bundledManifest, null, 2)) };
        addDirectory(files, path.join(buildDirectory, 'elements'), 'elements');
        addDirectory(files, path.join(buildDirectory, 'assets'), 'assets');
        const bytes = Buffer.from(
            fflate.zipSync(files, {
                level: options.minify === false ? 1 : 9,
                comment: `MVMNT Plugin: ${manifest.name} v${manifest.version}`,
            })
        );
        return { manifest, bundledManifest, bytes };
    } finally {
        fs.rmSync(buildDirectory, { recursive: true, force: true });
    }
}

export async function writePluginArchive(pluginDirectory, outputPath) {
    const result = await buildPluginArchive(pluginDirectory);
    const destination = path.resolve(
        outputPath ??
            path.join(pluginDirectory, 'dist', `${result.manifest.id}-${result.manifest.version}.mvmnt-plugin`)
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, result.bytes);
    return { ...result, outputPath: destination };
}

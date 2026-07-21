#!/usr/bin/env node
/** Multiplexed localhost server for one or more MVMNT development plugins. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import * as fflate from 'fflate';
import { PLUGIN_EXTERNALS, validateElementImports, validateManifestContract } from './plugin-contract.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 7741;
const DEFAULT_PORT_RANGE_SIZE = 10;
const DEBOUNCE_MS = 150;
const HEARTBEAT_MS = 15_000;
const rawArgs = process.argv.slice(2);
const portIndex = rawArgs.indexOf('--port');
let port = DEFAULT_PORT;
let portWasSpecified = false;
const inputDirectories = [...rawArgs];
if (portIndex >= 0) {
    const parsed = Number.parseInt(rawArgs[portIndex + 1] ?? '', 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        console.error('Error: --port must be an integer between 1 and 65535.');
        process.exit(1);
    }
    port = parsed;
    portWasSpecified = true;
    inputDirectories.splice(portIndex, 2);
}
if (inputDirectories.length === 0) {
    console.error('Usage: npm run dev-plugin -- <pluginDir> [<pluginDir> ...] [--port <port>]');
    process.exit(1);
}

function resolvePluginDirectory(input) {
    return path.resolve(path.isAbsolute(input) ? input : path.join(projectRoot, input));
}

function readManifest(pluginDir) {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`plugin.json not found in ${pluginDir}`);
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        throw new Error(`failed to parse ${manifestPath}: ${error.message}`);
    }
    const errors = validateManifestContract(manifest, pluginDir);
    for (const element of manifest.elements ?? []) {
        const entryPath = path.join(pluginDir, element.entry ?? '');
        if (fs.existsSync(entryPath)) errors.push(...validateElementImports(fs.readFileSync(entryPath, 'utf8'), element.type).errors);
    }
    if (errors.length) throw new Error(errors.join('\n  - '));
    return manifest;
}

const plugins = new Map();
for (const input of inputDirectories) {
    const pluginDir = resolvePluginDirectory(input);
    if (!fs.existsSync(pluginDir)) {
        console.error(`Error: plugin directory not found: ${input}`);
        process.exit(1);
    }
    try {
        const manifest = readManifest(pluginDir);
        if (plugins.has(manifest.id)) throw new Error(`duplicate plugin ID '${manifest.id}'`);
        plugins.set(manifest.id, {
            id: manifest.id,
            pluginDir,
            manifest,
            currentBundle: null,
            revision: 0,
            buildError: undefined,
            rebuildTimer: undefined,
            rebuilding: false,
            rebuildPending: false,
        });
    } catch (error) {
        console.error(`Error: invalid development plugin '${input}'\n  - ${error.message}`);
        process.exit(1);
    }
}

const sseClients = new Set();
let tempBuildCounter = 0;

function statusFor(plugin) {
    return { id: plugin.id, ready: plugin.currentBundle !== null, revision: plugin.revision, buildError: plugin.buildError };
}
function broadcast(payload) {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
        try { client.write(message); } catch { sseClients.delete(client); }
    }
}
function publishSnapshot(client) {
    client.write(`data: ${JSON.stringify({ type: 'snapshot', plugins: [...plugins.values()].map(statusFor) })}\n\n`);
}
function emitUpsert(plugin) {
    broadcast({ type: 'upsert', pluginId: plugin.id, revision: plugin.revision });
}

async function bundleElement(plugin, element, buildDir) {
    const outputFileName = element.entry.replace(/\.(ts|tsx|js|jsx)$/, '.js');
    const outputPath = path.join(buildDir, 'elements', outputFileName);
    await build({
        entryPoints: [path.join(plugin.pluginDir, element.entry)], bundle: true, format: 'cjs', outfile: outputPath,
        platform: 'browser', target: 'es2020', minify: false, sourcemap: false, external: [...PLUGIN_EXTERNALS],
    });
    return outputFileName;
}

function copyDirectory(source, destination) {
    for (const item of fs.readdirSync(source)) {
        const from = path.join(source, item);
        const to = path.join(destination, item);
        if (fs.statSync(from).isDirectory()) { fs.mkdirSync(to, { recursive: true }); copyDirectory(from, to); }
        else fs.copyFileSync(from, to);
    }
}

function packageBundle(manifest, buildDir) {
    const files = { 'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)) };
    const addDirectory = (dir, prefix) => {
        for (const item of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, item);
            const archivePath = path.posix.join(prefix, item);
            if (fs.statSync(fullPath).isDirectory()) addDirectory(fullPath, archivePath);
            else files[archivePath] = fs.readFileSync(fullPath);
        }
    };
    for (const [directory, prefix] of [['elements', 'elements'], ['assets', 'assets']]) {
        const source = path.join(buildDir, directory);
        if (fs.existsSync(source)) addDirectory(source, prefix);
    }
    return Buffer.from(fflate.zipSync(files, { level: 1, comment: `MVMNT dev plugin: ${manifest.name}` }));
}

async function rebuildOnce(plugin) {
    const buildDir = path.join(os.tmpdir(), `mvmnt-dev-plugin-${process.pid}-${++tempBuildCounter}`);
    try {
        const manifest = readManifest(plugin.pluginDir);
        if (manifest.id !== plugin.id) {
            plugin.buildError = `plugin ID changed from '${plugin.id}' to '${manifest.id}'; restart dev-plugin to apply it.`;
            console.error(`[dev-plugin] ${plugin.buildError}`);
            return;
        }
        plugin.manifest = manifest;
        fs.mkdirSync(path.join(buildDir, 'elements'), { recursive: true });
        const bundledManifest = { ...manifest, elements: [] };
        for (const element of manifest.elements) {
            const entry = await bundleElement(plugin, element, buildDir);
            bundledManifest.elements.push({ ...element, entry: `elements/${entry}` });
        }
        const assets = path.join(plugin.pluginDir, 'assets');
        if (fs.existsSync(assets)) {
            const destination = path.join(buildDir, 'assets');
            fs.mkdirSync(destination, { recursive: true });
            copyDirectory(assets, destination);
        }
        plugin.currentBundle = packageBundle(bundledManifest, buildDir);
        plugin.revision += 1;
        plugin.buildError = undefined;
        console.log(`[dev-plugin] Built ${plugin.id} r${plugin.revision} — ${(plugin.currentBundle.length / 1024).toFixed(1)} KB`);
        emitUpsert(plugin);
    } catch (error) {
        plugin.buildError = error instanceof Error ? error.message : String(error);
        console.error(`[dev-plugin] Build failed for ${plugin.id}:\n${plugin.buildError}`);
    } finally {
        if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
    }
}

async function rebuild(plugin) {
    if (plugin.rebuilding) { plugin.rebuildPending = true; return; }
    plugin.rebuilding = true;
    do { plugin.rebuildPending = false; await rebuildOnce(plugin); } while (plugin.rebuildPending);
    plugin.rebuilding = false;
}
function scheduleRebuild(plugin) {
    clearTimeout(plugin.rebuildTimer);
    plugin.rebuildTimer = setTimeout(() => void rebuild(plugin), DEBOUNCE_MS);
}
function startWatcher(plugin) {
    try {
        fs.watch(plugin.pluginDir, { recursive: true }, (_, filename) => {
            if (!filename) return;
            const normalized = filename.replaceAll('\\', '/');
            const parts = normalized.split('/');
            if (parts.some((part) => ['node_modules', 'dist', '.build', '.git'].includes(part)) || parts.some((part) => part.startsWith('.')) || normalized.endsWith('~')) return;
            scheduleRebuild(plugin);
        });
    } catch {
        console.warn(`[dev-plugin] fs.watch unavailable for ${plugin.id}; restart to rebuild.`);
    }
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
        res.write('retry: 1000\n:connected\n\n');
        sseClients.add(res);
        publishSnapshot(res);
        req.on('close', () => sseClients.delete(res));
        return;
    }
    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ protocolVersion: 2, plugins: [...plugins.values()].map(statusFor) }));
        return;
    }
    const match = url.pathname.match(/^\/([^/]+)\.mvmnt-plugin$/);
    const plugin = match && plugins.get(decodeURIComponent(match[1]));
    if (plugin?.currentBundle) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${plugin.id}.mvmnt-plugin"`, 'Cache-Control': 'no-store' });
        res.end(plugin.currentBundle);
        return;
    }
    res.writeHead(404); res.end('Not found');
});

const heartbeat = setInterval(() => {
    for (const client of sseClients) {
        try { client.write(':heartbeat\n\n'); } catch { sseClients.delete(client); }
    }
}, HEARTBEAT_MS);

function shutdown(signal) {
    console.log(`\n[dev-plugin] Received ${signal}; removing development plugins.`);
    for (const plugin of plugins.values()) broadcast({ type: 'remove', pluginId: plugin.id });
    clearInterval(heartbeat);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function listenOnAvailablePort() {
    const firstPort = port;
    const lastPort = portWasSpecified ? port : DEFAULT_PORT + DEFAULT_PORT_RANGE_SIZE - 1;

    for (let candidate = firstPort; candidate <= lastPort; candidate += 1) {
        try {
            await new Promise((resolve, reject) => {
                const onError = (error) => {
                    server.off('listening', onListening);
                    reject(error);
                };
                const onListening = () => {
                    server.off('error', onError);
                    resolve();
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(candidate, '127.0.0.1');
            });
            return candidate;
        } catch (error) {
            if (error?.code !== 'EADDRINUSE' || portWasSpecified || candidate === lastPort) throw error;
        }
    }
    throw new Error('No available development plugin port found.');
}

server.on('listening', async () => {
    const address = server.address();
    if (!address || typeof address === 'string') return;
    port = address.port;
    console.log(`\n[dev-plugin] Serving ${plugins.size} plugin(s) at http://localhost:${port}`);
    if (!portWasSpecified && port !== DEFAULT_PORT) {
        console.log(`[dev-plugin] Port ${DEFAULT_PORT} is in use; selected available port ${port}.`);
    }
    await Promise.all([...plugins.values()].map(rebuild));
    for (const plugin of plugins.values()) startWatcher(plugin);
    console.log('[dev-plugin] Watching for changes…');
    server.on('error', (error) => {
        console.error(`[dev-plugin] Server error: ${error.message}`);
        process.exit(1);
    });
});

listenOnAvailablePort().catch((error) => {
    const portHint = portWasSpecified
        ? ' Choose another port and start Vite with the matching VITE_DEV_PLUGIN_PORT.'
        : ` Ports ${DEFAULT_PORT}-${DEFAULT_PORT + DEFAULT_PORT_RANGE_SIZE - 1} are all in use.`;
    console.error(error.code === 'EADDRINUSE' ? `[dev-plugin] Port ${port} is already in use.${portHint}` : `[dev-plugin] Server error: ${error.message}`);
    process.exit(1);
});

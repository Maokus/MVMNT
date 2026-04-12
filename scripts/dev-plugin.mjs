#!/usr/bin/env node
/**
 * Dev Plugin Server
 *
 * Watches a plugin directory for source changes, rebuilds on every save, and
 * serves the latest bundle over HTTP. The running MVMNT app connects to the
 * /events SSE endpoint and hot-reloads the plugin automatically.
 *
 * Usage:
 *   npm run dev-plugin <pluginDir>
 *   npm run dev-plugin src/plugins/myplugin
 *   npm run dev-plugin myplugin          # short name, resolved under src/plugins/
 *   npm run dev-plugin myplugin --port 7741
 *
 * The app must be open in a browser with Vite dev mode active. On each rebuild
 * the browser will hot-swap the plugin without a full page refresh.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import * as fflate from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_PORT = 7741;
const DEBOUNCE_MS = 150;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

// Parse --port flag
const portFlagIdx = rawArgs.findIndex((a) => a === '--port');
let port = DEFAULT_PORT;
const filteredArgs = [...rawArgs];
if (portFlagIdx >= 0) {
    port = parseInt(rawArgs[portFlagIdx + 1] ?? String(DEFAULT_PORT), 10);
    filteredArgs.splice(portFlagIdx, 2);
}

if (filteredArgs.length === 0) {
    console.error('Usage: npm run dev-plugin <pluginDir> [--port <port>]');
    process.exit(1);
}

let inputPluginDir = filteredArgs[0];
let pluginDir;

if (!path.isAbsolute(inputPluginDir)) {
    pluginDir = path.join(projectRoot, inputPluginDir);
}

// Also try resolving as a bare name under src/plugins/
if (!fs.existsSync(pluginDir ?? inputPluginDir)) {
    const candidate = path.join(projectRoot, 'src/plugins', inputPluginDir);
    if (fs.existsSync(candidate)) pluginDir = candidate;
}

pluginDir ??= inputPluginDir;

if (!fs.existsSync(pluginDir)) {
    console.error(`Error: plugin directory not found: ${inputPluginDir}`);
    process.exit(1);
}

const pluginJsonPath = path.join(pluginDir, 'plugin.json');
if (!fs.existsSync(pluginJsonPath)) {
    console.error(`Error: plugin.json not found in ${pluginDir}`);
    process.exit(1);
}

let manifest;
try {
    manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
} catch (err) {
    console.error(`Error: failed to parse plugin.json — ${err.message}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Latest packaged bundle bytes (Buffer), or null if never built successfully. */
let currentBundle = null;
/** SSE response streams of connected clients. */
const sseClients = new Set();

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------

async function bundleElement(element, buildDir) {
    const entryPath = path.join(pluginDir, element.entry);
    const outputFileName = element.entry.replace(/\.ts$/, '.js');
    const outputPath = path.join(buildDir, 'elements', outputFileName);

    await build({
        entryPoints: [entryPath],
        bundle: true,
        format: 'cjs',
        outfile: outputPath,
        platform: 'browser',
        target: 'es2020',
        minify: false,       // readable output helps during development
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
}

function packageBundle(bundledManifest, buildDir) {
    const files = {};

    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(bundledManifest, null, 2));

    const elementsDir = path.join(buildDir, 'elements');
    if (fs.existsSync(elementsDir)) {
        for (const file of fs.readdirSync(elementsDir)) {
            files[`elements/${file}`] = fs.readFileSync(path.join(elementsDir, file));
        }
    }

    const assetsDir = path.join(buildDir, 'assets');
    if (fs.existsSync(assetsDir)) {
        const walkDir = (dir, prefix = '') => {
            for (const item of fs.readdirSync(dir)) {
                const fullPath = path.join(dir, item);
                const rel = path.join(prefix, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    walkDir(fullPath, rel);
                } else {
                    files[`assets/${rel}`] = fs.readFileSync(fullPath);
                }
            }
        };
        walkDir(assetsDir);
    }

    return Buffer.from(
        fflate.zipSync(files, {
            level: 1,   // fast compression for dev
            comment: `MVMNT dev plugin: ${bundledManifest.name}`,
        })
    );
}

async function doRebuild() {
    const buildDir = path.join(os.tmpdir(), `mvmnt-dev-plugin-${manifest.id}`);

    try {
        // Clean and recreate temp build dir
        if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true });
        fs.mkdirSync(path.join(buildDir, 'elements'), { recursive: true });

        // Bundle each element
        const bundledManifest = { ...manifest, elements: [] };
        for (const element of manifest.elements) {
            const bundledEntry = await bundleElement(element, buildDir);
            bundledManifest.elements.push({ ...element, entry: `elements/${bundledEntry}` });
        }

        // Copy source assets if present
        const srcAssetsDir = path.join(pluginDir, 'assets');
        if (fs.existsSync(srcAssetsDir)) {
            const destAssetsDir = path.join(buildDir, 'assets');
            fs.mkdirSync(destAssetsDir, { recursive: true });
            const copyDir = (src, dest) => {
                for (const item of fs.readdirSync(src)) {
                    const s = path.join(src, item);
                    const d = path.join(dest, item);
                    if (fs.statSync(s).isDirectory()) {
                        fs.mkdirSync(d, { recursive: true });
                        copyDir(s, d);
                    } else {
                        fs.copyFileSync(s, d);
                    }
                }
            };
            copyDir(srcAssetsDir, destAssetsDir);
        }

        // Package
        currentBundle = packageBundle(bundledManifest, buildDir);
        const sizeKB = (currentBundle.length / 1024).toFixed(1);

        console.log(`[dev-plugin] Built ${manifest.id} — ${sizeKB} KB`);
        emitRebuild();
    } catch (err) {
        console.error(`[dev-plugin] Build failed:\n${err.message}`);
    } finally {
        if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true });
    }
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function emitRebuild() {
    const data = JSON.stringify({ type: 'rebuild', pluginId: manifest.id, timestamp: Date.now() });
    const msg = `data: ${data}\n\n`;
    for (const client of sseClients) {
        try { client.write(msg); } catch { /* ignore closed sockets */ }
    }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
    // CORS — allow the Vite dev server origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const url = new URL(req.url, `http://localhost`);

    if (url.pathname === '/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write(':connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
    }

    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pluginId: manifest.id, ready: currentBundle !== null }));
        return;
    }

    const bundleName = `/${manifest.id}.mvmnt-plugin`;
    if (url.pathname === bundleName && currentBundle) {
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${manifest.id}.mvmnt-plugin"`,
            'Cache-Control': 'no-store',
        });
        res.end(currentBundle);
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

let rebuildTimer = null;

function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { void doRebuild(); }, DEBOUNCE_MS);
}

function startWatcher() {
    try {
        fs.watch(pluginDir, { recursive: true }, (_, filename) => {
            if (!filename) return;
            // Ignore build artefacts and editor temp files
            if (filename.includes('.build') || filename.startsWith('.') || filename.endsWith('~')) return;
            scheduleRebuild();
        });
    } catch {
        console.warn('[dev-plugin] fs.watch unavailable — file watching disabled. Rebuild manually by restarting.');
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\n[dev-plugin] Starting dev server for '${manifest.name}' (${manifest.id})`);
console.log(`[dev-plugin] Port: ${port}  |  Plugin dir: ${path.relative(projectRoot, pluginDir)}\n`);

server.listen(port, '127.0.0.1', async () => {
    console.log(`[dev-plugin] Server: http://localhost:${port}`);
    console.log(`[dev-plugin] Open MVMNT in the browser — it will auto-connect and hot-reload on save.\n`);

    // Initial build
    await doRebuild();

    // Start watching for changes
    startWatcher();
    console.log(`[dev-plugin] Watching for changes…`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[dev-plugin] Port ${port} is already in use. Pass --port <n> to use a different port.`);
    } else {
        console.error('[dev-plugin] Server error:', err.message);
    }
    process.exit(1);
});

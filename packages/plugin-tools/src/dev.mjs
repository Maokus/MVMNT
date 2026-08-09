import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { buildPluginArchive } from './build.mjs';
import { readAndValidatePlugin } from './contract.mjs';

const DEFAULT_PORT = 7741;
const PORT_COUNT = 10;

export async function startPluginDevServer(inputDirectories, options = {}) {
    const plugins = new Map();
    for (const input of inputDirectories) {
        const directory = path.resolve(input);
        const manifest = readAndValidatePlugin(directory);
        if (plugins.has(manifest.id)) throw new Error(`Duplicate plugin ID '${manifest.id}'`);
        plugins.set(manifest.id, { id: manifest.id, directory, manifest, bytes: null, revision: 0, error: undefined });
    }
    const clients = new Set();
    const watchers = new Set();
    const send = (response, payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`);
    const broadcast = (payload) => {
        for (const client of clients) send(client, payload);
    };
    const status = (plugin) => ({
        id: plugin.id,
        ready: plugin.bytes !== null,
        revision: plugin.revision,
        buildError: plugin.error,
    });
    const rebuild = async (plugin) => {
        try {
            const result = await buildPluginArchive(plugin.directory, { minify: false });
            if (result.manifest.id !== plugin.id) throw new Error('Plugin ID changed; restart the development server');
            plugin.bytes = result.bytes;
            plugin.manifest = result.manifest;
            plugin.revision += 1;
            plugin.error = undefined;
            console.log(`[mvmnt-plugin] Built ${plugin.id} r${plugin.revision}`);
            broadcast({ type: 'upsert', pluginId: plugin.id, revision: plugin.revision });
        } catch (error) {
            plugin.error = error instanceof Error ? error.message : String(error);
            console.error(`[mvmnt-plugin] Build failed for ${plugin.id}: ${plugin.error}`);
        }
    };
    const server = http.createServer((request, response) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/events') {
            response.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
            });
            response.write('retry: 1000\n:connected\n\n');
            clients.add(response);
            send(response, { type: 'snapshot', plugins: [...plugins.values()].map(status) });
            request.on('close', () => clients.delete(response));
            return;
        }
        if (url.pathname === '/status') {
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ protocolVersion: 2, plugins: [...plugins.values()].map(status) }));
            return;
        }
        const match = url.pathname.match(/^\/([^/]+)\.mvmnt-plugin$/);
        const plugin = match && plugins.get(decodeURIComponent(match[1]));
        if (plugin?.bytes) {
            response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
            response.end(plugin.bytes);
            return;
        }
        response.writeHead(404).end('Not found');
    });
    const requestedPort = options.port ?? DEFAULT_PORT;
    const exact = options.port !== undefined;
    let selectedPort;
    for (let port = requestedPort; port <= (exact ? requestedPort : requestedPort + PORT_COUNT - 1); port += 1) {
        try {
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, '127.0.0.1', resolve);
            });
            selectedPort = port;
            break;
        } catch (error) {
            server.removeAllListeners('error');
            if (error?.code !== 'EADDRINUSE' || exact) throw error;
        }
    }
    if (!selectedPort) throw new Error(`No available port in ${requestedPort}-${requestedPort + PORT_COUNT - 1}`);
    await Promise.all([...plugins.values()].map(rebuild));
    for (const plugin of plugins.values()) {
        let timer;
        const watcher = fs.watch(plugin.directory, { recursive: true }, (_event, filename) => {
            const value = String(filename ?? '').replaceAll('\\', '/');
            if (!value || value.split('/').some((part) => ['node_modules', 'dist', '.git', '.build'].includes(part)))
                return;
            clearTimeout(timer);
            timer = setTimeout(() => void rebuild(plugin), 150);
        });
        watchers.add(watcher);
    }
    const heartbeat = setInterval(() => {
        for (const client of clients) client.write(':heartbeat\n\n');
    }, 15_000);
    const close = () => {
        clearInterval(heartbeat);
        for (const watcher of watchers) watcher.close();
        watchers.clear();
        for (const plugin of plugins.values()) broadcast({ type: 'remove', pluginId: plugin.id });
        server.close();
    };
    console.log(`[mvmnt-plugin] Serving ${plugins.size} plugin(s) at http://localhost:${selectedPort}`);
    return { server, port: selectedPort, close };
}

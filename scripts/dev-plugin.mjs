#!/usr/bin/env node
import path from 'node:path';
import { startPluginDevServer } from '../packages/plugin-tools/src/dev.mjs';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const rawPort = portIndex >= 0 ? args.splice(portIndex, 2)[1] : undefined;
const port = rawPort === undefined ? undefined : Number(rawPort);
const directories = args.map((value) => path.resolve(value));

if (!directories.length) {
    console.error('Usage: npm run dev-plugin -- <plugin-directory> [<plugin-directory> ...] [--port <port>]');
    process.exitCode = 1;
} else if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    console.error('Error: --port must be an integer between 1 and 65535.');
    process.exitCode = 1;
} else {
    startPluginDevServer(directories, { port })
        .then((running) => {
            const shutdown = () => {
                running.close();
                process.exit(0);
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        })
        .catch((error) => {
            console.error(`[dev-plugin] ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        });
}

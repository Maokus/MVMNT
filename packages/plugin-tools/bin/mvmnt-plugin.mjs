#!/usr/bin/env node
import path from 'node:path';
import { writePluginArchive } from '../src/build.mjs';
import { checkPlugin } from '../src/check.mjs';
import { startPluginDevServer } from '../src/dev.mjs';

const [command = 'help', ...rawArgs] = process.argv.slice(2);
const takeOption = (args, name) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
};

async function main() {
    const args = [...rawArgs];
    if (command === 'build') {
        const output = takeOption(args, '--out');
        const result = await writePluginArchive(path.resolve(args[0] ?? '.'), output);
        console.log(`[mvmnt-plugin] Wrote ${result.outputPath} (${(result.bytes.length / 1024).toFixed(1)} KB)`);
        return;
    }
    if (command === 'check') {
        const result = await checkPlugin(path.resolve(args[0] ?? '.'));
        console.log(`[mvmnt-plugin] Check passed for ${result.manifest.id} (${result.checkedEntries} elements)`);
        return;
    }
    if (command === 'dev') {
        const rawPort = takeOption(args, '--port');
        const port = rawPort === undefined ? undefined : Number(rawPort);
        if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535))
            throw new Error('--port must be an integer between 1 and 65535');
        const directories = args.length ? args.map((value) => path.resolve(value)) : [process.cwd()];
        const running = await startPluginDevServer(directories, { port });
        const shutdown = () => {
            running.close();
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        return;
    }
    console.log('Usage: mvmnt-plugin <check|dev|build> [plugin-directory] [--port N] [--out FILE]');
}

main().catch((error) => {
    console.error(`mvmnt-plugin: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});

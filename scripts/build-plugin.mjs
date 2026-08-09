#!/usr/bin/env node
import path from 'node:path';
import { writePluginArchive } from '../packages/plugin-tools/src/build.mjs';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--out');
const output = outputIndex >= 0 ? args.splice(outputIndex, 2)[1] : undefined;
const pluginDirectory = args[0];

if (!pluginDirectory) {
    console.error('Usage: npm run build-plugin -- <plugin-directory> [--out <bundle-path>]');
    process.exitCode = 1;
} else {
    writePluginArchive(path.resolve(pluginDirectory), output)
        .then((result) => {
            console.log(`Built ${result.manifest.id}: ${result.outputPath}`);
        })
        .catch((error) => {
            console.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        });
}

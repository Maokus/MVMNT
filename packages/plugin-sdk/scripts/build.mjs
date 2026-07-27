import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
execFileSync(
    process.execPath,
    [resolve(root, '../../node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.json')],
    {
        stdio: 'inherit',
    }
);

const modules = [
    'index',
    'api',
    'animation',
    'audio',
    'render',
    'scene',
    'safety',
    'timeline',
    'timing',
    'utils',
    'visual-assets',
];
const sourceRuntimeModules = new Set(['animation', 'audio', 'scene', 'timeline', 'timing', 'utils', 'visual-assets']);
for (const moduleName of modules) {
    const entry = sourceRuntimeModules.has(moduleName)
        ? resolve(root, 'src', `${moduleName}.ts`)
        : resolve(root, 'runtime', `${moduleName}.js`);
    if (sourceRuntimeModules.has(moduleName)) {
        await build({
            entryPoints: [entry],
            outfile: resolve(dist, `${moduleName}.js`),
            bundle: false,
            format: 'esm',
            platform: 'neutral',
            target: 'es2020',
        });
    } else {
        cpSync(entry, resolve(dist, `${moduleName}.js`));
    }
    await build({
        entryPoints: [entry],
        outfile: resolve(dist, `${moduleName}.cjs`),
        bundle: true,
        format: 'cjs',
        platform: 'neutral',
        target: 'es2020',
    });
}

for (const file of readdirSync(dist).filter((name) => name.endsWith('.d.ts'))) {
    const declaration = readFileSync(resolve(dist, file), 'utf8');
    if (/@(?:app|audio|core|state|workspace)\//.test(declaration) || /zustand/i.test(declaration)) {
        throw new Error(`Published declaration '${file}' leaks an application-private type`);
    }
}

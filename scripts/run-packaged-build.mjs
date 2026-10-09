import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolvePackagedBuildChannel } from './build-channel.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const forgeCli = path.join(projectRoot, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const operation = process.argv[2];
const forgeArgs = {
    package: ['package'],
    make: ['make'],
    'make:mac': ['make', '--platform=darwin', '--arch=universal'],
    'make:win': ['make', '--platform=win32', '--arch=x64'],
    publish: ['publish'],
}[operation];

if (!forgeArgs) {
    console.error(`Unknown packaging command: ${operation ?? '(none)'}`);
    process.exit(1);
}

const env = { ...process.env, MVMNT_BUILD_CHANNEL: resolvePackagedBuildChannel(process.env.MVMNT_BUILD_CHANNEL) };

function run(command, args) {
    const result = spawnSync(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal) process.kill(process.pid, result.signal);
    if (result.status !== 0) process.exit(result.status ?? 1);
}

const npmCli = process.env.npm_execpath;
if (npmCli) run(process.execPath, [npmCli, 'run', 'build']);
else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

if (operation === 'make:mac') run(process.execPath, [path.join(projectRoot, 'scripts', 'clean-mac-make.cjs')]);
if (operation === 'make:win')
    run(process.execPath, [path.join(projectRoot, 'scripts', 'prepare-windows-squirrel.mjs')]);

run(process.execPath, [forgeCli, ...forgeArgs]);

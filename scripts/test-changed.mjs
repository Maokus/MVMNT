import { spawnSync } from 'node:child_process';

function gitLines(args) {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

const changed = new Set([
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
]);
const sourceFiles = [...changed].filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file));

if (sourceFiles.length === 0) {
    console.log('No changed TypeScript or JavaScript files; no related tests to run.');
    process.exit(0);
}

const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(runner, ['vitest', 'related', '--run', '--passWithNoTests', ...sourceFiles], {
    stdio: 'inherit',
});
process.exit(result.status ?? 1);

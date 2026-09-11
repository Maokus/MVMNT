import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = createHash('sha256');
hash.update(`${process.platform}:${process.arch}:${process.versions.node.split('.')[0]}`);
const ignoredTreeEntries = new Set(['.DS_Store', 'dist', 'node_modules']);
const hashTree = (path) => {
    if (statSync(path).isDirectory()) {
        for (const entry of readdirSync(path).sort()) {
            if (!ignoredTreeEntries.has(entry)) hashTree(join(path, entry));
        }
        return;
    }
    hash.update(path.slice(projectRoot.length));
    hash.update(readFileSync(path));
};
for (const path of [
    'packages/plugin-sdk',
    'packages/plugin-tools',
    'packages/create-mvmnt-plugin',
    'fixtures/plugin-sdk-v2',
    'scripts/build-plugin.mjs',
    'scripts/verify-plugin-sdk-pack.mjs',
    'package.json',
    'package-lock.json',
]) {
    hashTree(resolve(projectRoot, path));
}
const cacheDirectory = resolve(projectRoot, '.cache/plugin-sdk-pack');
const cacheStamp = join(cacheDirectory, `${hash.digest('hex')}.passed`);
if (existsSync(cacheStamp)) {
    console.log('[verify-plugin-sdk-pack] Unchanged SDK authoring path passed from cache');
    process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'mvmnt-sdk-pack-'));
const npmEnvironment = { ...process.env, npm_config_cache: join(work, '.npm-cache') };
const run = (command, args, options = {}) =>
    execFileSync(command, args, { stdio: 'inherit', env: npmEnvironment, ...options });
const pack = (directory) => {
    const output = execFileSync('npm', ['pack', resolve(projectRoot, directory), '--pack-destination', work], {
        encoding: 'utf8',
        env: npmEnvironment,
    }).trim();
    process.stdout.write(output + '\n');
    return join(work, output.split(/\r?\n/).at(-1));
};

const sdkTarball = pack('packages/plugin-sdk');
const toolsTarball = pack('packages/plugin-tools');
const creatorTarball = pack('packages/create-mvmnt-plugin');

for (const tarball of [sdkTarball, toolsTarball, creatorTarball]) {
    const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split(/\r?\n/);
    if (!files.includes('package/LICENSE')) throw new Error(`${basename(tarball)} is missing its package license`);
    run(resolve(projectRoot, 'node_modules/.bin/publint'), ['--strict', tarball]);
}

const sdkFiles = execFileSync('tar', ['-tzf', sdkTarball], { encoding: 'utf8' }).trim().split(/\r?\n/);
for (const expected of [
    'package/LICENSE',
    'package/README.md',
    'package/sdk-manifest.json',
    'package/src/api.ts',
    'package/src/utils.ts',
    'package/dist/api.d.ts.map',
    'package/dist/index.js',
]) {
    if (!sdkFiles.includes(expected)) throw new Error(`Packed SDK is missing ${expected}`);
}
if (sdkFiles.some((path) => path.includes('/node_modules/') || path.endsWith('.cjs'))) {
    throw new Error('Packed ESM-only SDK contains node_modules or a CommonJS artifact');
}

const extractedSdk = join(work, 'packed-sdk');
mkdirSync(extractedSdk);
run('tar', ['-xzf', sdkTarball, '-C', extractedSdk]);
for (const mapName of readdirSync(join(extractedSdk, 'package', 'dist')).filter((name) => name.endsWith('.d.ts.map'))) {
    const map = JSON.parse(readFileSync(join(extractedSdk, 'package', 'dist', mapName), 'utf8'));
    for (const source of map.sources ?? []) {
        if (!existsSync(resolve(extractedSdk, 'package', 'dist', source))) {
            throw new Error(`Broken declaration-map source in ${mapName}: ${source}`);
        }
    }
}
run(resolve(projectRoot, 'node_modules/.bin/attw'), ['--profile', 'esm-only', sdkTarball]);

const fixture = join(work, 'fixture');
cpSync(resolve(projectRoot, 'fixtures/plugin-sdk-v2'), fixture, { recursive: true });
const fixturePackagePath = join(fixture, 'package.json');
const fixturePackage = JSON.parse(readFileSync(fixturePackagePath, 'utf8'));
fixturePackage.dependencies['@mvmnt-app/plugin-sdk'] = `file:${sdkTarball}`;
fixturePackage.devDependencies = { '@mvmnt-app/plugin-tools': `file:${toolsTarball}`, typescript: '^5.9.3' };
writeFileSync(fixturePackagePath, `${JSON.stringify(fixturePackage, null, 2)}\n`);
run('npm', ['install'], { cwd: fixture });
run(process.execPath, [resolve(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', join(fixture, 'tsconfig.json')]);
run(join(fixture, 'node_modules/.bin/mvmnt-plugin'), ['check'], { cwd: fixture });
const fixtureArchive = join(work, 'fixture.mvmnt-plugin');
run(join(fixture, 'node_modules/.bin/mvmnt-plugin'), ['build', '--out', fixtureArchive], { cwd: fixture });
run(
    process.execPath,
    [
        '--input-type=commonjs',
        '-e',
        `try { require('@mvmnt-app/plugin-sdk'); process.exit(2); } catch (error) {
            if (!['ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_REQUIRE_ESM'].includes(error.code)) throw error;
        }`,
    ],
    { cwd: fixture }
);

const runner = join(work, 'creator-runner');
mkdirSync(runner);
writeFileSync(join(runner, 'package.json'), '{"private":true,"type":"module"}\n');
run('npm', ['install', `file:${creatorTarball}`], { cwd: runner });
const creator = join(runner, 'node_modules/create-mvmnt-plugin/bin/create-mvmnt-plugin.mjs');
for (const template of ['minimal', 'midi-spring']) {
    const pluginDirectory = join(work, `generated-${template}`);
    const pluginId = `com.example.release-${template}`;
    run(process.execPath, [creator, '--name', pluginId, '--template', template, '--dir', pluginDirectory], {
        cwd: runner,
    });
    const packagePath = join(pluginDirectory, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    packageJson.dependencies['@mvmnt-app/plugin-sdk'] = `file:${sdkTarball}`;
    packageJson.devDependencies['@mvmnt-app/plugin-tools'] = `file:${toolsTarball}`;
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    run('npm', ['install'], { cwd: pluginDirectory });
    run('npm', ['run', 'typecheck'], { cwd: pluginDirectory });
    run('npm', ['run', 'check'], { cwd: pluginDirectory });
    run('npm', ['run', 'build'], { cwd: pluginDirectory });
    const archiveName = readdirSync(join(pluginDirectory, 'dist')).find((name) => name.endsWith('.mvmnt-plugin'));
    if (!archiveName) throw new Error(`${template} scaffold did not produce a plugin archive`);
    const archive = unzipSync(readFileSync(join(pluginDirectory, 'dist', archiveName)));
    const manifest = JSON.parse(new TextDecoder().decode(archive['manifest.json']));
    if (manifest.apiVersion !== '^2.2.0' || manifest.elements.length !== 1) {
        throw new Error(`${template} scaffold produced an unexpected manifest`);
    }
    const entry = manifest.elements[0].entry;
    if (!archive[entry] || !entry.startsWith('elements/')) {
        throw new Error(`${template} scaffold archive is missing its bundled element`);
    }
}

mkdirSync(cacheDirectory, { recursive: true });
writeFileSync(cacheStamp, `${new Date().toISOString()}\n`);
console.log(`[verify-plugin-sdk-pack] Packed SDK, tools, and scaffolds passed in ${basename(work)}`);

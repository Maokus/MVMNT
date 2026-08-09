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
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = createHash('sha256');
hash.update(`${process.platform}:${process.arch}:${process.versions.node.split('.')[0]}`);
const hashTree = (path) => {
    if (statSync(path).isDirectory()) {
        for (const entry of readdirSync(path).sort()) hashTree(join(path, entry));
        return;
    }
    hash.update(path.slice(projectRoot.length));
    hash.update(readFileSync(path));
};
hashTree(resolve(projectRoot, 'packages/plugin-sdk'));
hashTree(resolve(projectRoot, 'fixtures/plugin-sdk-v2'));
hashTree(resolve(projectRoot, 'scripts/build-plugin.mjs'));
const cacheDirectory = resolve(projectRoot, '.cache/plugin-sdk-pack');
const cacheStamp = join(cacheDirectory, `${hash.digest('hex')}.passed`);
if (existsSync(cacheStamp)) {
    console.log(`[verify-plugin-sdk-pack] Unchanged SDK fixture passed from cache`);
    process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'mvmnt-sdk-pack-'));
const fixture = join(work, 'fixture');
const npmEnvironment = { ...process.env, npm_config_cache: join(work, '.npm-cache') };
cpSync(resolve(projectRoot, 'fixtures/plugin-sdk-v2'), fixture, { recursive: true });

execFileSync('npm', ['pack', resolve(projectRoot, 'packages/plugin-sdk'), '--pack-destination', work], {
    stdio: 'inherit',
    env: npmEnvironment,
});
const packedTarballs = readdirSync(work).filter((entry) => entry.endsWith('.tgz'));
if (packedTarballs.length !== 1) {
    throw new Error(`Expected npm pack to create one tarball, found ${packedTarballs.length}`);
}
const tarball = join(work, packedTarballs[0]);
const fixturePackagePath = join(fixture, 'package.json');
const fixturePackage = JSON.parse(readFileSync(fixturePackagePath, 'utf8'));
fixturePackage.dependencies['@mvmnt-app/plugin-sdk'] = `file:${tarball}`;
writeFileSync(fixturePackagePath, `${JSON.stringify(fixturePackage, null, 2)}\n`);

execFileSync('npm', ['install', '--ignore-scripts'], { cwd: fixture, stdio: 'inherit', env: npmEnvironment });
execFileSync(
    process.execPath,
    [resolve(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', join(fixture, 'tsconfig.json')],
    { stdio: 'inherit' }
);
execFileSync(
    process.execPath,
    [resolve(projectRoot, 'scripts/build-plugin.mjs'), fixture, '--out', join(work, 'fixture.mvmnt-plugin')],
    { stdio: 'inherit' }
);

mkdirSync(cacheDirectory, { recursive: true });
writeFileSync(cacheStamp, `${new Date().toISOString()}\n`);
console.log(`[verify-plugin-sdk-pack] Packed SDK fixture passed in ${work}`);

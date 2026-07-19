import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = mkdtempSync(join(tmpdir(), 'mvmnt-sdk-pack-'));
const fixture = join(work, 'fixture');
const npmEnvironment = { ...process.env, npm_config_cache: join(work, '.npm-cache') };
cpSync(resolve(projectRoot, 'fixtures/plugin-sdk-v2'), fixture, { recursive: true });

execFileSync('npm', ['pack', resolve(projectRoot, 'packages/plugin-sdk'), '--pack-destination', work], { stdio: 'inherit', env: npmEnvironment });
const tarball = join(work, 'mvmnt-app-plugin-sdk-2.0.0.tgz');
const fixturePackagePath = join(fixture, 'package.json');
const fixturePackage = JSON.parse(readFileSync(fixturePackagePath, 'utf8'));
fixturePackage.dependencies['@mvmnt-app/plugin-sdk'] = `file:${tarball}`;
writeFileSync(fixturePackagePath, `${JSON.stringify(fixturePackage, null, 2)}\n`);

execFileSync('npm', ['install', '--ignore-scripts'], { cwd: fixture, stdio: 'inherit', env: npmEnvironment });
execFileSync(process.execPath, [resolve(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', join(fixture, 'tsconfig.json')], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(projectRoot, 'scripts/build-plugin.mjs'), fixture, '--out', join(work, 'fixture.mvmnt-plugin')], { stdio: 'inherit' });

console.log(`[verify-plugin-sdk-pack] Packed SDK fixture passed in ${work}`);

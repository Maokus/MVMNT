import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const forgeConfig = require('../../forge.config.cjs');
const manifest = require('../../package.json');

function debOptionsForChannel(channel: 'stable' | 'nightly') {
    const result = spawnSync(
        process.execPath,
        [
            '-e',
            "const c = require('./forge.config.cjs'); console.log(JSON.stringify(c.makers.find(m => m.name.endsWith('maker-deb')).config.options))",
        ],
        { cwd: resolve(process.cwd()), env: { ...process.env, MVMNT_BUILD_CHANNEL: channel }, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
}

describe('Linux desktop packaging', () => {
    it('builds a Debian package and portable archive with a working launcher', () => {
        const linuxMakers = forgeConfig.makers.filter((maker: { platforms?: string[] }) =>
            maker.platforms?.includes('linux')
        );
        expect(linuxMakers.map((maker: { name: string }) => maker.name)).toEqual([
            '@electron-forge/maker-deb',
            '@electron-forge/maker-zip',
        ]);
        for (const maker of linuxMakers) expect(() => require.resolve(maker.name)).not.toThrow();
        expect(debOptionsForChannel('stable')).toMatchObject({ name: 'mvmnt', bin: 'MVMNT', productName: 'MVMNT' });
        expect(manifest.scripts['make:linux']).toContain('run-packaged-build.mjs make:linux');
        expect(debOptionsForChannel('nightly')).toMatchObject({
            name: 'mvmnt-nightly',
            bin: 'MVMNT Nightly',
            productName: 'MVMNT Nightly',
        });
    });

    it('uploads Linux outputs for nightlies and includes them in draft releases', () => {
        const nightly = readFileSync(resolve('.github/workflows/testing-builds.yml'), 'utf8');
        const release = readFileSync(resolve('.github/workflows/desktop-release.yml'), 'utf8');
        expect(nightly).toContain('command: npm run make:linux');
        expect(nightly).toContain('out/make/**/*.deb');
        expect(nightly).toContain('out/make/**/*.zip');
        expect(release).toContain('xvfb-run -a npm run test:electron');
        expect(release).toContain('npm run make:linux');
        expect(release).toContain('needs: [macos, windows, linux]');
        expect(release).toContain('name: linux-release');
    });
});

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import packageManifest from '../../package.json';

const require = createRequire(import.meta.url);
const forgeConfig = require('../../forge.config.cjs');

describe('macOS packaging dependencies', () => {
    it('makes appdmg optional so Linux verification installs succeed', () => {
        expect(packageManifest.optionalDependencies.appdmg).toBeDefined();

        if (process.platform === 'darwin') {
            expect(require.resolve('appdmg')).toContain('node_modules/appdmg');
        }
    });

    it('only passes appdmg-supported options to the DMG maker', () => {
        const dmgMaker = forgeConfig.makers.find((maker: { name: string }) => maker.name.includes('maker-dmg'));

        expect(dmgMaker?.config.additionalDMGOptions).toBeUndefined();
    });

    it('gives nightly builds a separate identity without file or protocol claims', () => {
        const configPath = require.resolve('../../forge.config.cjs');
        const previousChannel = process.env.MVMNT_BUILD_CHANNEL;
        process.env.MVMNT_BUILD_CHANNEL = 'nightly';
        delete require.cache[configPath];
        const nightlyConfig = require(configPath);
        if (previousChannel === undefined) delete process.env.MVMNT_BUILD_CHANNEL;
        else process.env.MVMNT_BUILD_CHANNEL = previousChannel;
        delete require.cache[configPath];

        expect(nightlyConfig.packagerConfig.name).toBe('MVMNT Nightly');
        expect(nightlyConfig.packagerConfig.appBundleId).toBe('us.maok.mvmnt.nightly');
        expect(nightlyConfig.packagerConfig.protocols).toEqual([]);
        expect(nightlyConfig.packagerConfig.extendInfo.CFBundleDocumentTypes).toEqual([]);
        expect(
            nightlyConfig.makers.find((maker: { name: string }) => maker.name.includes('squirrel')).config.name
        ).toBe('mvmnt-nightly');
    });

    it('defines traceable testing artifacts and validates stable release tags', () => {
        const testingWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/testing-builds.yml'), 'utf8');
        const releaseWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/desktop-release.yml'), 'utf8');

        expect(testingWorkflow).toContain('-nightly.${build_date}.${GITHUB_RUN_NUMBER}');
        expect(testingWorkflow).toContain('MVMNT-Nightly-${{ needs.metadata.outputs.version }}');
        expect(releaseWorkflow).toContain('Verify tag matches package version');
        expect(releaseWorkflow).toContain("MVMNT_SKIP_MAC_SIGNING: '1'");
    });
});

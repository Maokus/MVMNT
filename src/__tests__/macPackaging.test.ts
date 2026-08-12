import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import packageManifest from '../../package.json';

const require = createRequire(import.meta.url);
const forgeConfig = require('../../forge.config.cjs');
const { nativePackageVersions } = require('../../scripts/native-package-version.cjs');

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
        expect(dmgMaker?.config.name).toBeUndefined();
    });

    it('validates cached universal Electron archives without fetching GitHub checksums', () => {
        expect(forgeConfig.packagerConfig.download.checksums).toEqual({
            'electron-v43.3.0-darwin-arm64.zip': 'ee939d1564d83d61032b3b3cb23af4e46005a4900c91f0695f7ed793f0ce6e83',
            'electron-v43.3.0-darwin-x64.zip': '7347bbd5fb529eea64f9c2d148bb1c19222d98946ff234ffe27953a1bbcb9dae',
            'electron-v43.3.0-win32-x64.zip': '18528bedc6a9b04bdc5efb7b803cbc3cb0e5ea6415d54046e23d464d89a00da9',
        });
    });

    it('gives nightly builds a separate identity without file or protocol claims', () => {
        const configPath = require.resolve('../../forge.config.cjs');
        const previousChannel = process.env.MVMNT_BUILD_CHANNEL;
        const previousBuildNumber = process.env.MVMNT_NIGHTLY_BUILD_NUMBER;
        process.env.MVMNT_BUILD_CHANNEL = 'nightly';
        process.env.MVMNT_NIGHTLY_BUILD_NUMBER = '13';
        delete require.cache[configPath];
        const nightlyConfig = require(configPath);
        if (previousChannel === undefined) delete process.env.MVMNT_BUILD_CHANNEL;
        else process.env.MVMNT_BUILD_CHANNEL = previousChannel;
        if (previousBuildNumber === undefined) delete process.env.MVMNT_NIGHTLY_BUILD_NUMBER;
        else process.env.MVMNT_NIGHTLY_BUILD_NUMBER = previousBuildNumber;
        delete require.cache[configPath];

        expect(nightlyConfig.packagerConfig.name).toBe('MVMNT Nightly');
        expect(nightlyConfig.packagerConfig.appBundleId).toBe('us.maok.mvmnt.nightly');
        expect(nightlyConfig.packagerConfig.protocols).toEqual([]);
        expect(nightlyConfig.packagerConfig.extendInfo.CFBundleDocumentTypes).toEqual([]);
        expect(nightlyConfig.packagerConfig.appVersion).toBe('0.16.0');
        expect(nightlyConfig.packagerConfig.buildVersion).toBe('0.16.0.13');
        expect(
            nightlyConfig.makers.find((maker: { name: string }) => maker.name.includes('squirrel')).config.name
        ).toBe('mvmnt-nightly');
    });

    it('maps a full nightly SemVer to native-safe numeric version resources', () => {
        expect(nativePackageVersions('0.16.0-nightly.20260812.13', 'nightly', '13')).toEqual({
            appVersion: '0.16.0',
            buildVersion: '0.16.0.13',
        });
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

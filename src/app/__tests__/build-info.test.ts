import { describe, expect, it } from 'vitest';
import {
    compareStableVersions,
    createBuildInfo,
    formatDisplayVersion,
    resolveUpdateAvailability,
    releaseLine,
    shouldEnableDevelopmentTools,
} from '../../../electron/shared/build-info';
import { resolveBuildChannel } from '../../../scripts/build-channel.mjs';

describe('build information', () => {
    it('formats development, nightly, and stable versions consistently', () => {
        expect(formatDisplayVersion('0.16.0', 'development', '61ed4413')).toBe('0.16.0-dev+61ed4413');
        expect(formatDisplayVersion('0.16.0-nightly.20260812.123', 'nightly', '61ed4413')).toBe(
            '0.16.0-nightly.20260812.123'
        );
        expect(formatDisplayVersion('0.16.0', 'stable', '61ed4413')).toBe('0.16.0');
        expect(releaseLine('0.16.0-nightly.20260812.123')).toBe('0.16.0');
    });

    it('only enables update checks for supported packaged stable builds', () => {
        const base = { version: '0.16.0', commit: 'abc12345', builtAt: '2026-08-12T00:00:00Z' };
        expect(
            createBuildInfo({ ...base, channel: 'stable', isPackaged: true, platform: 'darwin' }).updateChecksEnabled
        ).toBe(true);
        expect(
            createBuildInfo({ ...base, channel: 'nightly', isPackaged: true, platform: 'darwin' }).updateChecksEnabled
        ).toBe(false);
        expect(
            createBuildInfo({ ...base, channel: 'stable', isPackaged: false, platform: 'darwin' }).updateChecksEnabled
        ).toBe(false);
        expect(
            createBuildInfo({ ...base, channel: 'stable', isPackaged: true, platform: 'linux' }).updateChecksEnabled
        ).toBe(false);
    });

    it('uses development, nightly, and stable as the only channel authority', () => {
        expect(resolveBuildChannel(undefined)).toBe('development');
        expect(resolveBuildChannel('nightly')).toBe('nightly');
        expect(resolveBuildChannel('stable')).toBe('stable');
        expect(() => resolveBuildChannel('beta')).toThrow('Invalid MVMNT_BUILD_CHANNEL: beta');

        expect(shouldEnableDevelopmentTools('development', true)).toBe(true);
        expect(shouldEnableDevelopmentTools('development', false)).toBe(false);
        expect(shouldEnableDevelopmentTools('nightly', true)).toBe(false);
        expect(shouldEnableDevelopmentTools('stable', true)).toBe(false);
    });

    it('compares stable versions and rejects non-stable input', () => {
        expect(compareStableVersions('0.16.0', 'v0.17.0')).toBe(-1);
        expect(compareStableVersions('0.16.0', '0.16.0')).toBe(0);
        expect(compareStableVersions('0.16.1', '0.16.0')).toBe(1);
        expect(compareStableVersions('0.16.0-nightly.1', '0.16.0')).toBeNull();
    });

    it('accepts only published stable release metadata', () => {
        const url = 'https://github.com/Maokus/MVMNT/releases/latest';
        expect(resolveUpdateAvailability('0.16.0', { tag_name: 'v0.17.0' }, url)).toEqual({
            status: 'available',
            latestVersion: '0.17.0',
            downloadUrl: url,
        });
        expect(resolveUpdateAvailability('0.16.0', { tag_name: 'v0.16.0' }, url)).toEqual({
            status: 'current',
            latestVersion: '0.16.0',
        });
        expect(resolveUpdateAvailability('0.16.0', { tag_name: 'v0.17.0', prerelease: true }, url)).toEqual({
            status: 'error',
        });
        expect(resolveUpdateAvailability('0.16.0', { tag_name: 'nightly' }, url)).toEqual({ status: 'error' });
    });
});

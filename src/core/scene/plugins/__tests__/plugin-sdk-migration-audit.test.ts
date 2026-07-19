import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';

const root = resolve(__dirname, '../../../../../');
const auditedRoots = ['src/core/scene/elements', 'src/pluginexamples', 'src/plugins'];
const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const path = resolve(directory, entry);
        return statSync(path).isDirectory()
            ? sourceFiles(path)
            : path.endsWith('.ts') && !path.includes('/__tests__/')
              ? [path]
              : [];
    });

const matches = (pattern: RegExp): string[] =>
    auditedRoots
        .flatMap((directory) => sourceFiles(resolve(root, directory)))
        .filter((path) => pattern.test(readFileSync(path, 'utf8')));

/**
 * Temporary, shrinking migration baseline. Adding a file here requires API review;
 * each SDK 2 migration must remove its entry/count rather than increasing it.
 */
describe('SDK 1 removal migration audit', () => {
    it('keeps class-based renderers inside the reviewed engine-private allowlist', () => {
        const allowed = [
            'src/core/scene/elements/audio-debug/audio-adhoc-profile.ts',
            'src/core/scene/elements/audio-debug/audio-bad-req.ts',
            'src/core/scene/elements/audio-debug/audio-debug.ts',
            'src/core/scene/elements/audio-debug/audio-minimal.ts',
            'src/core/scene/elements/audio-debug/audio-odd-profile.ts',
            'src/core/scene/elements/audio-displays/audio-locked-oscilloscope.ts',
            'src/core/scene/elements/audio-displays/audio-peaks.ts',
            'src/core/scene/elements/audio-displays/audio-spectrum.ts',
            'src/core/scene/elements/audio-displays/audio-volume-meter.ts',
            'src/core/scene/elements/audio-displays/audio-waveform.ts',
            'src/core/scene/elements/midi-displays/chord-estimate-display.ts',
            'src/core/scene/elements/midi-displays/moving-notes-piano-roll/moving-notes-piano-roll.ts',
            'src/core/scene/elements/midi-displays/time-unit-piano-roll/time-unit-piano-roll.ts',
            'src/core/scene/elements/misc/missing-plugin.ts',
        ]
            .map((path) => resolve(root, path))
            .sort();
        expect(matches(/export\s+class\s+\w+\s+extends\s+SceneElement/).sort()).toEqual(allowed);
    });

    it('isolates module-scope requirement fixtures from shipped clients', () => {
        expect(
            matches(
                /getRequiredPluginApi|getPluginHostApi|timelineApi|audioApi|audioRawApi|timingApi|sampleAudio|registerFeatureRequirements/
            ).every((path) => path.includes('/audio-debug/'))
        ).toBe(true);
    });

    it('does not grow SDK 1 source manifests', () => {
        const manifests = ['src/pluginexamples', 'src/plugins'].flatMap((directory) => {
            const visit = (path: string): string[] =>
                readdirSync(path).flatMap((entry) => {
                    const child = resolve(path, entry);
                    return statSync(child).isDirectory() ? visit(child) : entry === 'plugin.json' ? [child] : [];
                });
            return visit(resolve(root, directory));
        });
        expect(manifests.filter((path) => /"apiVersion"\s*:\s*"\^1\./.test(readFileSync(path, 'utf8')))).toHaveLength(
            0
        );
    });

    it('keeps current archives on SDK 2 and one frozen v1 compatibility fixture', () => {
        const archives = readdirSync(resolve(root, 'dist')).filter((name) => name.endsWith('.mvmnt-plugin'));
        for (const archive of archives) {
            const files = unzipSync(readFileSync(resolve(root, 'dist', archive)));
            const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
            expect(manifest.apiVersion, archive).toBe('^2.0.0');
        }
        expect(
            readdirSync(resolve(root, 'fixtures/plugin-sdk-v1-compat')).filter((name) => name.endsWith('.mvmnt-plugin'))
        ).toHaveLength(1);
    });
});

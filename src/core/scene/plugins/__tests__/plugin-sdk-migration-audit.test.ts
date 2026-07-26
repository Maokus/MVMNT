import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';

const root = resolve(__dirname, '../../../../../');
const auditedRoots = ['src/core/scene/elements', 'src/plugins'];
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
 * Guards the SDK 2-only source boundary. Class-based built-ins remain engine-private,
 * but global SDK accessors and SDK 1 imports must not return.
 */
describe('SDK 2 source audit', () => {
    it('keeps class-based renderers inside the reviewed engine-private allowlist', () => {
        const allowed = [
            'src/core/scene/elements/audio-displays/audio-locked-oscilloscope.ts',
            'src/core/scene/elements/audio-displays/audio-peaks.ts',
            'src/core/scene/elements/audio-displays/audio-spectrum.ts',
            'src/core/scene/elements/audio-displays/audio-spectrogram.ts',
            'src/core/scene/elements/audio-displays/audio-volume-meter.ts',
            'src/core/scene/elements/audio-displays/audio-vectorscope.ts',
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

    it('contains no removed global accessors, proxies, shortcuts, or SDK 1 imports', () => {
        expect(
            matches(
                /getRequiredPluginApi|getPluginHostApi|timelineApi|audioApi|audioRawApi|timingApi|utilitiesApi|audioCalculatorsApi|sampleAudio|@mvmnt\/plugin-sdk/
            )
        ).toEqual([]);
    });

    it('keeps every source manifest on SDK 2', () => {
        const manifests = ['src/plugins'].flatMap((directory) => {
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

    it('keeps current archives on SDK 2', () => {
        const archivesDir = resolve(root, 'dist', 'plugins');
        const archives = readdirSync(archivesDir).filter((name) => name.endsWith('.mvmnt-plugin'));
        for (const archive of archives) {
            const files = unzipSync(readFileSync(resolve(archivesDir, archive)));
            const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
            expect(manifest.apiVersion, archive).toBe('^2.0.0');
        }
    });
});

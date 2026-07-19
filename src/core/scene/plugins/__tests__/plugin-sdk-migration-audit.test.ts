import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../../');
const auditedRoots = ['src/core/scene/elements', 'src/pluginexamples', 'src/plugins'];
const sourceFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') && !path.includes('/__tests__/') ? [path] : [];
});

const matches = (pattern: RegExp): string[] => auditedRoots
    .flatMap((directory) => sourceFiles(resolve(root, directory)))
    .filter((path) => pattern.test(readFileSync(path, 'utf8')));

/**
 * Temporary, shrinking migration baseline. Adding a file here requires API review;
 * each SDK 2 migration must remove its entry/count rather than increasing it.
 */
describe('SDK 1 removal migration audit', () => {
    it('does not grow the class-based element baseline', () => {
        expect(matches(/export\s+class\s+\w+\s+extends\s+SceneElement/)).toHaveLength(30);
    });

    it('does not grow global accessor, shortcut, or module-scope feature registration debt', () => {
        expect(matches(/getRequiredPluginApi|getPluginHostApi|timelineApi|audioApi|audioRawApi|timingApi|sampleAudio|registerFeatureRequirements/)).toHaveLength(28);
    });

    it('does not grow SDK 1 source manifests', () => {
        const manifests = ['src/pluginexamples', 'src/plugins'].flatMap((directory) => {
            const visit = (path: string): string[] => readdirSync(path).flatMap((entry) => {
                const child = resolve(path, entry);
                return statSync(child).isDirectory() ? visit(child) : entry === 'plugin.json' ? [child] : [];
            });
            return visit(resolve(root, directory));
        });
        expect(manifests.filter((path) => /"apiVersion"\s*:\s*"\^1\./.test(readFileSync(path, 'utf8')))).toHaveLength(8);
    });
});

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const cliPath = resolve(process.cwd(), 'packages/create-mvmnt-plugin/bin/create-mvmnt-plugin.mjs');
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
    const directory = mkdtempSync(join(tmpdir(), 'create-mvmnt-plugin-'));
    temporaryDirectories.push(directory);
    return directory;
}

function runCli(cwd: string, args: string[]) {
    return spawnSync(process.execPath, [cliPath, ...args], {
        cwd,
        encoding: 'utf8',
    });
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('create-mvmnt-plugin CLI', () => {
    it('generates every template with schema builders and packages them together', async () => {
        const sdkBuild = spawnSync('npm', ['run', 'build', '--workspace', '@mvmnt-app/plugin-sdk'], {
            cwd: process.cwd(),
            encoding: 'utf8',
        });
        expect(sdkBuild.status, `${sdkBuild.stdout}\n${sdkBuild.stderr}`).toBe(0);
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'all-templates');
        const templates = [
            'minimal',
            'basic-shape',
            'text-display',
            'midi-notes',
            'audio-reactive',
            'image-simple',
            'bundled-image',
            'image-atlas',
            'grid-atlas',
        ];
        expect(
            runCli(cwd, ['--name', 'com.example.templates', '--template', templates[0], '--dir', pluginDir]).status
        ).toBe(0);
        for (const [index, template] of templates.slice(1).entries()) {
            expect(runCli(pluginDir, ['add', `example-${index + 1}`, '--template', template]).status).toBe(0);
        }
        const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
        for (const element of manifest.elements) {
            const source = readFileSync(join(pluginDir, element.entry), 'utf8');
            expect(source).toContain('group(');
            expect(source).toMatch(/tab\.[a-z]+\(/);
            expect(source).toContain('prop.');
            expect(source).not.toContain('capabilities:');
        }
        symlinkSync(resolve(process.cwd(), 'node_modules'), join(pluginDir, 'node_modules'), 'dir');
        const check = spawnSync(
            process.execPath,
            [resolve(process.cwd(), 'packages/plugin-tools/bin/mvmnt-plugin.mjs'), 'check'],
            { cwd: pluginDir, encoding: 'utf8' }
        );
        expect(check.status, `${check.stdout}\n${check.stderr}`).toBe(0);
        expect(check.stdout).toContain(`(${templates.length} elements)`);
    }, 30_000);

    it('creates a plugin with template capabilities and distinct display names', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'visuals');
        const result = runCli(cwd, [
            '--name',
            'com.example.visuals',
            '--plugin-name',
            'Example Visuals',
            '--element-name',
            'Audio Pulse',
            '--description',
            'Responds to raw audio',
            '--template',
            'audio-reactive',
            '--dir',
            pluginDir,
        ]);

        expect(result.status, result.stderr).toBe(0);
        const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
        expect(manifest.name).toBe('Example Visuals');
        expect(manifest.elements).toEqual([
            {
                type: 'visuals',
                entry: 'src/visuals.ts',
                capabilities: { required: ['audio.raw.read'], optional: [] },
            },
        ]);
        const source = readFileSync(join(pluginDir, 'src/visuals.ts'), 'utf8');
        expect(source).toContain("type: 'visuals'");
        expect(source).toContain("metadata: { name: 'Audio Pulse'");
        expect(source).toContain("description: 'Responds to raw audio'");
    });

    it('adds an element to the plugin in the current directory', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'visuals');
        const createResult = runCli(cwd, [
            '--name',
            'com.example.visuals',
            '--template',
            'minimal',
            '--dir',
            pluginDir,
        ]);
        expect(createResult.status, createResult.stderr).toBe(0);

        const addResult = runCli(pluginDir, [
            'add',
            'note-viewer',
            '--element-name',
            'Note Viewer',
            '--description',
            "Shows today's notes",
            '--template',
            'midi-notes',
        ]);

        expect(addResult.status, addResult.stderr).toBe(0);
        const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
        expect(manifest.elements).toHaveLength(2);
        expect(manifest.elements[1]).toEqual({
            type: 'note-viewer',
            entry: 'src/note-viewer.ts',
            capabilities: { required: ['timeline.read', 'midi.utils'], optional: [] },
        });
        const source = readFileSync(join(pluginDir, 'src/note-viewer.ts'), 'utf8');
        expect(source).toContain("type: 'note-viewer'");
        expect(source).toContain("metadata: { name: 'Note Viewer'");
        expect(source).toContain("description: 'Shows today\\'s notes'");
    });

    it('rejects duplicate element types without changing the manifest', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'visuals');
        const createResult = runCli(cwd, [
            '--name',
            'com.example.visuals',
            '--template',
            'minimal',
            '--dir',
            pluginDir,
        ]);
        expect(createResult.status, createResult.stderr).toBe(0);
        const manifestBefore = readFileSync(join(pluginDir, 'plugin.json'), 'utf8');

        const addResult = runCli(pluginDir, ['add', 'visuals', '--template', 'basic-shape']);

        expect(addResult.status).toBe(1);
        expect(addResult.stderr).toContain("Element type 'visuals' already exists");
        expect(readFileSync(join(pluginDir, 'plugin.json'), 'utf8')).toBe(manifestBefore);
    });
});

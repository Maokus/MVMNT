import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    addPromptQuestions,
    createPromptQuestions,
    type PromptQuestion,
} from '../../../packages/create-mvmnt-plugin/bin/create-mvmnt-plugin.mjs';

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

function evaluateInitial(question: PromptQuestion, values: Record<string, string>) {
    expect(typeof question.initial).toBe('function');
    if (typeof question.initial !== 'function') throw new Error('Expected a dynamic prompt initial value.');
    return question.initial(undefined, values);
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('create-mvmnt-plugin CLI', () => {
    it('prompts for create fields in order and derives readable element defaults', () => {
        const questions = createPromptQuestions({});

        expect(questions.map((question) => question.name)).toEqual([
            'name',
            'dir',
            'element',
            'elementName',
            'template',
        ]);
        expect(questions[2].message).toContain('kebab-case');
        expect(evaluateInitial(questions[2], { name: 'com.example.my-plugin-element' })).toBe('my-plugin-element');
        expect(evaluateInitial(questions[3], { element: 'my-plugin-element' })).toBe('My Plugin Element');
    });

    it('prompts for add fields in order with a kebab-case example and derived display name', () => {
        const questions = addPromptQuestions({});

        expect(questions.map((question) => question.name)).toEqual(['element', 'elementName', 'template']);
        expect(questions[0].initial).toBe('my-plugin-element');
        expect(evaluateInitial(questions[1], { element: String(questions[0].initial) })).toBe('My Plugin Element');
    });

    it('generates every template with schema builders and packages them together', async () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'all-templates');
        const templates = [
            'minimal',
            'basic-shape',
            'text-display',
            'midi-notes',
            'midi-spring',
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

    it('creates a first element with an explicit type and a display name derived from it', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'visuals');
        const result = runCli(cwd, [
            '--name',
            'com.example.visuals',
            '--element',
            'my-plugin-element',
            '--template',
            'minimal',
            '--dir',
            pluginDir,
        ]);

        expect(result.status, result.stderr).toBe(0);
        const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
        expect(manifest.elements[0].type).toBe('my-plugin-element');
        expect(manifest.elements[0].entry).toBe('src/my-plugin-element.ts');
        const source = readFileSync(join(pluginDir, 'src/my-plugin-element.ts'), 'utf8');
        expect(source).toContain("type: 'my-plugin-element'");
        expect(source).toContain("name: 'My Plugin Element'");
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

    it('detects a plugin from a nested directory when --element implies add', () => {
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

        const addResult = runCli(join(pluginDir, 'src'), ['--element', 'note-trails', '--template', 'midi-notes']);

        expect(addResult.status, addResult.stderr).toBe(0);
        expect(addResult.stdout).toContain('Added note-trails to com.example.visuals');
        const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
        expect(manifest.elements.at(-1)).toEqual({
            type: 'note-trails',
            entry: 'src/note-trails.ts',
            capabilities: { required: ['timeline.read', 'midi.utils'], optional: [] },
        });
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

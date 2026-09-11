import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    addPromptQuestions,
    createPromptQuestions,
    renderElementTemplate,
    type PromptQuestion,
} from '../../../packages/create-mvmnt-plugin/bin/create-mvmnt-plugin.mjs';
import { isValidPluginId, targetsSdk2 } from '@mvmnt-app/plugin-contract';
import { validateManifest } from '../../../packages/plugin-tools/src/contract.mjs';

const cliPath = resolve(process.cwd(), 'packages/create-mvmnt-plugin/bin/create-mvmnt-plugin.mjs');
const temporaryDirectories: string[] = [];
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

function runNpm(cwd: string, args: string[]) {
    return spawnSync('npm', args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_offline: 'true' },
    });
}

function useLocalToolingPackages(pluginDir: string) {
    const root = process.cwd();
    const packagePath = join(pluginDir, 'package.json');
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    manifest.dependencies['@mvmnt-app/plugin-sdk'] = `file:${resolve(root, 'packages/plugin-sdk')}`;
    Object.assign(manifest.devDependencies, {
        '@mvmnt-app/plugin-contract': `file:${resolve(root, 'packages/plugin-contract')}`,
        '@mvmnt-app/plugin-tools': `file:${resolve(root, 'packages/plugin-tools')}`,
        esbuild: `file:${resolve(root, 'node_modules/esbuild')}`,
        fflate: `file:${resolve(root, 'node_modules/fflate')}`,
        typescript: `file:${resolve(root, 'node_modules/typescript')}`,
    });
    writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
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

    it.each(templates)(
        'creates, installs, typechecks, checks, and builds the %s template',
        (template) => {
            const cwd = temporaryDirectory();
            const pluginDir = join(cwd, template);
            const create = runCli(cwd, [
                'create',
                '--name',
                `com.example.${template}`,
                '--template',
                template,
                '--dir',
                pluginDir,
            ]);
            expect(create.status, create.stderr).toBe(0);
            useLocalToolingPackages(pluginDir);

            for (const args of [
                ['install', '--ignore-scripts', '--package-lock=false'],
                ['run', 'typecheck'],
                ['run', 'check'],
                ['run', 'build'],
            ]) {
                const result = runNpm(pluginDir, args);
                expect(result.status, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`).toBe(0);
            }
        },
        120_000
    );

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

    it('safely serializes and renders unusual display text', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, "quoted plugin's path");
        const pluginName = 'Visuals "Deluxe"\nSecond line';
        const elementName = 'Today\'s \\ visual\n"mix"';
        const description = "Line one\r\nLine two's \\ path";
        const result = runCli(cwd, [
            '--name',
            'com.example.quoted',
            '--plugin-name',
            pluginName,
            '--element-name',
            elementName,
            '--description',
            description,
            '--template',
            'minimal',
            '--dir',
            pluginDir,
        ]);

        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8')).name).toBe(pluginName);
        const source = readFileSync(join(pluginDir, 'src/quoted.ts'), 'utf8');
        expect(source).toContain("name: 'Today\\'s \\\\ visual\\n\"mix\"'");
        expect(source).toContain("description: 'Line one\\r\\nLine two\\'s \\\\ path'");
        expect(source).not.toContain('{{ELEMENT_');
        expect(result.stdout).toContain(`cd '${pluginDir.replace(/'/g, `'\\''`)}'`);
    });

    it('fails clearly when an element template omits a required placeholder', () => {
        expect(() =>
            renderElementTemplate("type: '{{ELEMENT_TYPE}}'; name: '{{ELEMENT_NAME}}'", {
                ELEMENT_TYPE: 'pulse',
                ELEMENT_NAME: 'Pulse',
                ELEMENT_DESCRIPTION: 'A pulse',
            })
        ).toThrow('missing required placeholders: ELEMENT_DESCRIPTION');
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

    it('infers create for --element outside a plugin and honors explicit commands', () => {
        const cwd = temporaryDirectory();
        const inferred = runCli(cwd, ['--element', 'pulse', '--template', 'minimal', '--dir', join(cwd, 'new-plugin')]);
        expect(inferred.status).toBe(1);
        expect(inferred.stderr).toContain('Pass both --name and --template when creating non-interactively');
        expect(inferred.stderr).not.toContain('existing plugin manifest');

        const pluginDir = join(cwd, 'existing');
        expect(
            runCli(cwd, ['create', '--name', 'com.example.existing', '--template', 'minimal', '--dir', pluginDir])
                .status
        ).toBe(0);
        const separateDir = join(cwd, 'separate');
        const explicitCreate = runCli(pluginDir, [
            'create',
            '--name',
            'com.example.separate',
            '--element',
            'separate-element',
            '--template',
            'minimal',
            '--dir',
            separateDir,
        ]);
        expect(explicitCreate.status, explicitCreate.stderr).toBe(0);

        const explicitAdd = runCli(cwd, ['add', 'pulse', '--template', 'minimal']);
        expect(explicitAdd.status).toBe(1);
        expect(explicitAdd.stderr).toContain('Expected an existing plugin manifest');
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

    it('rejects invalid IDs and manifests using the shared contract rules', () => {
        expect(isValidPluginId('com.example.good')).toBe(true);
        expect(isValidPluginId('.bad')).toBe(false);
        expect(targetsSdk2('^2.2.0')).toBe(true);
        expect(targetsSdk2('2')).toBe(false);
        expect(targetsSdk2('^12.0.0')).toBe(false);
        expect(
            validateManifest({
                id: '.bad',
                name: 'Bad',
                version: '0.1.0',
                apiVersion: '^12.0.0',
                elements: [{ type: 'bad', entry: 'src/bad.ts', capabilities: { required: [], optional: [] } }],
            })
        ).toEqual(expect.arrayContaining(['Missing or invalid "id" field', '"apiVersion" must target SDK 2']));

        const cwd = temporaryDirectory();
        const invalidCreate = runCli(cwd, [
            'create',
            '--name',
            '.bad',
            '--template',
            'minimal',
            '--dir',
            join(cwd, 'bad'),
        ]);
        expect(invalidCreate.status).toBe(1);
        expect(existsSync(join(cwd, 'bad'))).toBe(false);

        const pluginDir = join(cwd, 'invalid-manifest');
        expect(
            runCli(cwd, ['create', '--name', 'com.example.valid', '--template', 'minimal', '--dir', pluginDir]).status
        ).toBe(0);
        const invalidManifest = {
            id: 'com.example.valid',
            name: 'Valid',
            version: '0.1.0',
            apiVersion: '^12.0.0',
            elements: [],
        };
        writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify(invalidManifest));
        const add = runCli(pluginDir, ['add', 'new-element', '--template', 'minimal']);
        expect(add.status).toBe(1);
        expect(add.stderr).toContain('only supports SDK 2 plugins');
        expect(JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'))).toEqual(invalidManifest);
        expect(existsSync(join(pluginDir, 'src/new-element.ts'))).toBe(false);
    });

    it('rejects source and asset collisions without changing the plugin', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'visuals');
        expect(
            runCli(cwd, ['create', '--name', 'com.example.visuals', '--template', 'bundled-image', '--dir', pluginDir])
                .status
        ).toBe(0);
        const manifestBefore = readFileSync(join(pluginDir, 'plugin.json'), 'utf8');

        writeFileSync(join(pluginDir, 'src/orphan.ts'), 'user-owned source');
        const sourceCollision = runCli(pluginDir, ['add', 'orphan', '--template', 'minimal']);
        expect(sourceCollision.status).toBe(1);
        expect(sourceCollision.stderr).toContain('existing element file');
        const assetCollision = runCli(pluginDir, ['add', 'second-image', '--template', 'bundled-image']);
        expect(assetCollision.status).toBe(1);
        expect(assetCollision.stderr).toContain('template assets: image.svg');
        expect(readFileSync(join(pluginDir, 'plugin.json'), 'utf8')).toBe(manifestBefore);
        expect(existsSync(join(pluginDir, 'src/second-image.ts'))).toBe(false);
    });

    it.skipIf(process.platform === 'win32')('rolls back add when committing a file fails', () => {
        const cwd = temporaryDirectory();
        const pluginDir = join(cwd, 'visuals');
        expect(
            runCli(cwd, ['create', '--name', 'com.example.visuals', '--template', 'minimal', '--dir', pluginDir]).status
        ).toBe(0);
        const manifestBefore = readFileSync(join(pluginDir, 'plugin.json'), 'utf8');
        const sourceDir = join(pluginDir, 'src');
        chmodSync(sourceDir, 0o500);
        try {
            const add = runCli(pluginDir, ['add', 'write-failure', '--template', 'minimal']);
            expect(add.status).toBe(1);
            expect(readFileSync(join(pluginDir, 'plugin.json'), 'utf8')).toBe(manifestBefore);
            expect(existsSync(join(sourceDir, 'write-failure.ts'))).toBe(false);
            expect(readdirSync(pluginDir).filter((entry) => entry.startsWith('.create-mvmnt-plugin-'))).toEqual([]);
        } finally {
            chmodSync(sourceDir, 0o700);
        }
    });

    it.skipIf(process.platform === 'win32')('does not leave a partial plugin when staging create fails', () => {
        const cwd = temporaryDirectory();
        const parent = join(cwd, 'read-only');
        const pluginDir = join(parent, 'visuals');
        writeFileSync(parent, 'not a directory');
        const create = runCli(cwd, [
            'create',
            '--name',
            'com.example.visuals',
            '--template',
            'minimal',
            '--dir',
            pluginDir,
        ]);
        expect(create.status).toBe(1);
        expect(existsSync(pluginDir)).toBe(false);
    });
});

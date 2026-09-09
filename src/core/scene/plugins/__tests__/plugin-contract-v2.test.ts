import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageManifest from '../../../../../packages/plugin-sdk/package.json';
import sdkManifest from '../../../../../packages/plugin-sdk/sdk-manifest.json';
import * as packageRoot from '../../../../../packages/plugin-sdk/src/index';
import * as packageApi from '../../../../../packages/plugin-sdk/src/api';
import * as packageAnimation from '../../../../../packages/plugin-sdk/src/animation';
import * as packageAudio from '../../../../../packages/plugin-sdk/src/audio';
import * as packageSafety from '../../../../../packages/plugin-sdk/src/safety';
import * as packageScene from '../../../../../packages/plugin-sdk/src/scene';
import * as packageTimeline from '../../../../../packages/plugin-sdk/src/timeline';
import * as packageTiming from '../../../../../packages/plugin-sdk/src/timing';
import * as packageUtils from '../../../../../packages/plugin-sdk/src/utils';
import * as packageVisualAssets from '../../../../../packages/plugin-sdk/src/visual-assets';
import {
    SDK_RUNTIME_MODULE_IDS,
    supportsPluginApiRange,
    validateArchivePaths,
    validatePluginManifest,
} from '../plugin-contract';
import { getPluginRuntimeExportNames, getPluginRuntimeModuleIds } from '../plugin-loader';
import {
    SDK_CAPABILITIES as TOOL_CAPABILITIES,
    SDK_RUNTIME_MODULES as TOOL_RUNTIME_MODULES,
} from '../../../../../packages/plugin-tools/src/contract.mjs';

const validManifest = () => ({
    id: 'com.example.v2',
    name: 'V2',
    version: '1.0.0',
    apiVersion: '^2.0.0',
    elements: [
        {
            type: 'example',
            entry: 'elements/example.js',
            capabilities: { required: ['timeline.read'], optional: ['audio.features.read'] },
        },
    ],
});

describe('plugin SDK v2 contract', () => {
    it('ships matching ESM and CommonJS exports and resource validation', () => {
        // Execute outside Vite so aliases cannot substitute SDK source for the built package.
        const dist = resolve(__dirname, '../../../../../packages/plugin-sdk/dist');
        const result = JSON.parse(
            execFileSync(
                process.execPath,
                [
                    '--input-type=module',
                    '-e',
                    `
            import { createRequire } from 'node:module';
            import { pathToFileURL } from 'node:url';
            const require = createRequire(import.meta.url);
            const dist = ${JSON.stringify(dist)};
            const exports = {};
            for (const name of ${JSON.stringify(Object.keys(sdkManifest.publicExports))}) {
                const file = name === '.' ? 'index' : name;
                const esm = await import(pathToFileURL(dist + '/' + file + '.js'));
                const cjs = require(dist + '/' + file + '.cjs');
                exports[name] = { esm: Object.keys(esm).sort(), cjs: Object.keys(cjs).sort() };
                if (file === 'index' || file === 'scene') {
                    for (const sdk of [esm, cjs]) {
                        try {
                            sdk.definePluginElement({ type: 'invalid', create() {}, render() { return []; } });
                            throw new Error('Old lifecycle was accepted');
                        } catch (error) {
                            if (!error.message.includes('createResources')) throw error;
                        }
                    }
                }
            }
            console.log(JSON.stringify({ exports, version: require(dist + '/index.cjs').SDK_VERSION }));
        `,
                ],
                { encoding: 'utf8' }
            )
        );
        expect(result.version).toBe(packageManifest.version);
        for (const [subpath, names] of Object.entries(sdkManifest.publicExports)) {
            expect(result.exports[subpath]).toEqual({ esm: [...names].sort(), cjs: [...names].sort() });
        }
    });

    it('keeps package exports, runtime modules, manifest, and docs in parity', () => {
        const packageSubpaths = Object.keys(packageManifest.exports)
            .filter((key) => !['./manifest', './package.json'].includes(key))
            .map((key) => (key === '.' ? '@mvmnt-app/plugin-sdk' : `@mvmnt-app/plugin-sdk/${key.slice(2)}`));
        expect(packageSubpaths).toEqual(sdkManifest.runtimeModules);
        expect(SDK_RUNTIME_MODULE_IDS).toEqual(sdkManifest.runtimeModules);
        expect(TOOL_RUNTIME_MODULES).toEqual(sdkManifest.runtimeModules);
        expect(TOOL_CAPABILITIES).toEqual(sdkManifest.capabilities);
        expect(getPluginRuntimeModuleIds()).toEqual(sdkManifest.runtimeModules);
        expect(SDK_RUNTIME_MODULE_IDS).toContain('@mvmnt-app/plugin-sdk/visual-assets');
        for (const [subpath, exports] of Object.entries(sdkManifest.publicExports)) {
            const moduleId = subpath === '.' ? '@mvmnt-app/plugin-sdk' : `@mvmnt-app/plugin-sdk/${subpath}`;
            expect([...getPluginRuntimeExportNames(moduleId)].sort()).toEqual([...exports].sort());
        }

        const packageModules: Record<string, object> = {
            '.': packageRoot,
            api: packageApi,
            animation: packageAnimation,
            audio: packageAudio,
            safety: packageSafety,
            scene: packageScene,
            timeline: packageTimeline,
            timing: packageTiming,
            utils: packageUtils,
            'visual-assets': packageVisualAssets,
        };
        for (const [subpath, module] of Object.entries(packageModules)) {
            expect([...sdkManifest.publicExports[subpath as keyof typeof sdkManifest.publicExports]].sort()).toEqual(
                Object.keys(module).sort()
            );
        }

        const docs = readFileSync(resolve(__dirname, '../../../../../docs/plugin-api/reference.md'), 'utf8');
        for (const subpath of sdkManifest.subpaths.filter((value) => value !== '.')) {
            expect(docs).toContain(`/${subpath}`);
        }
    });

    it('accepts SDK 2 and rejects removed API lines', () => {
        expect(supportsPluginApiRange('^1.0.0')).toBe(false);
        expect(supportsPluginApiRange('^2.0.0')).toBe(true);
        expect(supportsPluginApiRange('^2.1.0')).toBe(true);
        expect(supportsPluginApiRange('^2.2.0')).toBe(true);
        expect(supportsPluginApiRange('^3.0.0')).toBe(false);
    });

    it('rejects unknown, duplicate, missing, and unsafe v2 declarations', () => {
        const unknown = validManifest();
        (unknown.elements[0].capabilities.required as string[]).push('network');
        expect(validatePluginManifest(unknown).join(' ')).toContain('unknown capability');

        const duplicate = validManifest();
        duplicate.elements[0].capabilities.optional.push('timeline.read');
        expect(validatePluginManifest(duplicate).join(' ')).toContain('duplicates');

        const missing = validManifest();
        delete (missing.elements[0] as any).capabilities;
        expect(validatePluginManifest(missing).join(' ')).toContain('capabilities must be an object');

        const traversal = validManifest();
        traversal.elements[0].entry = '../escape.js';
        expect(validatePluginManifest(traversal).join(' ')).toContain('safe relative archive path');
        expect(validateArchivePaths(['manifest.json', '../escape.js'])).toEqual([
            "Unsafe plugin archive path '../escape.js'",
        ]);
    });
});

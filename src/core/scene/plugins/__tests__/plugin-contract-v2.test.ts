import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageManifest from '../../../../../packages/plugin-sdk/package.json';
import sdkManifest from '../../../../../packages/plugin-sdk/sdk-manifest.json';
import templatePackage from '../../../../../packages/create-mvmnt-plugin/templates/minimal/package.json';
import templateManifest from '../../../../../packages/create-mvmnt-plugin/templates/minimal/plugin.json';
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
import { BLEND_MODE_CHOICES as hostBlendModeChoices } from '@utils/blend-modes';
import { PLUGIN_SDK_VERSION } from '../api-version';
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
    it('exposes the host additive blend mode through the SDK schema choices', () => {
        expect(hostBlendModeChoices).toContainEqual({ value: 'lighter', label: 'Add' });
        expect(packageScene.BLEND_MODE_CHOICES).toEqual(hostBlendModeChoices);
        expect(packageScene.prop.blendMode().options).toEqual(hostBlendModeChoices);
    });

    it('ships the declared ESM exports with shared cross-subpath identity', () => {
        // Execute outside Vite so aliases cannot substitute SDK source for the built package.
        const dist = resolve(__dirname, '../../../../../packages/plugin-sdk/dist');
        const result = JSON.parse(
            execFileSync(
                process.execPath,
                [
                    '--input-type=module',
                    '-e',
                    `
            import { pathToFileURL } from 'node:url';
            const dist = ${JSON.stringify(dist)};
            const exports = {};
            for (const name of ${JSON.stringify(Object.keys(sdkManifest.publicExports))}) {
                const file = name === '.' ? 'index' : name;
                const esm = await import(pathToFileURL(dist + '/' + file + '.js'));
                exports[name] = Object.keys(esm).sort();
                if (file === 'index' || file === 'scene') {
                    try {
                        esm.definePluginElement({ type: 'invalid', create() {}, render() { return []; } });
                        throw new Error('Old lifecycle was accepted');
                    } catch (error) {
                        if (!error.message.includes('createResources')) throw error;
                    }
                }
            }
            const root = await import(pathToFileURL(dist + '/index.js'));
            const api = await import(pathToFileURL(dist + '/api.js'));
            const animation = await import(pathToFileURL(dist + '/animation.js'));
            let contractIdentity = false;
            try { root.definePluginElement({ type: 'invalid', render: null }); }
            catch (error) { contractIdentity = error instanceof api.PluginContractError; }
            let fontErrors = 0;
            try { root.parseFontSelection('BuiltIn:inter|400'); } catch { fontErrors += 1; }
            try { await root.ensureFontLoaded('BuiltIn:inter|400'); } catch { fontErrors += 1; }
            console.log(JSON.stringify({
                exports,
                version: root.SDK_VERSION,
                contractIdentity,
                curveIdentity: root.FloatCurve === animation.FloatCurve,
                fontErrors,
            }));
        `,
                ],
                { encoding: 'utf8' }
            )
        );
        expect(result.version).toBe(packageManifest.version);
        expect(result.contractIdentity).toBe(true);
        expect(result.curveIdentity).toBe(true);
        expect(result.fontErrors).toBe(2);
        for (const [subpath, names] of Object.entries(sdkManifest.publicExports)) {
            expect(result.exports[subpath]).toEqual([...names].sort());
        }
    });

    it('keeps every published SDK and generated-plugin version synchronized', () => {
        expect(packageManifest.version).toBe(packageApi.SDK_VERSION);
        expect(packageManifest.version).toBe(PLUGIN_SDK_VERSION);
        expect(packageManifest.version).toBe(sdkManifest.version);
        expect(templatePackage.dependencies['@mvmnt-app/plugin-sdk']).toBe(`^${packageManifest.version}`);
        expect(templateManifest.apiVersion).toBe(`^${packageManifest.version}`);
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

    it('rejects invalid public render-object limits', () => {
        expect(() => packageSafety.limitRenderObjects([1, 2, 3], -1)).toThrow(/non-negative safe integer/);
        expect(() => packageSafety.limitRenderObjects([1], 1.5)).toThrow(/non-negative safe integer/);
        expect(packageSafety.limitRenderObjects([1, 2, 3], 2)).toEqual([1, 2]);
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

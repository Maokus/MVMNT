import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageManifest from '../../../../../packages/plugin-sdk/package.json';
import sdkManifest from '../../../../../packages/plugin-sdk/sdk-manifest.json';
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
    capabilityDeclarationsMatch,
    supportsPluginApiRange,
    validateArchivePaths,
    validatePluginManifest,
} from '../plugin-contract';
import { getPluginRuntimeExportNames, getPluginRuntimeModuleIds } from '../plugin-loader';

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
    it('keeps package exports, runtime modules, manifest, and docs in parity', () => {
        const packageSubpaths = Object.keys(packageManifest.exports)
            .filter((key) => !['./manifest', './package.json'].includes(key))
            .map((key) => (key === '.' ? '@mvmnt-app/plugin-sdk' : `@mvmnt-app/plugin-sdk/${key.slice(2)}`));
        expect(packageSubpaths).toEqual(sdkManifest.runtimeModules);
        expect(SDK_RUNTIME_MODULE_IDS).toEqual(sdkManifest.runtimeModules);
        expect(getPluginRuntimeModuleIds()).toEqual(sdkManifest.runtimeModules);
        expect(SDK_RUNTIME_MODULE_IDS).toContain('@mvmnt-app/plugin-sdk/visual-assets');
        for (const [subpath, exports] of Object.entries(sdkManifest.publicExports)) {
            const moduleId = subpath === '.' ? '@mvmnt-app/plugin-sdk' : `@mvmnt-app/plugin-sdk/${subpath}`;
            expect([...getPluginRuntimeExportNames(moduleId)].sort()).toEqual([...exports].sort());
        }

        const packageModules: Record<string, object> = {
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
        const allSubpathExports = new Set(
            Object.entries(sdkManifest.publicExports)
                .filter(([subpath]) => subpath !== '.')
                .flatMap(([, exports]) => exports)
        );
        expect([...sdkManifest.publicExports['.']].sort()).toEqual([...allSubpathExports].sort());

        const docs = readFileSync(
            resolve(__dirname, '../../../../../docs/plugin-api/plugin-sdk-api-inventory.md'),
            'utf8'
        );
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

    it('requires exact manifest/definition capability parity', () => {
        const element = validManifest().elements[0] as any;
        expect(capabilityDeclarationsMatch(element, element)).toBe(true);
        expect(
            capabilityDeclarationsMatch(element, {
                capabilities: { required: ['timeline.read', 'audio.features.read'], optional: [] },
            })
        ).toBe(false);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const { ensureFontLoaded, ensureFontVariantsRegistered, ensureSceneFontsLoaded } = vi.hoisted(() => ({
    ensureFontLoaded: vi.fn().mockResolvedValue(undefined),
    ensureFontVariantsRegistered: vi.fn().mockResolvedValue(undefined),
    ensureSceneFontsLoaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@fonts/font-loader', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@fonts/font-loader')>()),
    ensureFontLoaded,
    ensureFontVariantsRegistered,
    ensureSceneFontsLoaded,
}));

import { exportScene, importScene } from '@persistence/index';
import { dispatchSceneCommand } from '@state/scene';
import { elementPropertyTarget } from '@automation/types';
import { FontBinaryStore } from '@persistence/font-binary-store';
import { collectMissingFontReferences, type FontAsset } from '@state/scene/fonts';
import { useSceneStore } from '@state/sceneStore';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';

describe('scene import font preloading', () => {
    beforeEach(async () => {
        ensureSceneFontsLoaded.mockClear();
        useSceneStore.getState().clearScene();
        await FontBinaryStore.clear();
    });

    it('loads selected fonts after applying the imported scene', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'text',
            config: { fontFamily: { type: 'constant', value: 'BuiltIn:inter|400' } },
        });
        const exported = await exportScene();
        if (!exported.ok) throw new Error('Expected a packaged scene export');

        useSceneStore.getState().clearScene();
        ensureSceneFontsLoaded.mockImplementationOnce(async () => {
            expect(useSceneStore.getState().elements.text).toBeDefined();
        });
        await expect(importScene(exported.zip)).resolves.toMatchObject({ ok: true });
        expect(ensureSceneFontsLoaded).toHaveBeenCalledWith(
            expect.objectContaining({ text: expect.any(Object) }),
            undefined,
            { automation: undefined }
        );
    });

    it('maps the legacy Inter default to the bundled font without a Google download', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'text',
            config: { fontFamily: { type: 'constant', value: 'BuiltIn:inter|700' } },
        });
        const exported = await exportScene();
        if (!exported.ok) throw new Error('Expected a packaged scene export');

        const archive = unzipSync(exported.zip);
        const document = JSON.parse(strFromU8(archive['document.json']));
        document.schemaVersion = 8;
        document.scene.elements.text.properties.fontFamily.value = 'Inter|700';
        archive['document.json'] = strToU8(JSON.stringify(document));

        useSceneStore.getState().clearScene();
        await expect(importScene(zipSync(archive))).resolves.toMatchObject({ ok: true });
        expect(ensureSceneFontsLoaded).toHaveBeenLastCalledWith(
            expect.objectContaining({
                text: expect.objectContaining({
                    properties: expect.objectContaining({
                        fontFamily: { type: 'constant', value: 'BuiltIn:inter|700' },
                    }),
                }),
            }),
            undefined,
            { automation: undefined }
        );
    });

    it('repairs missing references when their embedded font is restored from the package', async () => {
        const asset: FontAsset = {
            id: 'brand-sans',
            family: 'Brand Sans',
            originalFileName: 'BrandSans.woff2',
            fileSize: 4,
            createdAt: 1,
            updatedAt: 1,
            licensingAcknowledged: true,
            variants: [
                {
                    id: 'regular',
                    weight: 400,
                    style: 'normal',
                    sourceFormat: 'woff2',
                    binaryId: 'brand-sans-regular',
                    byteLength: 4,
                },
            ],
        };
        await FontBinaryStore.put('brand-sans-regular', new Uint8Array([1, 2, 3, 4]));
        useSceneStore.getState().registerFontAsset(asset);
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'title',
            config: { fontFamily: 'MissingProject:Brand Sans|400' },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'heading-font',
            definition: { type: 'font', value: 'MissingGoogle:Brand Sans|400' },
        });
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: elementPropertyTarget('title', 'fontFamily'),
            valueType: 'string',
            initialKeyframes: [
                {
                    tick: 0,
                    value: 'MissingProject:Brand Sans|400',
                    segmentInterpolation: { mode: 'constant', direction: 'auto' },
                },
            ],
        });
        const exported = await exportScene();
        if (!exported.ok) throw new Error('Expected a packaged scene export');

        useSceneStore.getState().clearScene();
        const revisionBeforeImport = useDocumentRevisionStore.getState().revision;
        await FontBinaryStore.clear();
        await expect(importScene(exported.zip)).resolves.toMatchObject({ ok: true });

        const state = useSceneStore.getState();
        expect(state.macros.byId['heading-font'].value).toBe('Project:brand-sans|400');
        expect(state.bindings.byElement.title.fontFamily).toMatchObject({ type: 'keyframes' });
        expect(Object.values(state.automation.channels)[0]?.keyframes[0]?.value).toBe('Project:brand-sans|400');
        expect(
            collectMissingFontReferences({
                bindings: state.bindings.byElement,
                macros: state.macros.byId,
                automation: state.automation.channels,
            })
        ).toEqual([]);
        expect(useDocumentRevisionStore.getState().revision).toBeGreaterThan(revisionBeforeImport);
    });
});

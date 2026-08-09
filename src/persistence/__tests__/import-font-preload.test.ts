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
import { useSceneStore } from '@state/sceneStore';

describe('scene import font preloading', () => {
    beforeEach(() => {
        ensureSceneFontsLoaded.mockClear();
        useSceneStore.getState().clearScene();
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
});

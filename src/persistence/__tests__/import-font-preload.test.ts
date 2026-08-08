import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    it('loads selected fonts before applying an imported scene', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'text',
            config: { fontFamily: { type: 'constant', value: 'Meddon|400' } },
        });
        const exported = await exportScene();
        if (!exported.ok) throw new Error('Expected a packaged scene export');

        useSceneStore.getState().clearScene();
        await expect(importScene(exported.zip)).resolves.toMatchObject({ ok: true });
        expect(ensureSceneFontsLoaded).toHaveBeenCalledWith(
            expect.objectContaining({ text: expect.any(Object) }),
            undefined
        );
    });
});

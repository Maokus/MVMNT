import { afterEach, describe, expect, it, vi } from 'vitest';

const { ensureFontLoaded, ensureFontVariantsRegistered, put } = vi.hoisted(() => ({
    ensureFontLoaded: vi.fn().mockResolvedValue(undefined),
    ensureFontVariantsRegistered: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@fonts/font-loader', () => ({ ensureFontLoaded, ensureFontVariantsRegistered }));
vi.mock('@persistence/font-binary-store', () => ({ FontBinaryStore: { put } }));

import { migrateSceneTextBoundsV11, prepareTextBoundsMigrationFonts } from '../migrations/textBoundsV11';

afterEach(() => {
    vi.unstubAllGlobals();
    ensureFontLoaded.mockClear();
    ensureFontVariantsRegistered.mockClear();
    put.mockClear();
});

describe('text bounds v11 migration', () => {
    it('keeps text-overlay anchors fixed by translating static offsets and their keyframes', () => {
        const context = {
            font: '',
            textBaseline: 'alphabetic',
            letterSpacing: '0px',
            measureText: vi.fn(() => ({
                width: 100,
                actualBoundingBoxAscent: 8,
                actualBoundingBoxDescent: 2,
                actualBoundingBoxLeft: 5,
                actualBoundingBoxRight: 105,
            })),
        };
        class MockOffscreenCanvas {
            getContext() {
                return context;
            }
        }
        vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

        const migrated = migrateSceneTextBoundsV11({
            schemaVersion: 10,
            scene: {
                elements: {
                    text: {
                        id: 'text',
                        type: 'textOverlay',
                        properties: {
                            text: { type: 'constant', value: 'Hello' },
                            fontSize: { type: 'constant', value: 36 },
                            textAlign: { type: 'constant', value: 'left' },
                            anchorX: { type: 'constant', value: 0 },
                            anchorY: { type: 'constant', value: 0 },
                            offsetX: { type: 'constant', value: 100 },
                            offsetY: { type: 'constant', value: 200 },
                        },
                    },
                },
                automation: {
                    channels: {
                        'text.offsetX': {
                            elementId: 'text',
                            propertyKey: 'offsetX',
                            keyframes: [
                                { tick: 0, value: 10 },
                                { tick: 120, value: 20 },
                            ],
                        },
                        'text.offsetY': {
                            elementId: 'text',
                            propertyKey: 'offsetY',
                            keyframes: [
                                { tick: 0, value: 30 },
                                { tick: 120, value: 40 },
                            ],
                        },
                    },
                },
            },
        });

        expect(migrated.schemaVersion).toBe(11);
        expect(migrated.scene.elements.text.properties.offsetX.value).toBe(95);
        expect(migrated.scene.elements.text.properties.offsetY.value).toBe(192);
        expect(
            migrated.scene.automation.channels['text.offsetX'].keyframes.map((keyframe: any) => keyframe.value)
        ).toEqual([5, 15]);
        expect(
            migrated.scene.automation.channels['text.offsetY'].keyframes.map((keyframe: any) => keyframe.value)
        ).toEqual([22, 32]);
    });

    it('is a no-op for V11 files', () => {
        const scene = { schemaVersion: 11, scene: { elements: {} } };
        expect(migrateSceneTextBoundsV11(scene)).toBe(scene);
    });

    it('loads selected Google and embedded fonts before measuring', async () => {
        vi.stubGlobal(
            'OffscreenCanvas',
            class {
                getContext() {
                    return {};
                }
            }
        );
        await prepareTextBoundsMigrationFonts(
            {
                scene: {
                    macros: { macros: { font: { value: 'Meddon|400' } } },
                    fontAssets: {
                        id: {
                            id: 'id',
                            family: 'Embedded',
                            variants: [{ id: 'regular', weight: 400, style: 'normal' }],
                        },
                    },
                    elements: {
                        one: {
                            type: 'textOverlay',
                            properties: { fontFamily: { type: 'constant', value: 'Inter|700' } },
                        },
                        two: { type: 'textOverlay', properties: { fontFamily: { type: 'macro', macroId: 'font' } } },
                        three: {
                            type: 'textOverlay',
                            properties: { fontFamily: { type: 'constant', value: 'Custom:id|400' } },
                        },
                    },
                },
            },
            new Map([['id', new Uint8Array([1, 2, 3])]])
        );

        expect(ensureFontLoaded).toHaveBeenCalledTimes(2);
        expect(ensureFontLoaded).toHaveBeenCalledWith('Inter|700');
        expect(ensureFontLoaded).toHaveBeenCalledWith('Meddon|400');
        expect(put).toHaveBeenCalledWith('id', new Uint8Array([1, 2, 3]));
        expect(ensureFontVariantsRegistered).toHaveBeenCalledWith(expect.objectContaining({ id: 'id' }), [
            { id: 'regular', weight: 400, style: 'normal' },
        ]);
    });
});

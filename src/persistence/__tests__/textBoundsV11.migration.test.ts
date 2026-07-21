import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateSceneTextBoundsV11 } from '../migrations/textBoundsV11';

afterEach(() => {
    vi.unstubAllGlobals();
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
});

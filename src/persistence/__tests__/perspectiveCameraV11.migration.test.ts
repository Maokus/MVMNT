import { describe, expect, it } from 'vitest';
import { migrateScenePerspectiveCameraV11 } from '../migrations/perspectiveCameraV11';

describe('perspective camera V11 migration', () => {
    it('removes corner pins and disables a legacy-only warp', () => {
        const migrated = migrateScenePerspectiveCameraV11({
            schemaVersion: 10,
            scene: {
                elements: {
                    legacy: {
                        id: 'legacy',
                        type: 'textOverlay',
                        properties: {
                            warpEnabled: { type: 'constant', value: true },
                            warpTopLeftX: { type: 'constant', value: -0.2 },
                            warpTopLeftY: { type: 'constant', value: 0.1 },
                        },
                    },
                },
                automation: {
                    channels: {
                        'legacy.warpTopLeftX': {
                            id: 'legacy.warpTopLeftX',
                            elementId: 'legacy',
                            propertyKey: 'warpTopLeftX',
                            keyframes: [],
                        },
                    },
                },
            },
        });

        expect(migrated.schemaVersion).toBe(11);
        expect(migrated.scene.elements.legacy.properties.warpEnabled.value).toBe(false);
        expect(migrated.scene.elements.legacy.properties).not.toHaveProperty('warpTopLeftX');
        expect(migrated.scene.automation.channels).not.toHaveProperty('legacy.warpTopLeftX');
    });

    it('converts interim distance/origin properties to strength and pivot', () => {
        const migrated = migrateScenePerspectiveCameraV11({
            schemaVersion: 10,
            scene: {
                elements: {
                    camera: {
                        id: 'camera',
                        type: 'textOverlay',
                        properties: {
                            anchorX: { type: 'constant', value: 0.5 },
                            anchorY: { type: 'constant', value: 0.5 },
                            perspectiveCameraDistance: { type: 'constant', value: 2.2 },
                            perspectiveOriginX: { type: 'constant', value: 0.25 },
                            perspectiveOriginY: { type: 'constant', value: 0.75 },
                        },
                    },
                },
            },
        });
        const properties = migrated.scene.elements.camera.properties as Record<string, any>;

        expect(properties.perspectiveStrength.value).toBeCloseTo(50);
        expect(properties.perspectivePivotX.value).toBe(0.25);
        expect(properties.perspectivePivotY.value).toBe(0.75);
        expect(properties.perspectivePivotLinked.value).toBe(false);
        expect(properties).not.toHaveProperty('perspectiveCameraDistance');
        expect(properties).not.toHaveProperty('perspectiveOriginX');
    });
});

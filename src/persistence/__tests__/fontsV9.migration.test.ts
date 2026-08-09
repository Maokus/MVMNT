import { describe, expect, it } from 'vitest';
import { migrateSceneFontsV9 } from '../migrations/fontsV9';

describe('font assets schema v9 migration', () => {
    it('separates project, Google, built-in, and device selections', () => {
        const migrated = migrateSceneFontsV9({
            schemaVersion: 8,
            scene: {
                fontAssets: {
                    uploaded: {
                        id: 'uploaded',
                        family: 'Uploaded',
                        fileSize: 123,
                        originalFileName: 'Uploaded.ttf',
                        createdAt: 1,
                        updatedAt: 1,
                        licensingAcknowledged: true,
                        variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' }],
                    },
                },
                elements: {
                    builtIn: { properties: { fontFamily: { type: 'constant', value: 'Inter|700' } } },
                    google: { properties: { fontFamily: { type: 'constant', value: 'Roboto|700' } } },
                    device: { properties: { fontFamily: { type: 'constant', value: 'Arial|400' } } },
                    project: { properties: { fontFamily: { type: 'constant', value: 'Custom:uploaded|400' } } },
                },
            },
        });

        expect(migrated.schemaVersion).toBe(9);
        expect(migrated.scene.elements.builtIn.properties.fontFamily).toEqual({
            type: 'constant',
            value: 'BuiltIn:inter|700',
        });
        expect(migrated.scene.elements.google.properties.fontFamily).toEqual({
            type: 'constant',
            value: 'MissingGoogle:Roboto|700',
        });
        expect(migrated.scene.elements.device.properties.fontFamily).toEqual({
            type: 'constant',
            value: 'Device:Arial|400',
        });
        expect(migrated.scene.elements.project.properties.fontFamily).toEqual({
            type: 'constant',
            value: 'Project:uploaded|400',
        });
        expect(migrated.scene.fontAssets.uploaded).toMatchObject({
            source: 'upload',
            variants: [expect.objectContaining({ binaryId: 'uploaded', byteLength: 123 })],
        });
    });
});

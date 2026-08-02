import { describe, expect, it } from 'vitest';
import { encodePropertyTarget } from '@automation/types';
import { migrateAutomationTargetsV13 } from '../migrations/automationTargetsV13';

describe('automation target v13 migration', () => {
    it('rewrites legacy channel IDs and bindings without parsing dotted element IDs', () => {
        const source = {
            schemaVersion: 12,
            scene: {
                elements: {
                    'logo.main': {
                        id: 'logo.main',
                        properties: {
                            'transform.x': { type: 'keyframes', channelId: 'logo.main.transform.x' },
                            tint: { type: 'macro', macroId: 'brand.color' },
                        },
                    },
                },
                automation: {
                    channels: {
                        'logo.main.transform.x': {
                            id: 'logo.main.transform.x',
                            elementId: 'logo.main',
                            propertyKey: 'transform.x',
                            valueType: 'number',
                            keyframes: [],
                        },
                    },
                },
            },
        };

        const migrated = migrateAutomationTargetsV13(source as any);
        const channel = Object.values(migrated.scene.automation.channels)[0] as any;
        expect(migrated.schemaVersion).toBe(13);
        expect(channel.id).toMatch(/^channel:migrated:/);
        expect(channel.target).toEqual({
            owner: { kind: 'element', id: 'logo.main' },
            propertyPath: 'transform.x',
        });
        expect(migrated.scene.elements['logo.main'].properties['transform.x'].channelId).toBe(channel.id);
        expect(migrated.scene.elements['logo.main'].properties.tint).toEqual({
            type: 'macro',
            macroId: 'brand.color',
        });
        expect(migrated.scene.automation.channelIdByTarget[encodePropertyTarget(channel.target)]).toBe(channel.id);
        expect(channel.elementId).toBeUndefined();
        expect(channel.propertyKey).toBeUndefined();
    });

    it('is idempotent for structured node targets', () => {
        const source = {
            schemaVersion: 13,
            scene: {
                automation: {
                    channels: {
                        opaque: {
                            id: 'channel:node',
                            target: { owner: { kind: 'node', id: 'group.1' }, propertyPath: 'translationX' },
                            valueType: 'number',
                            keyframes: [],
                        },
                    },
                },
            },
        };
        expect(migrateAutomationTargetsV13(source as any)).toBe(source);
    });
});

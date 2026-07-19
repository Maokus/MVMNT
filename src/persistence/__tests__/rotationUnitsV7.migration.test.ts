import { describe, expect, it } from 'vitest';
import { migrateSceneRotationUnitsV7 } from '../migrations/rotationUnitsV7';

describe('rotation units v7 migration', () => {
    it('converts legacy radian element rotation and Basic Shapes arc constants to degrees', () => {
        const migrated = migrateSceneRotationUnitsV7({
            schemaVersion: 6,
            scene: {
                elements: {
                    shape: {
                        id: 'shape',
                        type: 'basicShapes',
                        properties: {
                            elementRotation: { type: 'constant', value: Math.PI },
                            startAngle: { type: 'constant', value: Math.PI / 2 },
                            endAngle: { type: 'constant', value: Math.PI * 2 },
                        },
                    },
                },
                elementsOrder: ['shape'],
            },
        });

        const properties = migrated.scene.elements.shape.properties;
        expect(properties.elementRotation.value).toBeCloseTo(180);
        expect(properties.startAngle.value).toBeCloseTo(90);
        expect(properties.endAngle.value).toBeCloseTo(360);
    });

    it('does not convert same-named angle properties on elements that already used degrees', () => {
        const migrated = migrateSceneRotationUnitsV7({
            schemaVersion: 6,
            scene: {
                elements: {
                    circular: {
                        id: 'circular',
                        type: 'circularPianoRoll',
                        properties: {
                            startAngle: { type: 'constant', value: 90 },
                            endAngle: { type: 'constant', value: 360 },
                        },
                    },
                },
                elementsOrder: ['circular'],
            },
        });

        const properties = migrated.scene.elements.circular.properties;
        expect(properties.startAngle.value).toBe(90);
        expect(properties.endAngle.value).toBe(360);
    });

    it('converts affected numeric automation keyframes once for pre-v7 scenes', () => {
        const migrated = migrateSceneRotationUnitsV7({
            schemaVersion: 6,
            scene: {
                elements: {
                    shape: { id: 'shape', type: 'basicShapes', properties: {} },
                    text: { id: 'text', type: 'textOverlay', properties: {} },
                },
                elementsOrder: ['shape', 'text'],
                automation: {
                    channels: {
                        'shape.startAngle': {
                            id: 'shape.startAngle',
                            elementId: 'shape',
                            propertyKey: 'startAngle',
                            valueType: 'number',
                            keyframes: [
                                { tick: 0, value: 0, segmentInterpolation: { mode: 'linear', direction: 'auto' } },
                                { tick: 120, value: Math.PI, segmentInterpolation: { mode: 'linear', direction: 'auto' } },
                            ],
                        },
                        'text.elementRotation': {
                            id: 'text.elementRotation',
                            elementId: 'text',
                            propertyKey: 'elementRotation',
                            valueType: 'number',
                            keyframes: [
                                {
                                    tick: 0,
                                    value: Math.PI / 2,
                                    segmentInterpolation: { mode: 'linear', direction: 'auto' },
                                    rightHandle: { dt: 60, dv: Math.PI / 4 },
                                },
                            ],
                        },
                    },
                },
            },
        });

        expect(migrated.scene.automation.channels['shape.startAngle'].keyframes[1].value).toBeCloseTo(180);
        expect(migrated.scene.automation.channels['text.elementRotation'].keyframes[0].value).toBeCloseTo(90);
        expect(migrated.scene.automation.channels['text.elementRotation'].keyframes[0].rightHandle.dv).toBeCloseTo(45);
    });

    it('skips conversion for v7 scenes', () => {
        const migrated = migrateSceneRotationUnitsV7({
            schemaVersion: 7,
            scene: {
                elements: {
                    shape: {
                        id: 'shape',
                        type: 'basicShapes',
                        properties: {
                            elementRotation: { type: 'constant', value: 180 },
                        },
                    },
                },
                elementsOrder: ['shape'],
            },
        });

        expect(migrated.scene.elements.shape.properties.elementRotation.value).toBe(180);
    });

    it('converts numeric macros used exclusively by migrated angle properties', () => {
        const migrated = migrateSceneRotationUnitsV7({
            schemaVersion: 6,
            scene: {
                elements: {
                    shape: {
                        id: 'shape',
                        type: 'basicShapes',
                        properties: {
                            startAngle: { type: 'macro', macroId: 'macro.angle' },
                        },
                    },
                },
                elementsOrder: ['shape'],
                macros: {
                    macros: {
                        'macro.angle': {
                            name: 'macro.angle',
                            type: 'number',
                            value: Math.PI / 2,
                            defaultValue: Math.PI,
                            options: { min: 0, max: Math.PI * 2, step: 0.01 },
                            createdAt: 0,
                            lastModified: 0,
                        },
                    },
                    allIds: ['macro.angle'],
                },
            },
        });

        const macro = migrated.scene.macros.macros['macro.angle'];
        expect(macro.value).toBeCloseTo(90);
        expect(macro.defaultValue).toBeCloseTo(180);
        expect(macro.options.max).toBeCloseTo(360);
        expect(macro.options.step).toBeCloseTo(0.5729577951);
    });

    it('does not convert macros shared with non-angle properties', () => {
        const migrated = migrateSceneRotationUnitsV7({
            schemaVersion: 6,
            scene: {
                elements: {
                    shape: {
                        id: 'shape',
                        type: 'basicShapes',
                        properties: {
                            startAngle: { type: 'macro', macroId: 'macro.shared' },
                            radius: { type: 'macro', macroId: 'macro.shared' },
                        },
                    },
                },
                elementsOrder: ['shape'],
                macros: {
                    macros: {
                        'macro.shared': {
                            name: 'macro.shared',
                            type: 'number',
                            value: Math.PI,
                            defaultValue: Math.PI,
                            options: {},
                            createdAt: 0,
                            lastModified: 0,
                        },
                    },
                    allIds: ['macro.shared'],
                },
            },
        });

        expect(migrated.scene.macros.macros['macro.shared'].value).toBe(Math.PI);
    });
});

import { describe, expect, it } from 'vitest';
import { createFlatSceneGraph } from '@state/scene-graph';
import { migrateOutputBlendModeV10 } from '../migrations/outputBlendModeV10';

function legacyGraph(ids: string[]) {
    const graph = createFlatSceneGraph(ids);
    for (const node of Object.values(graph.nodesById)) {
        if (node.kind === 'element') delete (node as any).outputBlendMode;
    }
    return graph;
}

describe('output blend mode v10 migration', () => {
    it('moves whole-output constants while preserving internal image blending', () => {
        const source = {
            schemaVersion: 9,
            scene: {
                elements: {
                    shape: {
                        id: 'shape',
                        type: 'basicShapes',
                        properties: { blendMode: { type: 'constant', value: 'multiply' } },
                    },
                    image: {
                        id: 'image',
                        type: 'image',
                        properties: { blendMode: { type: 'constant', value: 'screen' } },
                    },
                },
                graph: legacyGraph(['shape', 'image']),
            },
        };

        const migrated = migrateOutputBlendModeV10(source as any);

        expect(migrated.schemaVersion).toBe(10);
        expect(migrated.scene.graph.nodesById['element:shape'].outputBlendMode).toBe('multiply');
        expect(migrated.scene.elements.shape.properties.blendMode).toBeUndefined();
        expect(migrated.scene.elements.image.properties.blendMode.value).toBe('screen');
    });

    it('moves macro and keyframe bindings and rewrites automation ownership', () => {
        const graph = legacyGraph(['spectrum', 'meter']);
        const source = {
            schemaVersion: 9,
            scene: {
                elements: {
                    spectrum: {
                        id: 'spectrum',
                        type: 'audioSpectrum',
                        properties: { blendMode: { type: 'keyframes', channelId: 'channel:blend' } },
                    },
                    meter: {
                        id: 'meter',
                        type: 'audioVolumeMeter',
                        properties: { blendMode: { type: 'macro', macroId: 'macro:blend' } },
                    },
                },
                graph,
                automation: {
                    channels: {
                        'channel:blend': {
                            id: 'channel:blend',
                            target: { owner: { kind: 'element', id: 'spectrum' }, propertyPath: 'blendMode' },
                            valueType: 'string',
                            keyframes: [],
                        },
                    },
                },
            },
        };

        const migrated = migrateOutputBlendModeV10(source as any);

        expect(migrated.scene.nodeBindings['element:spectrum'].outputBlendMode).toEqual({
            type: 'keyframes',
            channelId: 'channel:blend',
        });
        expect(migrated.scene.nodeBindings['element:meter'].outputBlendMode).toEqual({
            type: 'macro',
            macroId: 'macro:blend',
        });
        expect(migrated.scene.automation.channels['channel:blend'].target).toEqual({
            owner: { kind: 'node', id: 'element:spectrum' },
            propertyPath: 'outputBlendMode',
        });
    });
});

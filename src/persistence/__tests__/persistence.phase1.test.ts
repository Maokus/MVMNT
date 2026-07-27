import { exportScene, importScene, createPatchUndoController } from '../index';
import { useTimelineStore } from '@state/timelineStore';
import { canonicalizeElements } from '../ordering';
import { serializeStable } from '../stable-stringify';
import { describe, expect, it, test } from 'vitest';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';

describe('Persistence', () => {
    test('Stable stringify deterministic for object key order', () => {
        const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
        const s1 = serializeStable(a);
        const s2 = serializeStable({ c: { x: 2, y: 1 }, a: 2, b: 1 });
        expect(s1).toEqual(s2);
    });

    test('Canonical ordering sorts by (z,type,id)', () => {
        const elems = [
            { id: 'c', type: 'B', z: 5 },
            { id: 'a', type: 'A', z: 1 },
            { id: 'b', type: 'A', z: 1 },
            { id: 'd', type: 'A', z: 10 },
        ];
        const sorted = canonicalizeElements(elems);
        expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    test('Export -> Import -> Export round-trip stable ignoring modifiedAt', async () => {
        const first = await exportScene();
        if (!first.ok) throw new Error('First export failed');
        expect(first.ok).toBe(true);
        expect(first.envelope.schemaVersion).toBe(11);
        const json1 = serializeStable(first.envelope);
        const imp = await importScene(first.zip);
        expect(imp.ok).toBe(true);
        const second = await exportScene();
        if (!second.ok) throw new Error('Second export failed');
        const env1 = JSON.parse(json1);
        const env2: any = second.envelope;
        // Remove volatile fields (createdAt/modifiedAt, macro exportedAt may differ)
        delete env1.metadata?.modifiedAt;
        delete env2.metadata?.modifiedAt;
        delete env1.metadata?.createdAt;
        delete env2.metadata?.createdAt;
        if (env1.scene?.macros) delete env1.scene.macros.exportedAt;
        if (env2.scene?.macros) delete env2.scene.macros.exportedAt;
        expect(serializeStable(env1)).toEqual(serializeStable(env2));
    });

    test('V10 export strips deprecated audio placement fields defensively', async () => {
        useTimelineStore.setState({
            tracks: {
                legacyAudio: {
                    id: 'legacyAudio',
                    name: 'Legacy Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    offsetTicks: 120,
                    regionStartTick: 10,
                    regionEndTick: 200,
                    audioSourceId: 'source1',
                    clips: [
                        {
                            id: 'clip1',
                            type: 'audio',
                            sourceId: 'source1',
                            offsetTicks: 120,
                            regionStartTick: 10,
                            regionEndTick: 200,
                            sourceStartSeconds: 0.1,
                            sourceEndSeconds: 1,
                        },
                    ],
                } as any,
            },
            tracksOrder: ['legacyAudio'],
        });

        const result = await exportScene();
        if (!result.ok) throw new Error('Export failed');
        const track: any = result.envelope.timeline.tracks.legacyAudio;
        expect(track.offsetTicks).toBeUndefined();
        expect(track.regionStartTick).toBeUndefined();
        expect(track.regionEndTick).toBeUndefined();
        expect(track.audioSourceId).toBeUndefined();
        expect(track.clips[0].regionStartTick).toBeUndefined();
        expect(track.clips[0].regionEndTick).toBeUndefined();
        useTimelineStore.getState().resetTimeline();
    });

    test('Undo controller tracks scene commands and can undo/redo', () => {
        const undo = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        useSceneStore.getState().clearScene();
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'undo-phase1',
            config: { text: { type: 'constant', value: 'Phase1' } },
        });
        expect(undo.canUndo()).toBe(true);
        undo.undo();
        expect(useSceneStore.getState().elements['undo-phase1']).toBeUndefined();
        expect(undo.canRedo()).toBe(true);
        undo.redo();
        expect(useSceneStore.getState().elements['undo-phase1']).toBeDefined();
    });
});

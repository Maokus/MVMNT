import { describe, it, expect } from 'vitest';
import { exportScene, importScene } from '../index';
import { serializeStable } from '../stable-stringify';
import { validateSceneEnvelope } from '../validate';

// Helper to produce a minimal valid envelope baseline to mutate
async function makeValidEnvelope(): Promise<any> {
    const exp = await exportScene();
    if (!exp.ok) throw new Error('Export failed during validation tests');
    return structuredClone(exp.envelope);
}

describe('Persistence validation extended', () => {
    it('accepts nested groups in schema v12 without persisting editor scope', async () => {
        const env = await makeValidEnvelope();
        const graph = env.scene.graph;
        const root = graph.nodesById[graph.rootId];
        const group = (id: string, parentId: string, children: string[]) => ({
            id,
            parentId,
            name: id,
            kind: 'group',
            children,
            localVisible: true,
            localLocked: false,
            parentCompensation: [1, 0, 0, 1, 0, 0],
            userNodeTransform: {
                translationX: 0,
                translationY: 0,
                rotation: 0,
                uniformScale: 1,
                pivotX: 0,
                pivotY: 0,
            },
        });
        graph.nodesById['group:outer'] = group('group:outer', root.id, ['group:inner']);
        graph.nodesById['group:inner'] = group('group:inner', 'group:outer', []);
        root.children.push('group:outer');
        expect(validateSceneEnvelope(env).ok).toBe(true);
        expect(env.scene).not.toHaveProperty('editingContainerId');
    });

    it('detects missing metadata object', async () => {
        const env = await makeValidEnvelope();
        delete env.metadata;
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_METADATA_MISSING')).toBe(true);
    });

    it('detects wrong format field', async () => {
        const env = await makeValidEnvelope();
        env.format = 'other.format';
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_FORMAT')).toBe(true);
    });

    it('detects duplicate element ids', async () => {
        const env = await makeValidEnvelope();
        const root = env.scene.graph.nodesById[env.scene.graph.rootId];
        if (root.children.length === 0) {
            env.scene.elements.x = { id: 'x', type: 'shape', properties: {} };
            const node = {
                id: 'element:x',
                parentId: root.id,
                name: 'x',
                kind: 'element',
                elementId: 'x',
                localVisible: true,
                localLocked: false,
                parentCompensation: [1, 0, 0, 1, 0, 0],
                userNodeTransform: {
                    translationX: 0,
                    translationY: 0,
                    rotation: 0,
                    uniformScale: 1,
                    pivotX: 0,
                    pivotY: 0,
                },
            };
            env.scene.graph.nodesById[node.id] = node;
            root.children.push(node.id);
        }
        root.children.push(root.children[0]);
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_SCENE_GRAPH')).toBe(true);
    });

    it('detects malformed tracksOrder type', async () => {
        const env = await makeValidEnvelope();
        env.timeline.tracksOrder = 'not-an-array';
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_TRACKS_ORDER_TYPE')).toBe(true);
    });

    it('detects metadata author type mismatch', async () => {
        const env = await makeValidEnvelope();
        env.metadata.author = 123;
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_METADATA_AUTHOR')).toBe(true);
    });

    it('detects tracksOrder reference mismatch', async () => {
        const env = await makeValidEnvelope();
        env.timeline.tracks = {}; // ensure empty
        env.timeline.tracksOrder = ['missing'];
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_TRACKS_ORDER_REF')).toBe(true);
    });

    it('detects globalBpm range violation', async () => {
        const env = await makeValidEnvelope();
        env.timeline.timeline.globalBpm = 0; // invalid
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_GLOBAL_BPM_RANGE')).toBe(true);
    });

    it('importScene rejects an unpackaged scene artifact', async () => {
        const res = await importScene(new TextEncoder().encode('{ invalid'));
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.errors.some((e) => e.code === 'ERR_PACKAGE_FORMAT')).toBe(true);
        }
    });

    it('valid envelope still validates ok (regression)', async () => {
        const env = await makeValidEnvelope();
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(true);
        expect(r.errors.length).toBe(0);
        // Round-trip re-stringify stable
        const stable = serializeStable(env);
        expect(typeof stable).toBe('string');
    });

    it('validates V8 MIDI clips for malformed, missing source, duplicate id, and overlap cases', async () => {
        const env = await makeValidEnvelope();
        env.timeline.midiCache = {
            source1: {
                notesRaw: [{ startTick: 0, endTick: 960, note: 60, channel: 0, durationTicks: 960 }],
                ccRaw: [],
                ticksPerQuarter: 960,
                bounds: { minTick: 0, maxTick: 960, minNote: 60, maxNote: 60, maxDurationTicks: 960 },
            },
        };
        env.timeline.tracks = {
            track1: {
                id: 'track1',
                name: 'MIDI',
                type: 'midi',
                enabled: true,
                mute: false,
                solo: false,
                clips: [{ id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: 0 }],
            },
        };
        env.timeline.tracksOrder = ['track1'];

        expect(validateSceneEnvelope(env).ok).toBe(true);

        const malformed = structuredClone(env);
        delete malformed.timeline.tracks.track1.clips;
        expect(validateSceneEnvelope(malformed).errors[0].code).toBe('ERR_MIDI_CLIPS_SHAPE');

        const missingSource = structuredClone(env);
        missingSource.timeline.tracks.track1.clips[0].sourceId = 'missing';
        expect(validateSceneEnvelope(missingSource).errors[0].code).toBe('ERR_MIDI_CLIP_SOURCE');

        const duplicate = structuredClone(env);
        duplicate.timeline.tracks.track1.clips.push({
            id: 'clip1',
            type: 'midi',
            sourceId: 'source1',
            offsetTicks: 2000,
        });
        expect(validateSceneEnvelope(duplicate).errors[0].code).toBe('ERR_MIDI_CLIP_DUPLICATE');

        const overlap = structuredClone(env);
        overlap.timeline.tracks.track1.clips.push({ id: 'clip2', type: 'midi', sourceId: 'source1', offsetTicks: 100 });
        expect(validateSceneEnvelope(overlap).errors[0].code).toBe('ERR_MIDI_CLIP_OVERLAP');
    });

    it('requires the V10 clips-only, source-time audio shape', async () => {
        const env = await makeValidEnvelope();
        env.timeline.tracks = {
            audio1: {
                id: 'audio1',
                name: 'Audio',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [
                    {
                        id: 'clip1',
                        type: 'audio',
                        sourceId: 'source1',
                        offsetTicks: 0,
                        sourceStartSeconds: 0.25,
                        sourceEndSeconds: 1,
                    },
                ],
            },
        };
        env.timeline.tracksOrder = ['audio1'];
        expect(validateSceneEnvelope(env).ok).toBe(true);

        const trackLegacy = structuredClone(env);
        trackLegacy.timeline.tracks.audio1.audioSourceId = 'source1';
        expect(validateSceneEnvelope(trackLegacy).errors[0].code).toBe('ERR_AUDIO_LEGACY_FIELD');

        const clipLegacy = structuredClone(env);
        clipLegacy.timeline.tracks.audio1.clips[0].regionStartTick = 120;
        expect(validateSceneEnvelope(clipLegacy).errors[0].code).toBe('ERR_AUDIO_LEGACY_FIELD');

        const invalidTrim = structuredClone(env);
        invalidTrim.timeline.tracks.audio1.clips[0].sourceEndSeconds = 0.1;
        expect(validateSceneEnvelope(invalidTrim).errors[0].code).toBe('ERR_AUDIO_CLIP_SHAPE');

        const inline = structuredClone(env);
        inline.assets.storage = 'inline-json';
        expect(validateSceneEnvelope(inline).ok).toBe(false);
    });

    it('allows repeated object references that are not circular', () => {
        const shared = { mode: 'cubic', direction: 'ease_in_out' };
        const value = {
            first: shared,
            second: shared,
        };

        expect(serializeStable(value)).toBe(
            '{"first":{"direction":"ease_in_out","mode":"cubic"},"second":{"direction":"ease_in_out","mode":"cubic"}}'
        );
    });
});

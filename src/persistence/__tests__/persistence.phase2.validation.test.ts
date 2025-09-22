import { describe, it, expect } from 'vitest';
import { exportScene, importScene } from '../index';
import { serializeStable } from '../stable-stringify';
import { validateSceneEnvelope } from '../validate';

// Helper to produce a minimal valid envelope baseline to mutate
function makeValidEnvelope() {
    const exp = exportScene();
    if (!exp.ok) throw new Error('Feature flag disabled for tests; enable SERIALIZATION_V1');
    return JSON.parse(exp.json);
}

describe('Persistence validation extended', () => {
    it('detects missing metadata object', () => {
        const env = makeValidEnvelope();
        delete env.metadata;
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_METADATA_MISSING')).toBe(true);
    });

    it('detects wrong format field', () => {
        const env = makeValidEnvelope();
        env.format = 'other.format';
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_FORMAT')).toBe(true);
    });

    it('detects duplicate element ids', () => {
        const env = makeValidEnvelope();
        env.scene.elements = [{ id: 'x' }, { id: 'x' }];
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_DUP_ELEMENT_ID')).toBe(true);
    });

    it('detects malformed tracksOrder type', () => {
        const env = makeValidEnvelope();
        env.timeline.tracksOrder = 'not-an-array';
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_TRACKS_ORDER_TYPE')).toBe(true);
    });

    it('detects tracksOrder reference mismatch', () => {
        const env = makeValidEnvelope();
        env.timeline.tracks = {}; // ensure empty
        env.timeline.tracksOrder = ['missing'];
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_TRACKS_ORDER_REF')).toBe(true);
    });

    it('detects globalBpm range violation', () => {
        const env = makeValidEnvelope();
        env.timeline.timeline.globalBpm = 0; // invalid
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_GLOBAL_BPM_RANGE')).toBe(true);
    });

    it('importScene fails gracefully on malformed JSON', () => {
        const res = importScene('{ invalid');
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.errors.some((e) => e.code === 'ERR_JSON_PARSE')).toBe(true);
        }
    });

    it('valid envelope still validates ok (regression)', () => {
        const env = makeValidEnvelope();
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(true);
        expect(r.errors.length).toBe(0);
        // Round-trip re-stringify stable
        const stable = serializeStable(env);
        expect(typeof stable).toBe('string');
    });
});

import { describe, it, expect } from 'vitest';
import { exportScene, importScene } from '../index';
import { serializeStable } from '../stable-stringify';
import { validateSceneEnvelope } from '../validate';
import type { ExportSceneResult, ExportSceneResultInline } from '../export';

function requireInline(result: ExportSceneResult): ExportSceneResultInline {
    if (!result.ok || result.mode !== 'inline-json') {
        throw new Error('Expected inline-json export result');
    }
    return result;
}

// Helper to produce a minimal valid envelope baseline to mutate
async function makeValidEnvelope() {
    const exp = requireInline(await exportScene());
    if (!exp.ok) throw new Error('Export failed during validation tests');
    return JSON.parse(exp.json);
}

describe('Persistence validation extended', () => {
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
        env.scene.elements = [{ id: 'x' }, { id: 'x' }];
        const r = validateSceneEnvelope(env);
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.code === 'ERR_DUP_ELEMENT_ID')).toBe(true);
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

    it('importScene fails gracefully on malformed JSON', async () => {
        const res = await importScene('{ invalid');
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.errors.some((e) => e.code === 'ERR_JSON_PARSE')).toBe(true);
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
});

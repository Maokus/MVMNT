import { describe, expect, it } from 'vitest';
import { exportScene } from '../export';
import { validateSceneEnvelope } from '../validate';

describe('schema v9 font asset validation', () => {
    it('rejects project variants without a binary identity', async () => {
        const exported = await exportScene();
        if (!exported.ok) throw new Error('Expected a valid scene export');
        const envelope = structuredClone(exported.envelope) as any;
        envelope.scene.fontAssets = {
            broken: {
                id: 'broken',
                family: 'Broken',
                source: 'upload',
                variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'woff2' }],
            },
        };

        const validation = validateSceneEnvelope(envelope);
        expect(validation.ok).toBe(false);
        expect(validation.errors).toContainEqual(
            expect.objectContaining({ code: 'ERR_FONT_ASSET_SHAPE', path: 'scene.fontAssets.broken' })
        );
    });
});

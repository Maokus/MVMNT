import { describe, expect, it } from 'vitest';
import * as publicAnimation from '../../../../../packages/plugin-sdk/src/animation';
import { CallbackElementRenderer } from '../../../../../packages/plugin-sdk/src/scene';
import * as appAnimation from '@math/animation/anim-math';
import appEasings from '@math/animation/easing';
import { HostCallbackElementRenderer } from '../legacy-callback-renderer';

class PublicRenderer extends CallbackElementRenderer {
    _buildRenderObjects(): readonly never[] {
        return [];
    }
}

class HostRenderer extends HostCallbackElementRenderer {
    _buildRenderObjects(): readonly never[] {
        return [];
    }
}

const context = () => ({
    signal: new AbortController().signal,
    diagnostics: { report() {} },
    assets: {
        load: async () => ({ ok: false as const, error: { code: 'NOT_FOUND', message: 'unused' } }),
        project: () => ({ update: () => ({ resource: null, status: 'idle' }), dispose() {} }),
        bundledImage: () => ({ get: () => ({ resource: null, status: 'idle' }), dispose() {} }),
        bundledSparrow: () => ({ get: () => ({ resource: null, status: 'idle' }), dispose() {} }),
        bundledGridAtlas: () => ({ get: () => ({ resource: null, status: 'idle' }), dispose() {} }),
    },
});

describe('SDK ownership boundaries', () => {
    it('uses one animation implementation in the app and public SDK', () => {
        expect(appAnimation.clamp).toBe(publicAnimation.clamp);
        expect(appAnimation.remap).toBe(publicAnimation.remap);
        expect(appAnimation.FloatCurve).toBe(publicAnimation.FloatCurve);
        expect(appEasings).toBe(publicAnimation.easings);

        expect(publicAnimation.remap(0, 100, 0, 1, -10)).toBe(0);
        expect(publicAnimation.remap(0, 100, 0, 1, 25)).toBe(0.25);
        expect(publicAnimation.remap(0, 100, 0, 1, 150)).toBe(1);
        expect(new publicAnimation.FloatCurve([]).valAt(0.5)).toBe(0.5);
    });

    it('keeps the legacy callback facade implemented by the host', () => {
        const publicRenderer = new PublicRenderer();
        publicRenderer.__attach(context() as any, {});
        expect(() => publicRenderer.__hostFacade()).toThrow(/host-provided migration adapter/);

        const hostRenderer = new HostRenderer();
        hostRenderer.__attach(context() as any, {});
        expect(hostRenderer.__hostFacade()).toMatchObject({
            ok: true,
            status: 'ok',
            api: { timeline: expect.any(Object), timing: expect.any(Object), audio: expect.any(Object) },
        });
    });
});

import { describe, expect, it } from 'vitest';
import * as publicAnimation from '../../../../../packages/plugin-sdk/src/animation';
import * as appAnimation from '@math/animation/anim-math';
import appEasings from '@math/animation/easing';

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
});

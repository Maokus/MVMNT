import { describe, expect, it } from 'vitest';
import { ok } from '../../../../../packages/plugin-sdk/src/api';
import type { CapabilityContext } from '../../../../../packages/plugin-sdk/src/scene';
import { TimingManager } from '@core/timing';
import { syncSceneElementTiming } from '../scene-element-timing';

describe('scene element timing', () => {
    it('drives element bar helpers through the host tempo mapping', () => {
        const host = new TimingManager('host');
        host.setTempoMap([
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ]);
        const context = {
            timing: {
                secondsToBeats: (seconds: number) => ok(host.secondsToBeats(seconds)),
                beatsToSeconds: (beats: number) => ok(host.beatsToSeconds(beats)),
            },
        } as CapabilityContext;
        const element = new TimingManager('element');

        syncSceneElementTiming(element, context, 120, { numerator: 4, denominator: 4 });

        expect(element.getTimeUnitWindow(3, 1)).toEqual({ start: 2, end: 6 });
    });
});

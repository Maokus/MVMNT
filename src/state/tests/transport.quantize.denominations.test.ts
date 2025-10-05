import { describe, it, expect, beforeEach } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '../timelineStore';

const getState = () => useTimelineStore.getState();

describe('transport quantize denominations', () => {
    beforeEach(() => {
        getState().resetTimeline();
    });

    it('supports quarter note snapping on play', () => {
        const api = getState();
        const unevenTick = Math.round(1.75 * CANONICAL_PPQ);
        api.setCurrentTick(unevenTick, 'user');
        api.setQuantize('quarter');
        expect(getState().transport.quantize).toBe('quarter');
        api.play();
        const after = getState().timeline.currentTick;
        expect(after).toBe(1 * CANONICAL_PPQ);
    });

    it('supports sixteenth note snapping on play', () => {
        const api = getState();
        const sixteenth = Math.round(CANONICAL_PPQ / 4);
        const unevenTick = 3 * sixteenth + Math.round(sixteenth * 0.6);
        api.setCurrentTick(unevenTick, 'user');
        api.setQuantize('sixteenth');
        expect(getState().transport.quantize).toBe('sixteenth');
        api.play();
        const after = getState().timeline.currentTick;
        expect(after).toBe(3 * sixteenth);
    });
});

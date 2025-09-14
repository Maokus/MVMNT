// timing.ts: deprecated transitional selectors have been removed (seconds/beats/bars domain helpers).
// Only tick-based helpers are retained. Any component needing seconds/beat conversions
// should derive them ad-hoc via tempo-utils + store state (see timeDerived selectors) to keep
// canonical domain focused on ticks.

import type { TimelineState } from '@state/timelineStore';

// Tick-based helpers (preferred canonical domain)
export function ticksToBeats(state: TimelineState, tick: number): number {
    const ppq = 480; // unified PPQ (matches TimingManager + CANONICAL_PPQ)
    return tick / ppq;
}

export function ticksToBars(state: TimelineState, tick: number): number {
    const beats = ticksToBeats(state, tick);
    return beats / (state.timeline.beatsPerBar || 4);
}

export function currentBeats(state: TimelineState): number {
    return ticksToBeats(state, state.timeline.currentTick);
}

export function currentBars(state: TimelineState): number {
    return ticksToBars(state, state.timeline.currentTick);
}

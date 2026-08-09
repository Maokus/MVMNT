import { CANONICAL_PPQ } from '@core/timing/ppq';
import { resolveTempoKeyframes } from '@core/timing/tempo-automation-resolver';
import type { TimelineState } from './storeTypes';

export function applyTempoAutomation(getState: () => TimelineState): void {
    const state = getState();
    const automation = state.timeline.tempoAutomation;
    if (!automation?.enabled) return;
    state.setMasterTempoMap(resolveTempoKeyframes(automation.keyframes, state.timeline.globalBpm, CANONICAL_PPQ));
}

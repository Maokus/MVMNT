import { resolveTempoKeyframes } from '@core/timing/tempo-automation-resolver';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { TempoKeyframe } from '@core/timing/types';
import type {
    TimelineCommand,
    TimelineCommandContext,
    TimelineCommandExecuteResult,
    TimelineCommandId,
} from '../commandTypes';
import { applyTimelinePatchActions, type TimelineCommandPatch, type TimelineTimingSnapshot } from '../patches';

export interface SetGlobalBpmPayload {
    bpm: number;
}

export interface SetBeatsPerBarPayload {
    beatsPerBar: number;
}

export interface SetTempoAutomationPayload {
    enabled: boolean;
    keyframes: TempoKeyframe[];
}

type TimingPayload = SetGlobalBpmPayload | SetBeatsPerBarPayload | SetTempoAutomationPayload;

function cloneTiming(context: TimelineCommandContext): TimelineTimingSnapshot {
    const timeline = context.getState().timeline;
    return {
        globalBpm: timeline.globalBpm,
        beatsPerBar: timeline.beatsPerBar,
        masterTempoMap: timeline.masterTempoMap?.map((entry) => ({ ...entry })),
        tempoAutomation: timeline.tempoAutomation
            ? {
                  ...timeline.tempoAutomation,
                  keyframes: timeline.tempoAutomation.keyframes.map((keyframe) => ({ ...keyframe })),
              }
            : undefined,
    };
}

function normalizedKeyframes(keyframes: readonly TempoKeyframe[]): TempoKeyframe[] {
    const byTick = new Map<number, TempoKeyframe>();
    for (const keyframe of keyframes) {
        if (!Number.isFinite(keyframe.tick) || !Number.isFinite(keyframe.bpm)) continue;
        const tick = Math.max(0, Math.round(keyframe.tick));
        byTick.set(tick, { tick, bpm: Math.max(1, Math.min(999, keyframe.bpm)) });
    }
    return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

function nextTiming(
    previous: TimelineTimingSnapshot,
    id: TimelineCommandId,
    payload: TimingPayload
): TimelineTimingSnapshot {
    let globalBpm = previous.globalBpm;
    let beatsPerBar = previous.beatsPerBar;
    let tempoAutomation = previous.tempoAutomation
        ? { ...previous.tempoAutomation, keyframes: normalizedKeyframes(previous.tempoAutomation.keyframes) }
        : undefined;

    if (id === 'timeline.setGlobalBpm') {
        const bpm = (payload as SetGlobalBpmPayload).bpm;
        globalBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    } else if (id === 'timeline.setBeatsPerBar') {
        beatsPerBar = Math.max(1, Math.floor((payload as SetBeatsPerBarPayload).beatsPerBar || 4));
    } else {
        const automation = payload as SetTempoAutomationPayload;
        tempoAutomation = {
            ...previous.tempoAutomation,
            enabled: automation.enabled,
            keyframes: normalizedKeyframes(automation.keyframes),
        };
    }

    const masterTempoMap =
        tempoAutomation?.enabled && tempoAutomation.keyframes.length
            ? resolveTempoKeyframes(tempoAutomation.keyframes, globalBpm, CANONICAL_PPQ)
            : undefined;
    return { globalBpm, beatsPerBar, tempoAutomation, masterTempoMap };
}

function sameTiming(a: TimelineTimingSnapshot, b: TimelineTimingSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function createTimingCommand(
    id: 'timeline.setGlobalBpm' | 'timeline.setBeatsPerBar' | 'timeline.setTempoAutomation',
    payload: TimingPayload,
    metadata: TimelineCommand['metadata']
): TimelineCommand<void> {
    return {
        id,
        mode: 'concurrent',
        metadata,
        async execute(context): Promise<TimelineCommandExecuteResult<void>> {
            const previous = cloneTiming(context);
            const next = nextTiming(previous, id, payload);
            const patches: TimelineCommandPatch = sameTiming(previous, next)
                ? { undo: [], redo: [] }
                : {
                      undo: [{ action: 'timeline/SET_TIMING', payload: { timing: previous } }],
                      redo: [{ action: 'timeline/SET_TIMING', payload: { timing: next } }],
                  };
            applyTimelinePatchActions(context, patches.redo);
            return { patches };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}

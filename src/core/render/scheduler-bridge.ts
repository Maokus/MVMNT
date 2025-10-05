import type { TimelineState, TimelineTrack } from '@state/timelineStore';
import { offsetTicksToSeconds } from '@core/timing/offset-utils';
import { beatsToSeconds } from '@core/timing/tempo-utils';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { CompileWindowArgs, CompileTrack, CompileMidiCache } from './compile';

export type SchedulerConfig = CompileWindowArgs;

function asMidiTracks(tracks: Record<string, TimelineTrack | any>): TimelineTrack[] {
    return Object.values(tracks).filter((t): t is TimelineTrack => Boolean(t) && t.type === 'midi');
}

function ticksToSeconds(state: TimelineState, ticks?: number): number | undefined {
    if (ticks == null) return undefined;
    const spb = 60 / (state.timeline.globalBpm || 120);
    return beatsToSeconds(state.timeline.masterTempoMap, ticks / CANONICAL_PPQ, spb);
}

export function buildSchedulerConfig(s: TimelineState, nowSec: number, lookAheadSec: number): SchedulerConfig {
    const midiTracks = asMidiTracks(s.tracks);
    const spb = 60 / (s.timeline.globalBpm || 120);
    const tracks: CompileTrack[] = midiTracks.map((t) => ({
        id: t.id,
        enabled: t.enabled,
        mute: t.mute,
        solo: t.solo,
        offsetSec: offsetTicksToSeconds(t.offsetTicks || 0, s.timeline.masterTempoMap, spb),
        regionStartSec: ticksToSeconds(s, t.regionStartTick),
        regionEndSec: ticksToSeconds(s, t.regionEndTick),
        midiSourceId: t.midiSourceId ?? t.id,
    }));
    const midiCache: CompileMidiCache = {};
    for (const [id, v] of Object.entries(s.midiCache)) {
        midiCache[id] = {
            ticksPerQuarter: v.ticksPerQuarter,
            tempoMap: v.tempoMap,
            notesRaw: v.notesRaw,
        };
    }
    return {
        tracks,
        midiCache,
        nowSec,
        lookAheadSec,
        tempoMap: s.timeline.masterTempoMap,
        bpm: s.timeline.globalBpm,
        beatsPerBar: s.timeline.beatsPerBar,
    };
}

export type SchedulerConfigDiff = Partial<SchedulerConfig> & {
    tracksChanged?: boolean;
    midiCacheChanged?: boolean;
};

export function diffSchedulerConfig(prev: SchedulerConfig | null, next: SchedulerConfig): SchedulerConfigDiff {
    if (!prev) return { ...next, tracksChanged: true, midiCacheChanged: true };
    const diff: SchedulerConfigDiff = {};
    // shallow compare primitives
    if (prev.nowSec !== next.nowSec) diff.nowSec = next.nowSec;
    if (prev.lookAheadSec !== next.lookAheadSec) diff.lookAheadSec = next.lookAheadSec;
    if (prev.bpm !== next.bpm) diff.bpm = next.bpm;
    if (prev.beatsPerBar !== next.beatsPerBar) diff.beatsPerBar = next.beatsPerBar;
    if (prev.tempoMap !== next.tempoMap) diff.tempoMap = next.tempoMap;
    // tracks shallow compare by id and fields
    const sameTracksRef = prev.tracks === next.tracks;
    if (!sameTracksRef || prev.tracks.length !== next.tracks.length) {
        diff.tracks = next.tracks;
        diff.tracksChanged = true;
    } else {
        for (let i = 0; i < next.tracks.length; i++) {
            const a = prev.tracks[i];
            const b = next.tracks[i];
            if (
                a.id !== b.id ||
                a.enabled !== b.enabled ||
                a.mute !== b.mute ||
                a.solo !== b.solo ||
                a.offsetSec !== b.offsetSec ||
                a.regionStartSec !== b.regionStartSec ||
                a.regionEndSec !== b.regionEndSec ||
                a.midiSourceId !== b.midiSourceId
            ) {
                diff.tracks = next.tracks;
                diff.tracksChanged = true;
                break;
            }
        }
    }
    // midi cache shallow compare by entry identity
    const prevKeys = Object.keys(prev.midiCache);
    const nextKeys = Object.keys(next.midiCache);
    if (prevKeys.length !== nextKeys.length) {
        diff.midiCache = next.midiCache;
        diff.midiCacheChanged = true;
    } else {
        for (const k of nextKeys) {
            if (prev.midiCache[k] !== next.midiCache[k]) {
                diff.midiCache = next.midiCache;
                diff.midiCacheChanged = true;
                break;
            }
        }
    }
    return diff;
}

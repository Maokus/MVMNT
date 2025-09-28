import type { TempoMapEntry } from '@core/timing/types';
import type { NoteRaw } from '@state/timelineTypes';
import { beatsToSeconds } from '@core/timing/tempo-utils';
import { CANONICAL_PPQ } from '@core/timing/ppq';

// Narrow view of a timeline track needed for compilation
export interface CompileTrack {
    id: string;
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    offsetSec: number;
    regionStartSec?: number;
    regionEndSec?: number;
    midiSourceId?: string;
}

// Minimal shape for cached MIDI/notes
export interface CompileMidiCacheEntry {
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
    notesRaw: NoteRaw[];
}

export type CompileMidiCache = Record<string, CompileMidiCacheEntry | undefined>;

export type ScheduledEventType = 'noteOn' | 'noteOff';

export interface ScheduledEvent {
    timeSec: number; // absolute on the timeline
    trackId: string;
    kind: ScheduledEventType;
    note: number;
    channel: number;
    velocity?: number; // for noteOn
}

export interface ScheduleBatch {
    nowSec: number;
    windowStartSec: number;
    windowEndSec: number;
    events: ScheduledEvent[];
}

export interface CompileWindowArgs {
    tracks: CompileTrack[];
    midiCache: CompileMidiCache;
    nowSec: number;
    lookAheadSec: number;
    tempoMap?: TempoMapEntry[]; // master fallback map
    bpm: number; // global fallback tempo for SPB
    beatsPerBar: number; // reserved for future bar-quantized windows
}

function inWindow(t: number, start: number, end: number): boolean {
    return t >= start && t <= end;
}

function clampToRegion(timeStart: number, timeEnd: number, regionStart?: number, regionEnd?: number) {
    const s = regionStart ?? -Infinity;
    const e = regionEnd ?? +Infinity;
    const a = Math.max(timeStart, s);
    const b = Math.min(timeEnd, e);
    return { start: a, end: b };
}

/**
 * compileWindow: produce schedule events in absolute seconds for a look-ahead window.
 * - Converts note tick/beat to seconds using provided tempo map + fallback bpm.
 * - Applies per-track offset and region clipping.
 * - Respects enabled/mute/solo gating.
 */
export function compileWindow(args: CompileWindowArgs): ScheduleBatch {
    const { tracks, midiCache, nowSec, lookAheadSec, tempoMap, bpm } = args;
    const windowStart = nowSec;
    const windowEnd = nowSec + Math.max(0, lookAheadSec);
    const fallbackSPB = 60 / Math.max(1e-6, bpm);

    const anySolo = tracks.some((t) => t.solo);

    const events: ScheduledEvent[] = [];

    for (const t of tracks) {
        if (!t.enabled) continue;
        if (anySolo ? !t.solo : t.mute) continue;
        if (!t.midiSourceId) continue;
        const cache = midiCache[t.midiSourceId];
        if (!cache) continue;

        const mapToUse = cache.tempoMap ?? tempoMap;
        const tpq = cache.ticksPerQuarter || CANONICAL_PPQ;

        for (const n of cache.notesRaw) {
            // Prefer beats (from ticks or explicit), fallback to provided seconds
            const startBeat = n.startBeat ?? n.startTick / tpq;
            const endBeat = n.endBeat ?? n.endTick / tpq;

            let startSec = beatsToSeconds(mapToUse, startBeat, fallbackSPB);
            let endSec = beatsToSeconds(mapToUse, endBeat, fallbackSPB);

            // Apply per-track timeline offset
            startSec += t.offsetSec;
            endSec += t.offsetSec;

            // Region clamp
            const clamped = clampToRegion(startSec, endSec, t.regionStartSec, t.regionEndSec);
            if (!(clamped.start < clamped.end)) continue;

            // Emit events if inside look-ahead window
            if (inWindow(clamped.start, windowStart, windowEnd)) {
                events.push({
                    timeSec: clamped.start,
                    trackId: t.id,
                    kind: 'noteOn',
                    note: n.note,
                    channel: n.channel,
                    velocity: n.velocity,
                });
            }
            if (inWindow(clamped.end, windowStart, windowEnd)) {
                events.push({
                    timeSec: clamped.end,
                    trackId: t.id,
                    kind: 'noteOff',
                    note: n.note,
                    channel: n.channel,
                });
            }
        }
    }

    // Stable sort: time ascending; on equal time, noteOff before noteOn to release prior notes
    events.sort((a, b) => a.timeSec - b.timeSec || (a.kind === 'noteOff' ? -1 : 1));

    return { nowSec, windowStartSec: windowStart, windowEndSec: windowEnd, events };
}

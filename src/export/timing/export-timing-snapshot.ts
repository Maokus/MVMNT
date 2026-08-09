import { TimingManager } from '@core/timing/timing-manager';
import type { TempoMapEntry } from '@core/timing/timing-manager';

/**
 * ExportTimingSnapshot – Immutable capture of timing configuration (tempo, tempo map, PPQ, meter)
 * taken at export start for deterministic frame -> musical position mapping even if user edits
 * tempo settings mid-export.
 */
export interface ExportTimingSnapshot {
    createdAt: number; // epoch ms
    ticksPerQuarter: number;
    baseTempo: number; // microseconds per quarter note (uniform tempo fallback)
    beatsPerBar: number;
    tempoMap?: TempoMapEntry[] | null; // original tempo map (seconds domain)
    // Precomputed segments for fast seconds<->beats conversions
    _segments?: Array<{
        time: number; // seconds
        tempo: number; // microseconds per quarter note
        secondsPerBeat: number;
        cumulativeBeats: number; // beats up to start of this segment
    }> | null;
}

export function createExportTimingSnapshot(tm: TimingManager): ExportTimingSnapshot {
    // Reconstruct segments similarly to TimingManager internal representation to avoid relying on private fields
    const tempoMap = tm.tempoMap ? [...tm.tempoMap] : null;
    let segments: ExportTimingSnapshot['_segments'] = null;
    if (tempoMap && tempoMap.length > 0) {
        const ordered = [...tempoMap]
            .filter((e) => typeof e.time === 'number' && e.time >= 0 && (e.tempo != null || e.bpm != null))
            .map((e) => ({
                time: e.time,
                tempo: e.tempo ?? (e.bpm ? 60_000_000 / e.bpm : tm.tempo),
            }))
            .sort((a, b) => a.time - b.time);
        if (ordered.length) {
            segments = [];
            let cumulativeBeats = 0;
            for (let i = 0; i < ordered.length; i++) {
                const entry = ordered[i];
                const secondsPerBeat = entry.tempo / 1_000_000;
                if (segments.length === 0) {
                    segments.push({
                        time: entry.time,
                        tempo: entry.tempo,
                        secondsPerBeat,
                        cumulativeBeats: 0,
                    });
                } else {
                    const prev = segments[segments.length - 1];
                    const dt = Math.max(0, entry.time - prev.time);
                    const beatsInPrev = dt / prev.secondsPerBeat;
                    cumulativeBeats = prev.cumulativeBeats + beatsInPrev;
                    segments.push({
                        time: entry.time,
                        tempo: entry.tempo,
                        secondsPerBeat,
                        cumulativeBeats,
                    });
                }
            }
        }
    }
    return {
        createdAt: Date.now(),
        ticksPerQuarter: tm.ticksPerQuarter,
        baseTempo: tm.tempo, // microseconds per quarter note
        beatsPerBar: tm.beatsPerBar,
        tempoMap: tempoMap,
        _segments: segments,
    };
}

// ---- Conversion helpers (pure, deterministic, independent of live timing manager) ----

export function snapshotSecondsToTicks(snapshot: ExportTimingSnapshot, seconds: number): number {
    // Inline seconds->beats conversion (was snapshotSecondsToBeats) to reduce surface area
    const segs = snapshot._segments;
    let beats: number;
    if (!segs || segs.length === 0) {
        const spb = snapshot.baseTempo / 1_000_000;
        beats = seconds / spb;
    } else {
        let lo = 0,
            hi = segs.length - 1,
            idx = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (segs[mid].time <= seconds) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        const seg = segs[idx];
        const dt = seconds - seg.time;
        beats = seg.cumulativeBeats + dt / seg.secondsPerBeat;
    }
    return beats * snapshot.ticksPerQuarter;
}

export function snapshotTicksToSeconds(snapshot: ExportTimingSnapshot, ticks: number): number {
    // Inline beats->seconds conversion (was snapshotBeatsToSeconds)
    const beats = ticks / snapshot.ticksPerQuarter;
    const segs = snapshot._segments;
    if (!segs || segs.length === 0) {
        const spb = snapshot.baseTempo / 1_000_000;
        return beats * spb;
    }
    let lo = 0,
        hi = segs.length - 1,
        idx = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (segs[mid].cumulativeBeats <= beats) {
            idx = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    const seg = segs[idx];
    const beatsInSeg = beats - seg.cumulativeBeats;
    return seg.time + beatsInSeg * seg.secondsPerBeat;
}

export function cloneSnapshot(snapshot: ExportTimingSnapshot): ExportTimingSnapshot {
    return {
        ...snapshot,
        tempoMap: snapshot.tempoMap ? [...snapshot.tempoMap] : null,
        _segments: snapshot._segments ? [...snapshot._segments] : null,
    } as ExportTimingSnapshot;
}

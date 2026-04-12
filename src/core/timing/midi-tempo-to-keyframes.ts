import type { TempoMapEntry, TempoKeyframe } from './types';
import { createTempoMapper } from './tempo-mapper';

/**
 * Convert a seconds-domain TempoMapEntry[] (from MIDI import) into tick-domain TempoKeyframe[]
 * for the tempo automation lane.
 *
 * Uses a TempoMapper built from the provided map to convert seconds → ticks. This avoids
 * circularity: the map bootstraps itself (we convert from a known seconds-domain representation
 * to tick-domain using that same map as the reference).
 */
export function midiTempoMapToKeyframes(map: TempoMapEntry[], ppq: number): TempoKeyframe[] {
    if (!map.length) return [];

    // Determine a reasonable globalBpm from the first entry
    const firstBpm = entryToBpm(map[0]);

    const tempoMapper = createTempoMapper({
        ticksPerQuarter: ppq,
        globalBpm: firstBpm,
        tempoMap: map,
    });

    return map.map((entry) => ({
        tick: Math.round(tempoMapper.secondsToTicks(entry.time)),
        bpm: entryToBpm(entry),
    }));
}

function entryToBpm(entry: TempoMapEntry): number {
    if (typeof entry.bpm === 'number' && entry.bpm > 0) return entry.bpm;
    if (typeof entry.tempo === 'number' && entry.tempo > 0) return 60_000_000 / entry.tempo;
    return 120;
}

// Shared helpers for seconds<->beats given a tempo map (microseconds per quarter entries)

type TempoMapEntry = { time: number; tempo?: number; bpm?: number };

type Seg = {
    time: number;
    secondsPerBeat: number;
    cumulativeBeats: number;
};

function normalizeMap(map: TempoMapEntry[] | null | undefined): Seg[] {
    if (!map || map.length === 0) return [];
    const entries = map
        .map((e) => ({ time: e.time, tempo: e.tempo ?? (e.bpm ? 60_000_000 / e.bpm : undefined) }))
        .filter((e) => typeof e.time === 'number' && e.time >= 0 && typeof e.tempo === 'number')
        .sort((a, b) => a.time - b.time) as Array<{ time: number; tempo: number }>;
    if (entries.length === 0) return [];
    const segs: Seg[] = [];
    let cumulativeBeats = 0;
    for (let i = 0; i < entries.length; i++) {
        const { time, tempo } = entries[i];
        const secondsPerBeat = tempo / 1_000_000;
        const s: Seg = { time, secondsPerBeat, cumulativeBeats };
        if (segs.length > 0) {
            const prev = segs[segs.length - 1];
            const dur = Math.max(0, time - prev.time);
            const beatsPrev = dur / prev.secondsPerBeat;
            cumulativeBeats = prev.cumulativeBeats + beatsPrev;
            s.cumulativeBeats = cumulativeBeats;
        }
        segs.push(s);
    }
    return segs;
}

export function beatsToSecondsWithMap(
    beats: number,
    map: TempoMapEntry[] | null | undefined,
    fallbackSecondsPerBeat: number
) {
    const segs = normalizeMap(map);
    if (segs.length === 0) return beats * fallbackSecondsPerBeat;
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

export function secondsToBeatsWithMap(
    seconds: number,
    map: TempoMapEntry[] | null | undefined,
    fallbackSecondsPerBeat: number
) {
    const segs = normalizeMap(map);
    if (segs.length === 0) return seconds / fallbackSecondsPerBeat;
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
    return seg.cumulativeBeats + dt / seg.secondsPerBeat;
}

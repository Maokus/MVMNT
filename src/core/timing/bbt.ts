// BBT utilities for Phase 5 tick-domain UI
// Canonical PPQ currently fixed at 480 (unified across TimingManager + store). If higher temporal
// resolution is desired later we can make this configurable, but previously mixing 480 & 960 caused
// doubling bugs (e.g. scene end seconds -> ticks -> seconds returned 2x). Keep single source.
export const DEFAULT_TICKS_PER_QUARTER = 480;

export function formatTickAsBBT(
    tick: number,
    ppq: number = DEFAULT_TICKS_PER_QUARTER,
    beatsPerBar: number = 4
): string {
    if (!isFinite(tick)) return '0.1.0';
    const beatsFloat = tick / ppq; // beats (quarter notes)
    const bar = Math.floor(beatsFloat / beatsPerBar) + 1; // bars are 1-based for display
    const beatInBarFloat = beatsFloat % beatsPerBar;
    const beat = Math.floor(beatInBarFloat) + 1; // 1-based
    const tickRemainder = Math.round((beatInBarFloat - Math.floor(beatInBarFloat)) * ppq);
    return `${bar}.${beat}.${tickRemainder}`;
}

// Parse strings like "5.2.120" or "5:2:120" or "5.2" (defaults ticks=0) or "5" (bar only)
export function parseBBT(
    input: string,
    ppq: number = DEFAULT_TICKS_PER_QUARTER,
    beatsPerBar: number = 4
): number | null {
    if (!input) return null;
    const norm = input.trim().replace(/:/g, '.');
    const parts = norm
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length === 0) return null;
    let bar = 1,
        beat = 1,
        ticks = 0;
    if (parts.length === 1) {
        bar = parseInt(parts[0], 10);
    } else if (parts.length === 2) {
        bar = parseInt(parts[0], 10);
        beat = parseInt(parts[1], 10);
    } else {
        bar = parseInt(parts[0], 10);
        beat = parseInt(parts[1], 10);
        ticks = parseInt(parts[2], 10);
    }
    if (![bar, beat, ticks].every((n) => Number.isFinite(n) && n >= 0)) return null;
    // Convert to absolute ticks (bars/beats are 1-based display)
    const beatsTotal = (bar - 1) * beatsPerBar + (beat - 1) + ticks / ppq;
    return Math.round(beatsTotal * ppq);
}

export type BeatGridLine = { tick: number; type: 'bar' | 'beat' };

// Return grid lines (bars and beats) for a tick window [startTick, endTick]
export function getBeatGridInTicks(
    startTick: number,
    endTick: number,
    ppq: number = DEFAULT_TICKS_PER_QUARTER,
    beatsPerBar: number = 4
): BeatGridLine[] {
    const s = Math.max(0, Math.min(startTick, endTick));
    const e = Math.max(0, Math.max(startTick, endTick));
    const lines: BeatGridLine[] = [];
    const startBeat = Math.floor(s / ppq);
    const endBeat = Math.ceil(e / ppq);
    for (let beatIndex = startBeat; beatIndex <= endBeat; beatIndex++) {
        const tick = beatIndex * ppq;
        const isBar = beatIndex % beatsPerBar === 0;
        if (tick >= s && tick <= e) {
            lines.push({ tick, type: isBar ? 'bar' : 'beat' });
        }
    }
    return lines;
}

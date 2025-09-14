// Musical Time Domain foundational types & utilities (Phase 5)
// Canonical representation is ticks (integer). Beats = ticks / PPQ. Bars aggregate beatsPerBar beats.

// Branded nominal types for clarity (compile-time only)
export type Tick = number & { readonly __brand: 'Tick' };
export type Beats = number & { readonly __brand: 'Beats' };
export type Seconds = number & { readonly __brand: 'Seconds' };

export interface BBT {
    bar: number; // 1-based
    beat: number; // 1-based
    tick: number; // 0-based within beat
}

/** Format a tick value as Bar.Beat.Tick (e.g. 5.1.0). */
export function formatTickAsBBT(tick: number, ticksPerQuarter: number, beatsPerBar: number): string {
    if (!isFinite(tick) || tick < 0) tick = 0;
    const beatsFloat = tick / ticksPerQuarter; // total beats from 0
    const barIndex = Math.floor(beatsFloat / beatsPerBar); // 0-based
    const beatInBarFloat = beatsFloat - barIndex * beatsPerBar;
    const beatIndex = Math.floor(beatInBarFloat); // 0-based
    const fractionalBeat = beatInBarFloat - beatIndex;
    const tickWithinBeat = Math.round(fractionalBeat * ticksPerQuarter);
    return `${barIndex + 1}.${beatIndex + 1}.${tickWithinBeat}`;
}

/** Parse a Bar.Beat.Tick string into ticks. Accepts variants: "5.2.120", "5:2:120", "5 2 120", "5.2" (tick=0), "5" (beat=1 tick=0). */
export function parseBBT(
    input: string,
    ticksPerQuarter: number,
    beatsPerBar: number
): { ticks: number; bbt: BBT } | null {
    if (!input) return null;
    const norm = input.trim().replace(/[^0-9.:\s]/g, '');
    const parts = norm.split(/[.:\s]+/).filter(Boolean);
    if (parts.length === 0) return null;
    const nums = parts.map((p) => parseInt(p, 10));
    if (nums.some((n) => !isFinite(n) || n < 0)) return null;
    let bar = nums[0];
    let beat = parts.length > 1 ? nums[1] : 1;
    let tick = parts.length > 2 ? nums[2] : 0;
    if (bar < 1) bar = 1;
    if (beat < 1) beat = 1;
    // clamp beat within bar range? allow overshoot -> later normalization
    if (tick < 0) tick = 0;
    // Normalize beat overflow into bars
    if (beat > beatsPerBar) {
        const extraBars = Math.floor((beat - 1) / beatsPerBar);
        bar += extraBars;
        beat = ((beat - 1) % beatsPerBar) + 1;
    }
    // Normalize tick overflow into beats
    if (tick >= ticksPerQuarter) {
        const extraBeats = Math.floor(tick / ticksPerQuarter);
        tick = tick % ticksPerQuarter;
        beat += extraBeats;
        if (beat > beatsPerBar) {
            const extraBars = Math.floor((beat - 1) / beatsPerBar);
            bar += extraBars;
            beat = ((beat - 1) % beatsPerBar) + 1;
        }
    }
    const totalBeats = (bar - 1) * beatsPerBar + (beat - 1) + tick / ticksPerQuarter;
    const ticks = Math.round(totalBeats * ticksPerQuarter) as Tick;
    return { ticks, bbt: { bar, beat, tick } };
}

/** Convert ticks to BBT components. */
export function ticksToBBT(ticks: number, ticksPerQuarter: number, beatsPerBar: number): BBT {
    if (!isFinite(ticks) || ticks < 0) ticks = 0;
    const beatsFloat = ticks / ticksPerQuarter;
    const barIndex = Math.floor(beatsFloat / beatsPerBar);
    const beatInBarFloat = beatsFloat - barIndex * beatsPerBar;
    const beatIndex = Math.floor(beatInBarFloat);
    const fractionalBeat = beatInBarFloat - beatIndex;
    const tickWithinBeat = Math.round(fractionalBeat * ticksPerQuarter);
    return { bar: barIndex + 1, beat: beatIndex + 1, tick: tickWithinBeat };
}

/** Format ticks using a customizable formatter function for zero padding if needed. */
export function formatTickAsBBTPadded(
    ticks: number,
    ticksPerQuarter: number,
    beatsPerBar: number,
    pad: (n: number) => string = (n) => n.toString()
): string {
    const b = ticksToBBT(ticks, ticksPerQuarter, beatsPerBar);
    return `${pad(b.bar)}.${pad(b.beat)}.${pad(b.tick)}`;
}
// (Note: Additional legacy helper block removed during Phase 5 consolidation.)

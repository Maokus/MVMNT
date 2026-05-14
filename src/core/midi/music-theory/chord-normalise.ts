/**
 * Preprocessing utilities for musicpy chord detection.
 * All functions are pure and operate on MIDI note numbers or pitch-class arrays.
 */

/**
 * Remove notes with identical pitch class, keeping the lowest MIDI note for each.
 * Returns MIDI notes sorted ascending by pitch.
 */
export function deduplicatePitchClasses(midiNotes: number[]): number[] {
    const pcToMidi = new Map<number, number>();
    for (const n of midiNotes) {
        const pc = ((n % 12) + 12) % 12;
        if (!pcToMidi.has(pc) || n < pcToMidi.get(pc)!) {
            pcToMidi.set(pc, n);
        }
    }
    return [...pcToMidi.values()].sort((a, b) => a - b);
}

/**
 * Compress a single interval into the [0, 15] detection window.
 * Values above 15 are folded down by octave until they fit.
 * Values below 0 are shifted up by octave.
 */
function compressToWindow(interval: number): number {
    while (interval < 0) interval += 12;
    while (interval > 15) interval -= 12;
    return interval;
}

/**
 * Compute a sorted, deduplicated interval array relative to root,
 * with all intervals compressed into [0, 15].
 *
 * Mirrors musicpy chord.standardize() + chord.inoctave():
 * 1. Compute raw intervals (each MIDI note minus rootMidi).
 * 2. Compress each interval to [0, 15].
 * 3. Drop zeros (octave-equivalent copies of root).
 * 4. Deduplicate and sort ascending.
 *
 * @param sortedMidi - MIDI notes sorted ascending, deduplicated by pitch class.
 * @param rootMidi   - The MIDI note of the chosen root.
 * @returns Sorted interval array (semitones above root, 1–15).
 */
export function standardize(sortedMidi: number[], rootMidi: number): number[] {
    const seen = new Set<number>();
    for (const n of sortedMidi) {
        const raw = n - rootMidi;
        const c = compressToWindow(raw);
        if (c !== 0) seen.add(c);
    }
    return [...seen].sort((a, b) => a - b);
}

/**
 * Return the detection key for a standardized interval array
 * (intervals joined with commas — matches DETECT_MAP keys).
 */
export function intervalKey(intervals: number[]): string {
    return intervals.join(',');
}

/**
 * Generate all inversions of a chord given its sorted interval array.
 * Each inversion cycles the current lowest note up by an octave
 * and re-standardizes relative to the new bass note.
 *
 * @param intervals - Sorted interval array from the root (e.g. [3, 7] for minor).
 * @returns Array of interval arrays, one per inversion (length = number of notes - 1).
 */
export function allInversions(intervals: number[]): number[][] {
    // Build full note list (root at 0, plus all intervals)
    const notes = [0, ...intervals];
    const result: number[][] = [];
    let current = notes.slice();

    for (let i = 0; i < notes.length - 1; i++) {
        // Cycle lowest note up an octave
        const lowest = current[0];
        current = [...current.slice(1), lowest + 12];

        // New root is now current[0]; compute intervals from it
        const newRoot = current[0];
        const invIntervals: number[] = [];
        const seen = new Set<number>();
        for (const n of current.slice(1)) {
            const interval = compressToWindow(n - newRoot);
            if (interval !== 0 && !seen.has(interval)) {
                seen.add(interval);
                invIntervals.push(interval);
            }
        }
        invIntervals.sort((a, b) => a - b);
        result.push(invIntervals);
    }

    return result;
}

/**
 * Return all voicings (permutations) of an interval set as alternative root candidates.
 * Only safe to call for n ≤ 6 notes. Returns deduplicated sets of interval arrays.
 *
 * Each permutation treats a different note as the root, computing intervals
 * relative to it. This is the brute-force fallback for `wholeDetect` mode.
 *
 * @param intervals - Sorted interval array from the root (≤ 5 elements recommended).
 */
export function allVoicings(intervals: number[]): number[][] {
    const notes = [0, ...intervals];
    if (notes.length > 6) {
        // Guard against combinatorial explosion — caller should check before calling
        return [intervals];
    }

    const seenKeys = new Set<string>();
    const result: number[][] = [];

    // Try each note as the potential root
    for (const root of notes) {
        const voicingIntervals: number[] = [];
        const seen = new Set<number>();
        for (const n of notes) {
            if (n === root) continue;
            const interval = compressToWindow(n - root);
            if (interval !== 0 && !seen.has(interval)) {
                seen.add(interval);
                voicingIntervals.push(interval);
            }
        }
        voicingIntervals.sort((a, b) => a - b);
        const key = voicingIntervals.join(',');
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            result.push(voicingIntervals);
        }
    }

    return result;
}

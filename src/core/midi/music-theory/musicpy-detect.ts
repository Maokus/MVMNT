import { CHORD_TYPES, CHORD_SYMBOL, DETECT_MAP, SEMITONE_TO_DEGREE } from './musicpy-chord-database';
import { deduplicatePitchClasses, standardize, intervalKey, allInversions, allVoicings } from './chord-normalise';

export type MusicpyChordResult = {
    root: number; // pitch class 0-11
    chordType: string; // canonical name e.g. "minor seventh"
    inversion: number; // 0 = root position, 1 = first inv, etc.
    bassNote: number | null; // pitch class of bass note if inverted, else null
    omits: string[]; // e.g. ["5"]
    alterations: string[]; // e.g. ["b5", "#9"]
    isPolychord: boolean;
    upperChord: MusicpyChordResult | null;
    lowerChord: MusicpyChordResult | null; // populated for 7+ note polychords (lower half chord)
    confidence: number; // 0-1
};

export type DetectOptions = {
    rootPreference?: boolean; // prefer bass note as root when multiple hits; default false
    similarityRatio?: number; // minimum similarity score for fallback; default 0.6
    originalFirstRatio?: number; // minimum score for original-order early return; default 0.86
    wholeDetect?: boolean; // try all voicing permutations; default true
    polyChordFirst?: boolean; // try polychord before main detection; default false
    originalFirst?: boolean; // return original-order result early if score high enough; default true
    changeFromFirst?: boolean; // allow altered-chord early return before inversions; default true
    sameNoteSpecial?: boolean; // force similarity=1 when pitch-class sets match exactly; default false
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const INTERVAL_NAMES: Record<number, string> = {
    1: 'b2',
    2: 'M2',
    3: 'm3',
    4: 'M3',
    5: 'P4',
    6: 'tritone',
    7: 'P5',
    8: 'm6',
    9: 'M6',
    10: 'm7',
    11: 'M7',
    12: 'P8',
};

/**
 * Dice coefficient: 2 * |intersection| / (|a| + |b|).
 * For sorted, deduplicated integer arrays this is equivalent to Python
 * SequenceMatcher.ratio() because matching blocks reduce to common elements.
 */
export function sequenceSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    let matches = 0;
    for (const v of b) {
        if (setA.has(v)) matches++;
    }
    return (2 * matches) / (a.length + b.length);
}

/**
 * Compress entry.intervals into the same [1, 15] window that standardize() produces,
 * so similarity comparisons are apples-to-apples.
 */
function compressedEntryIntervals(intervals: number[]): number[] {
    const seen = new Set<number>();
    for (const v of intervals) {
        let c = v;
        while (c > 15) c -= 12;
        if (c > 0) seen.add(c);
    }
    return [...seen].sort((a, b) => a - b);
}

function makeResult(
    overrides: Partial<MusicpyChordResult> & Pick<MusicpyChordResult, 'root' | 'chordType' | 'confidence'>
): MusicpyChordResult {
    return {
        inversion: 0,
        bassNote: null,
        omits: [],
        alterations: [],
        isPolychord: false,
        upperChord: null,
        lowerChord: null,
        ...overrides,
    };
}

// --- MUSICPY-LIKE CANDIDATE COMPARISON HELPERS ---

/** True if a and b contain the same values in the same order. */
function sameNotesOrdered(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

/** True if a and b contain the same values as sets (unordered). */
function samePitchClassSet(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const setA = new Set(a);
    return b.every((v) => setA.has(v));
}

/** True if every note in actual is present in candidate. */
function containsAllActualNotesInCandidate(actual: number[], candidate: number[]): boolean {
    const candSet = new Set(candidate);
    return actual.every((n) => candSet.has(n));
}

/**
 * True if actual can be obtained from candidate by moving each differing note
 * by exactly ±1 semitone (sorted index-wise, same length required).
 */
function changeFrom(actual: number[], candidate: number[]): boolean {
    if (actual.length !== candidate.length) return false;
    const sa = [...actual].sort((a, b) => a - b);
    const sc = [...candidate].sort((a, b) => a - b);
    return sa.every((a, i) => a === sc[i] || Math.abs(a - sc[i]) === 1);
}

/**
 * Returns the inversion index (0-based) if the first note of actual is found
 * inside candidate, otherwise 0.
 */
function inversionWay(actual: number[], candidate: number[]): number {
    if (actual.length === 0) return 0;
    const idx = candidate.indexOf(actual[0]);
    return idx >= 0 ? idx : 0;
}

/**
 * Bidirectional omit/alteration detection mirroring musicpy's candidate comparison.
 *
 * Both `actual` and `candidate` should be in the same compressed [1, 15] space.
 *
 * Priority order:
 *   1. actual ⊆ candidate  → pure omission (no alterations)
 *   2. same length + changeFrom → pure alteration (no omissions)
 *   3. mixed: greedy exact-then-±1 matching; unmatched actual notes are
 *      treated as extensions (unlabelled) rather than forced alterations.
 */
function computeOmitsAndAlterations(actual: number[], candidate: number[]): { omits: string[]; alterations: string[] } {
    // Case 1: actual ⊆ candidate → pure omission
    if (containsAllActualNotesInCandidate(actual, candidate)) {
        const actualSet = new Set(actual);
        const omits = candidate.filter((c) => !actualSet.has(c)).map((c) => SEMITONE_TO_DEGREE[c] ?? String(c));
        return { omits, alterations: [] };
    }

    // Case 2: same length, each difference ±1 → pure alteration
    if (actual.length === candidate.length && changeFrom(actual, candidate)) {
        const sa = [...actual].sort((a, b) => a - b);
        const sc = [...candidate].sort((a, b) => a - b);
        const alterations: string[] = [];
        for (let i = 0; i < sc.length; i++) {
            if (sa[i] !== sc[i]) {
                const expLabel = SEMITONE_TO_DEGREE[sc[i]];
                if (expLabel) {
                    const numeric = expLabel.replace(/^[b#]+/, '');
                    alterations.push((sa[i] < sc[i] ? 'b' : '#') + numeric);
                }
            }
        }
        return { omits: [], alterations };
    }

    // Case 3: mixed — greedy bidirectional matching
    // Each slot in candidate can be consumed at most once.
    const candUsed = new Array<boolean>(candidate.length).fill(false);
    const actMatched = new Set<number>();
    const alterations: string[] = [];

    // Pass 1: exact matches
    for (const act of actual) {
        const idx = candidate.findIndex((c, i) => !candUsed[i] && c === act);
        if (idx !== -1) {
            candUsed[idx] = true;
            actMatched.add(act);
        }
    }

    // Pass 2: ±1 alterations
    for (const act of actual) {
        if (actMatched.has(act)) continue;
        const idx = candidate.findIndex((c, i) => !candUsed[i] && Math.abs(act - c) === 1);
        if (idx !== -1) {
            const cand = candidate[idx];
            const expLabel = SEMITONE_TO_DEGREE[cand];
            if (expLabel) {
                const numeric = expLabel.replace(/^[b#]+/, '');
                alterations.push((act < cand ? 'b' : '#') + numeric);
            }
            candUsed[idx] = true;
            actMatched.add(act);
        }
        // Unmatched actual notes are extensions — not labelled as alterations
    }

    // Unmatched candidate notes are omitted
    const omits = candidate.filter((_, i) => !candUsed[i]).map((c) => SEMITONE_TO_DEGREE[c] ?? String(c));

    return { omits, alterations };
}

/**
 * Given a chord's root PC, bass PC, and root-position intervals, return the inversion index.
 * 0 = root position, 1 = first inversion (3rd in bass), 2 = second inversion (5th in bass), etc.
 */
function computeInversion(rootPC: number, bassPC: number, intervals: number[]): number {
    const bassOffset = (bassPC - rootPC + 12) % 12;
    const chordTones = [0, ...intervals];
    const idx = chordTones.indexOf(bassOffset);
    return idx >= 0 ? idx : 1;
}

function pcsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

/**
 * Detect a chord from a set of MIDI note numbers using the musicpy algorithm.
 *
 * Returns null for 0 notes.
 * Returns a single-note result (chordType = note name) for 1 note.
 * Returns an interval name result for 2 notes.
 */
export function detectMusicpy(midiNotes: number[], options: DetectOptions = {}): MusicpyChordResult | null {
    const {
        rootPreference = false,
        similarityRatio = 0.6,
        originalFirstRatio = 0.86,
        wholeDetect = true,
        polyChordFirst = false,
        originalFirst = true,
        changeFromFirst = true,
        sameNoteSpecial = false,
    } = options;

    if (midiNotes.length === 0) return null;

    // --- SPECIAL CASES ---

    if (midiNotes.length === 1) {
        const pc = ((midiNotes[0] % 12) + 12) % 12;
        return makeResult({ root: pc, chordType: NOTE_NAMES[pc], confidence: 1.0 });
    }

    if (midiNotes.length === 2) {
        const sorted = [...midiNotes].sort((a, b) => a - b);
        const interval = (((sorted[1] - sorted[0]) % 12) + 12) % 12;
        const bassPC = ((sorted[0] % 12) + 12) % 12;
        const name = INTERVAL_NAMES[interval] ?? `interval(${interval})`;
        return makeResult({ root: bassPC, chordType: name, confidence: 1.0 });
    }

    // --- DEDUPLICATE + BASS ---

    // Preserve original note order after deduplication — mirrors musicpy's note order.
    const deduplicated = deduplicatePitchClasses(midiNotes);
    // Sorted copy needed for bass detection and polychord splitting.
    const sortedDeduplicated = [...deduplicated].sort((a, b) => a - b);
    const bassPC = ((sortedDeduplicated[0] % 12) + 12) % 12;

    // --- POLYCHORD FIRST ---

    if (polyChordFirst && deduplicated.length >= 4) {
        const poly = tryPolychord(sortedDeduplicated, options);
        if (poly) return poly;
    }

    // --- ORIGINAL ORDER EXACT CHECK (Phase 2) ---
    // Separate early path for deduplicated[0] as root — gives confidence 1.0 regardless
    // of originalFirst flag, matching Python musicpy's "if similarity == 1, return original order".

    const origRootMidi = deduplicated[0];
    const origRootPC = ((origRootMidi % 12) + 12) % 12;
    const origIntervals = standardize(deduplicated, origRootMidi);
    const origKey = intervalKey(origIntervals);

    if (DETECT_MAP.has(origKey)) {
        const chordType = DETECT_MAP.get(origKey)!;
        const bassNote = origRootPC !== bassPC ? bassPC : null;
        const inversion = bassNote !== null ? computeInversion(origRootPC, bassPC, origIntervals) : 0;
        return makeResult({ root: origRootPC, chordType, inversion, bassNote, confidence: 1.0 });
    }

    // --- ORIGINAL ORDER SIMILARITY (Phase 2 + Phase 4) ---
    // Before trying inversions, check if original order is a close enough match to return early.

    if (originalFirst || changeFromFirst) {
        let bestOrigScore = 0;
        let bestOrigEntry: (typeof CHORD_TYPES)[0] | null = null;

        for (const entry of CHORD_TYPES) {
            const compExpected = compressedEntryIntervals(entry.intervals);
            const score = sequenceSimilarity(origIntervals, compExpected);
            if (score > bestOrigScore) {
                bestOrigScore = score;
                bestOrigEntry = entry;
            }
        }

        if (bestOrigEntry && bestOrigScore >= originalFirstRatio) {
            const compExpected = compressedEntryIntervals(bestOrigEntry.intervals);
            const { omits, alterations } = computeOmitsAndAlterations(origIntervals, compExpected);
            const bassNote = origRootPC !== bassPC ? bassPC : null;

            // Phase 2: clean match (no alterations) — return immediately
            if (originalFirst && alterations.length === 0) {
                return makeResult({
                    root: origRootPC,
                    chordType: bestOrigEntry.name,
                    bassNote,
                    omits,
                    confidence: bestOrigScore,
                });
            }

            // Phase 4: altered match — only return early when changeFromFirst is enabled
            if (changeFromFirst) {
                return makeResult({
                    root: origRootPC,
                    chordType: bestOrigEntry.name,
                    bassNote,
                    omits,
                    alterations,
                    confidence: bestOrigScore,
                });
            }
        }
    }

    // --- EXACT ROOT SEARCH ---

    interface ExactHit {
        root: number;
        chordType: string;
        intervals: number[];
    }

    const exactHits: ExactHit[] = [];

    for (const rootMidi of deduplicated) {
        const intervals = standardize(deduplicated, rootMidi);
        const key = intervalKey(intervals);
        if (DETECT_MAP.has(key)) {
            const rootPC = ((rootMidi % 12) + 12) % 12;
            exactHits.push({ root: rootPC, chordType: DETECT_MAP.get(key)!, intervals });
        }
    }

    if (wholeDetect && exactHits.length === 0) {
        const voicings = allVoicings(origIntervals);
        for (const { intervals: voicing, rootOffset } of voicings) {
            const key = intervalKey(voicing);
            if (DETECT_MAP.has(key)) {
                const voicingRootPC = (origRootPC + rootOffset) % 12;
                exactHits.push({ root: voicingRootPC, chordType: DETECT_MAP.get(key)!, intervals: voicing });
            }
        }
    }

    if (exactHits.length > 0) {
        let chosen = exactHits[0];
        if (rootPreference) {
            const bassMatch = exactHits.find((h) => h.root === bassPC);
            if (bassMatch) chosen = bassMatch;
        }
        const bassNote = chosen.root !== bassPC ? bassPC : null;
        const inversion = bassNote !== null ? computeInversion(chosen.root, bassPC, chosen.intervals) : 0;
        return makeResult({
            root: chosen.root,
            chordType: chosen.chordType,
            inversion,
            bassNote,
            confidence: 1.0,
        });
    }

    // --- INVERSION SEARCH ---

    interface InversionHit {
        root: number;
        chordType: string;
        inversion: number;
        bassNote: number;
        intervals: number[];
    }

    const inversionHits: InversionHit[] = [];

    for (const rootMidi of deduplicated) {
        const rootPC = ((rootMidi % 12) + 12) % 12;
        const baseIntervals = standardize(deduplicated, rootMidi);
        const inversions = allInversions(baseIntervals);

        for (let i = 0; i < inversions.length; i++) {
            const invKey = intervalKey(inversions[i]);
            if (DETECT_MAP.has(invKey)) {
                inversionHits.push({
                    root: rootPC,
                    chordType: DETECT_MAP.get(invKey)!,
                    inversion: i + 1,
                    bassNote: bassPC,
                    intervals: inversions[i],
                });
            }
        }
    }

    if (inversionHits.length > 0) {
        let chosen = inversionHits[0];
        if (rootPreference) {
            const bassMatch = inversionHits.find((h) => h.root === bassPC);
            if (bassMatch) chosen = bassMatch;
        }
        return makeResult({
            root: chosen.root,
            chordType: chosen.chordType,
            inversion: chosen.inversion,
            bassNote: chosen.bassNote,
            confidence: 0.95,
        });
    }

    // --- SIMILARITY FALLBACK (Phase 6: compare against compressed expected intervals) ---

    interface SimilarityCandidate {
        root: number;
        chordType: string;
        score: number;
        intervals: number[];
        expectedIntervals: number[];
    }

    const candidates: SimilarityCandidate[] = [];
    // Precompute input pitch-class set once for sameNoteSpecial scoring.
    const inputPCsForSameNote = sameNoteSpecial ? new Set(deduplicated.map((m) => ((m % 12) + 12) % 12)) : null;

    for (const rootMidi of deduplicated) {
        const rootPC = ((rootMidi % 12) + 12) % 12;
        const intervals = standardize(deduplicated, rootMidi);

        for (const entry of CHORD_TYPES) {
            const compExpected = compressedEntryIntervals(entry.intervals);
            let score = sequenceSimilarity(intervals, compExpected);

            // sameNoteSpecial: if pitch-class sets match exactly, elevate score to 1.0
            // rather than returning early — keeps all candidates in the ranking pass.
            if (inputPCsForSameNote && score < 1.0) {
                const chordPCs = new Set<number>([rootPC]);
                for (const iv of entry.intervals) chordPCs.add((rootPC + iv) % 12);
                if (pcsEqual(inputPCsForSameNote, chordPCs)) score = 1.0;
            }

            if (score >= similarityRatio) {
                candidates.push({
                    root: rootPC,
                    chordType: entry.name,
                    score,
                    intervals,
                    expectedIntervals: compExpected,
                });
            }
        }
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const aExtra = computeOmitsAndAlterations(a.intervals, a.expectedIntervals);
            const bExtra = computeOmitsAndAlterations(b.intervals, b.expectedIntervals);
            const aCost = aExtra.omits.length + aExtra.alterations.length;
            const bCost = bExtra.omits.length + bExtra.alterations.length;
            return aCost - bCost;
        });

        const best = candidates[0];
        let chosen = best;

        if (rootPreference) {
            const bassMatch = candidates.find((c) => c.root === bassPC && c.score >= best.score - 0.05);
            if (bassMatch) chosen = bassMatch;
        }

        const { omits, alterations } = computeOmitsAndAlterations(chosen.intervals, chosen.expectedIntervals);
        const bassNote = chosen.root !== bassPC ? bassPC : null;

        return makeResult({
            root: chosen.root,
            chordType: chosen.chordType,
            inversion: 0,
            bassNote,
            omits,
            alterations,
            confidence: chosen.score,
        });
    }

    // --- POLYCHORD SPLIT ---

    if (!polyChordFirst && deduplicated.length >= 4) {
        const poly = tryPolychord(sortedDeduplicated, options);
        if (poly) return poly;
    }

    return null;
}

function tryPolychord(sortedDeduplicated: number[], options: DetectOptions): MusicpyChordResult | null {
    const n = sortedDeduplicated.length;
    const bassPC = ((sortedDeduplicated[0] % 12) + 12) % 12;

    // 4–6 notes → single bass note (lower) + upper chord.
    // 7+ notes  → split into two halves, both detected as full chords.
    const splitHalf = n >= 7;
    const lower = splitHalf ? sortedDeduplicated.slice(0, Math.floor(n / 2)) : sortedDeduplicated.slice(0, 1);
    const upper = splitHalf ? sortedDeduplicated.slice(Math.floor(n / 2)) : sortedDeduplicated.slice(1);

    const subOpts: DetectOptions = { ...options, polyChordFirst: false };
    const lowerResult = detectMusicpy(lower, subOpts);
    const upperResult = detectMusicpy(upper, subOpts);

    if (
        lowerResult &&
        upperResult &&
        lowerResult.confidence >= 0.9 &&
        upperResult.confidence >= 0.9 &&
        !lowerResult.isPolychord &&
        !upperResult.isPolychord
    ) {
        return makeResult({
            root: lowerResult.root,
            chordType: `${upperResult.root}/${lowerResult.root}`,
            isPolychord: true,
            upperChord: upperResult,
            lowerChord: splitHalf ? lowerResult : null,
            bassNote: bassPC,
            confidence: 0.7,
        });
    }

    return null;
}

/**
 * Format a MusicpyChordResult into a musicpy-style chord name string.
 *
 * Examples: "C", "Am7", "C/E", "Cmaj7(omit 5)", "C7#9", "Em/C"
 */
export function formatResult(result: MusicpyChordResult): string {
    if (result.isPolychord && result.upperChord) {
        if (result.lowerChord) {
            // 7+ notes: both halves are full chords
            return `${formatResult(result.upperChord)}/${formatResult(result.lowerChord)}`;
        }
        // 4–6 notes: upper chord over a single bass root
        return `${formatResult(result.upperChord)}/${NOTE_NAMES[result.root]}`;
    }

    const rootName = NOTE_NAMES[result.root];

    // Single-note or interval result — chordType is already the full label.
    if (!(result.chordType in CHORD_SYMBOL)) {
        const bassStr = result.bassNote !== null ? `/${NOTE_NAMES[result.bassNote]}` : '';
        return result.chordType + bassStr;
    }

    const symbol = CHORD_SYMBOL[result.chordType];
    const alts = result.alterations.join('');
    const omitStr = result.omits.length > 0 ? `(omit ${result.omits.join(' ')})` : '';
    const bassStr = result.bassNote !== null ? `/${NOTE_NAMES[result.bassNote]}` : '';

    return `${rootName}${symbol}${alts}${omitStr}${bassStr}`;
}

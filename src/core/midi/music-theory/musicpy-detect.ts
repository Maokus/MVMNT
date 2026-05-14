import { CHORD_TYPES, DETECT_MAP, SEMITONE_TO_DEGREE } from './musicpy-chord-database';
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
    confidence: number; // 0-1
};

export type DetectOptions = {
    preferBassRoot?: boolean; // default true
    similarityThreshold?: number; // default 0.6
    wholeDetect?: boolean; // try all voicing permutations, default false
    polyChordFirst?: boolean; // default false
    originalFirst?: boolean;
    changeFromFirst?: boolean;
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
 * Compute 2*|intersection| / (|a| + |b|) — mirrors Python SequenceMatcher.ratio()
 * for short sorted integer arrays (which is what musicpy uses in find_similarity).
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
        ...overrides,
    };
}

function computeOmitsAndAlterations(actual: number[], expected: number[]): { omits: string[]; alterations: string[] } {
    const omits: string[] = [];
    const alterations: string[] = [];
    const actualSet = new Set(actual);

    for (const exp of expected) {
        if (!actualSet.has(exp)) {
            // Check if a note 1 semitone away is present (alteration)
            if (actualSet.has(exp - 1) || actualSet.has(exp + 1)) {
                const alt = actualSet.has(exp - 1) ? exp - 1 : exp + 1;
                const label = SEMITONE_TO_DEGREE[alt] ?? String(alt);
                alterations.push(label);
            } else {
                const label = SEMITONE_TO_DEGREE[exp] ?? String(exp);
                omits.push(label);
            }
        }
    }

    return { omits, alterations };
}

/**
 * Given a chord's root PC, bass PC, and root-position intervals, return the inversion index.
 * 0 = root position, 1 = first inversion (3rd in bass), 2 = second inversion (5th in bass), etc.
 */
function computeInversion(rootPC: number, bassPC: number, intervals: number[]): number {
    const bassOffset = (bassPC - rootPC + 12) % 12;
    // chord tones in ascending order from root: 0, intervals[0], intervals[1], ...
    const chordTones = [0, ...intervals];
    const idx = chordTones.indexOf(bassOffset);
    return idx >= 0 ? idx : 1; // default to 1 if not found exactly (e.g. compressed interval)
}

/**
 * Detect a chord from a set of MIDI note numbers using the musicpy algorithm.
 *
 * Returns null for 0 notes.
 * Returns a single-note result (chordType = note name) for 1 note.
 * Returns an interval name result for 2 notes.
 */
export function detectMusicpy(midiNotes: number[], options: DetectOptions = {}): MusicpyChordResult | null {
    const { preferBassRoot = true, similarityThreshold = 0.6, wholeDetect = false, polyChordFirst = false } = options;

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

    const deduplicated = deduplicatePitchClasses(midiNotes);
    const bassPC = ((deduplicated[0] % 12) + 12) % 12;

    // Pitch classes only (mod 12), keeping uniqueness from deduplicatePitchClasses
    const pcs = deduplicated.map((n) => ((n % 12) + 12) % 12);

    // --- POLYCHORD FIRST ---

    if (polyChordFirst && deduplicated.length >= 5) {
        const poly = tryPolychord(deduplicated, options);
        if (poly) return poly;
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
        // Try all voicings (different root permutations) for the first midi note set
        const rootMidi = deduplicated[0];
        const baseIntervals = standardize(deduplicated, rootMidi);
        const voicings = allVoicings(baseIntervals);
        for (const voicing of voicings) {
            const key = intervalKey(voicing);
            if (DETECT_MAP.has(key)) {
                const rootPC = ((rootMidi % 12) + 12) % 12;
                exactHits.push({ root: rootPC, chordType: DETECT_MAP.get(key)!, intervals: voicing });
            }
        }
    }

    if (exactHits.length > 0) {
        let chosen = exactHits[0];
        if (preferBassRoot) {
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
        if (preferBassRoot) {
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

    // --- SIMILARITY FALLBACK ---

    // Compute intervals from each possible root and pick the best similarity
    interface SimilarityCandidate {
        root: number;
        chordType: string;
        score: number;
        intervals: number[];
        expectedIntervals: number[];
    }

    const candidates: SimilarityCandidate[] = [];

    for (const rootMidi of deduplicated) {
        const rootPC = ((rootMidi % 12) + 12) % 12;
        const intervals = standardize(deduplicated, rootMidi);

        for (const entry of CHORD_TYPES) {
            const score = sequenceSimilarity(intervals, entry.intervals);
            if (score >= similarityThreshold) {
                candidates.push({
                    root: rootPC,
                    chordType: entry.name,
                    score,
                    intervals,
                    expectedIntervals: entry.intervals,
                });
            }
        }
    }

    if (candidates.length > 0) {
        // Sort: prefer higher score, then fewer omits+alterations
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

        if (preferBassRoot) {
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

    if (!polyChordFirst && deduplicated.length >= 5) {
        const poly = tryPolychord(deduplicated, options);
        if (poly) return poly;
    }

    return null;
}

function tryPolychord(deduplicated: number[], options: DetectOptions): MusicpyChordResult | null {
    const n = deduplicated.length;
    const bassPC = ((deduplicated[0] % 12) + 12) % 12;

    // Try all splits into lower/upper groups
    for (let splitAt = 2; splitAt <= n - 2; splitAt++) {
        const lower = deduplicated.slice(0, splitAt);
        const upper = deduplicated.slice(splitAt);

        const lowerOpts: DetectOptions = { ...options, polyChordFirst: false };
        const upperOpts: DetectOptions = { ...options, polyChordFirst: false };

        const lowerResult = detectMusicpy(lower, lowerOpts);
        const upperResult = detectMusicpy(upper, upperOpts);

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
                bassNote: bassPC,
                confidence: 0.7,
            });
        }
    }

    return null;
}

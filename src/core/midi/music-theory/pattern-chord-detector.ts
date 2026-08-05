import type { ChordEstimatorOptions, ChordQuality, EstimatedChord } from './chord-estimator';

/**
 * Interval-pattern chord detector.
 *
 * This is an independent TypeScript implementation of the pattern-scoring
 * approach and parameters documented by Long Kelvin's MIT-licensed MIDI Chord Detector
 * (https://github.com/LongKelvin/midi-chord-detector-plugin): test each root,
 * require defining tones, tolerate optional tones and penalise unrelated ones.
 */
type ChordPattern = {
    type: string;
    symbol: string;
    quality: ChordQuality;
    intervals: readonly number[];
    required: readonly number[];
    optional?: readonly number[];
    important: readonly number[];
    baseScore: number;
};

export type PatternChordResult = {
    chord: EstimatedChord;
    chordType: string;
    symbol: string;
    isRootless: boolean;
    score: number;
    matchedIntervals: number[];
    missingIntervals: number[];
    extraIntervals: number[];
    voicingType: 'close' | 'open' | 'drop2' | 'drop3' | 'rootless';
    alternatives: PatternChordAlternative[];
};

export type PatternChordAlternative = {
    root: number;
    chordType: string;
    symbol: string;
    score: number;
    unexplainedToneCount: number;
    definingToneCoverage: number;
    bassEvidence: number;
    complexity: number;
};

const pattern = (
    type: string,
    symbol: string,
    quality: ChordQuality,
    intervals: readonly number[],
    required: readonly number[],
    important: readonly number[],
    baseScore: number,
    optional: readonly number[] = []
): ChordPattern => ({ type, symbol, quality, intervals, required, important, baseScore, optional });

// Chord tones above the octave retain their degree identity (9, 11, 13).
const PATTERNS: readonly ChordPattern[] = [
    pattern('major', '', 'maj', [0, 4, 7], [0, 4, 7], [4, 7], 100),
    pattern('minor', 'm', 'min', [0, 3, 7], [0, 3, 7], [3, 7], 100),
    pattern('diminished', 'dim', 'dim', [0, 3, 6], [0, 3, 6], [3, 6], 100),
    pattern('augmented', 'aug', 'aug', [0, 4, 8], [0, 4, 8], [4, 8], 100),
    pattern('sus2', 'sus2', 'sus2', [0, 2, 7], [0, 2, 7], [2, 7], 95),
    pattern('sus4', 'sus4', 'sus4', [0, 5, 7], [0, 5, 7], [5, 7], 95),
    pattern('power5', '5', 'ext', [0, 7], [0, 7], [7], 80),
    pattern('major7', 'maj7', 'maj7', [0, 4, 7, 11], [0, 4, 11], [4, 11], 115, [7]),
    pattern('minor7', 'm7', 'min7', [0, 3, 7, 10], [0, 3, 10], [3, 10], 115, [7]),
    pattern('dominant7', '7', '7', [0, 4, 7, 10], [0, 4, 10], [4, 10], 115, [7]),
    pattern('diminished7', 'dim7', 'dim7', [0, 3, 6, 9], [0, 3, 6, 9], [3, 6, 9], 115),
    pattern('half-diminished7', 'm7♭5', 'm7b5', [0, 3, 6, 10], [0, 3, 6, 10], [3, 6, 10], 115),
    pattern('augmented7', 'aug7', 'aug', [0, 4, 8, 10], [0, 4, 8, 10], [4, 8, 10], 110),
    pattern('augmented-major7', '+maj7', 'aug', [0, 4, 8, 11], [0, 4, 8, 11], [4, 8, 11], 110),
    pattern('minor-major7', 'm(maj7)', 'min7', [0, 3, 7, 11], [0, 3, 11], [3, 11], 110, [7]),
    pattern('7sus4', '7sus4', 'sus4', [0, 5, 7, 10], [0, 5, 10], [5, 10], 108, [7]),
    pattern('major6', '6', 'ext', [0, 4, 7, 9], [0, 4, 9], [4, 9], 105, [7]),
    pattern('minor6', 'm6', 'ext', [0, 3, 7, 9], [0, 3, 9], [3, 9], 105, [7]),
    pattern('6/9', '6/9', 'ext', [0, 4, 7, 9, 14], [0, 4, 9, 14], [4, 9, 14], 110, [7]),
    pattern('minor6/9', 'm6/9', 'ext', [0, 3, 7, 9, 14], [0, 3, 9, 14], [3, 9, 14], 110, [7]),
    pattern('major9', 'maj9', 'ext', [0, 4, 7, 11, 14], [0, 4, 11, 14], [4, 11, 14], 125, [7]),
    pattern('minor9', 'm9', 'ext', [0, 3, 7, 10, 14], [0, 3, 10, 14], [3, 10, 14], 125, [7]),
    pattern('dominant9', '9', 'ext', [0, 4, 7, 10, 14], [0, 4, 10, 14], [4, 10, 14], 125, [7]),
    pattern('dominant7b9', '7♭9', 'ext', [0, 4, 7, 10, 13], [0, 4, 10, 13], [4, 10, 13], 120, [7]),
    pattern('dominant7#9', '7♯9', 'ext', [0, 4, 7, 10, 15], [0, 4, 10, 15], [4, 10, 15], 120, [7]),
    pattern('minor-major9', 'm(maj9)', 'ext', [0, 3, 7, 11, 14], [0, 3, 11, 14], [3, 11, 14], 120, [7]),
    pattern('major11', 'maj11', 'ext', [0, 4, 7, 11, 14, 17], [0, 4, 11, 14, 17], [4, 11, 14, 17], 130, [7]),
    pattern('minor11', 'm11', 'ext', [0, 3, 7, 10, 14, 17], [0, 3, 10, 14, 17], [3, 10, 14, 17], 130, [7]),
    pattern('dominant11', '11', 'ext', [0, 4, 7, 10, 14, 17], [0, 4, 10, 14, 17], [4, 10, 14, 17], 130, [7]),
    pattern('major7#11', 'maj7♯11', 'ext', [0, 4, 7, 11, 18], [0, 4, 11, 18], [4, 11, 18], 125, [7]),
    pattern('dominant7#11', '7♯11', 'ext', [0, 4, 7, 10, 18], [0, 4, 10, 18], [4, 10, 18], 125, [7]),
    pattern('major9#11', 'maj9♯11', 'ext', [0, 4, 7, 11, 14, 18], [0, 4, 11, 14, 18], [4, 11, 14, 18], 130, [7]),
    pattern('minor11b5', 'm11♭5', 'ext', [0, 3, 6, 10, 14, 17], [0, 3, 6, 10, 14, 17], [3, 6, 10, 14, 17], 125),
    pattern('major13', 'maj13', 'ext', [0, 4, 7, 11, 14, 21], [0, 4, 11, 21], [4, 11, 21], 135, [7, 14]),
    pattern('minor13', 'm13', 'ext', [0, 3, 7, 10, 14, 21], [0, 3, 10, 21], [3, 10, 21], 135, [7, 14]),
    pattern('dominant13', '13', 'ext', [0, 4, 7, 10, 14, 21], [0, 4, 10, 21], [4, 10, 21], 135, [7, 14]),
    pattern('dominant13#11', '13♯11', 'ext', [0, 4, 7, 10, 18, 21], [0, 4, 10, 18, 21], [4, 10, 18, 21], 135, [7]),
    pattern('dominant7b13', '7♭13', 'ext', [0, 4, 7, 10, 20], [0, 4, 10, 20], [4, 10, 20], 125, [7]),
    pattern('dominant13b9', '13♭9', 'ext', [0, 4, 7, 10, 13, 21], [0, 4, 10, 13, 21], [4, 10, 13, 21], 130, [7]),
    pattern('dominant13#9', '13♯9', 'ext', [0, 4, 7, 10, 15, 21], [0, 4, 10, 15, 21], [4, 10, 15, 21], 130, [7]),
    pattern('dominant7b5', '7♭5', 'ext', [0, 4, 6, 10], [0, 4, 6, 10], [4, 6, 10], 118),
    pattern('dominant7#5', '7♯5', 'ext', [0, 4, 8, 10], [0, 4, 8, 10], [4, 8, 10], 118),
    pattern('dominant7b5b9', '7♭5♭9', 'ext', [0, 4, 6, 10, 13], [0, 4, 6, 10, 13], [4, 6, 10, 13], 122),
    pattern('dominant7#5b9', '7♯5♭9', 'ext', [0, 4, 8, 10, 13], [0, 4, 8, 10, 13], [4, 8, 10, 13], 122),
    pattern('dominant7b5#9', '7♭5♯9', 'ext', [0, 4, 6, 10, 15], [0, 4, 6, 10, 15], [4, 6, 10, 15], 122),
    pattern('dominant7#5#9', '7♯5♯9', 'ext', [0, 4, 8, 10, 15], [0, 4, 8, 10, 15], [4, 8, 10, 15], 122),
    pattern('altered', '7alt', 'ext', [0, 4, 6, 10, 13], [0, 4, 10], [4, 10], 120, [6, 8, 13, 15]),
    pattern(
        'dominant7#5#9b13',
        '7♯5♯9♭13',
        'ext',
        [0, 4, 8, 10, 15, 20],
        [0, 4, 8, 10, 15, 20],
        [4, 8, 10, 15, 20],
        128
    ),
    pattern('dominant9#11', '9♯11', 'ext', [0, 4, 7, 10, 14, 18], [0, 4, 10, 14, 18], [4, 10, 14, 18], 130, [7]),
    pattern('dominant9b13', '9♭13', 'ext', [0, 4, 7, 10, 14, 20], [0, 4, 10, 14, 20], [4, 10, 14, 20], 130, [7]),
    pattern('dominant7#9#11', '7♯9♯11', 'ext', [0, 4, 7, 10, 15, 18], [0, 4, 10, 15, 18], [4, 10, 15, 18], 128, [7]),
    pattern('dominant7b9#11', '7♭9♯11', 'ext', [0, 4, 7, 10, 13, 18], [0, 4, 10, 13, 18], [4, 10, 13, 18], 128, [7]),
    pattern('dominant7b9b13', '7♭9♭13', 'ext', [0, 4, 7, 10, 13, 20], [0, 4, 10, 13, 20], [4, 10, 13, 20], 128, [7]),
    pattern('dominant7#9b13', '7♯9♭13', 'ext', [0, 4, 7, 10, 15, 20], [0, 4, 10, 15, 20], [4, 10, 15, 20], 128, [7]),
    pattern('add9', 'add9', 'ext', [0, 4, 7, 14], [0, 4, 7, 14], [4, 7, 14], 105),
    pattern('minor-add9', 'm(add9)', 'ext', [0, 3, 7, 14], [0, 3, 7, 14], [3, 7, 14], 105),
    pattern('add11', 'add11', 'ext', [0, 4, 7, 17], [0, 4, 7, 17], [4, 7, 17], 100),
    pattern('add#11', 'add♯11', 'ext', [0, 4, 7, 18], [0, 4, 7, 18], [4, 7, 18], 100),
    pattern('major7#5', 'maj7♯5', 'aug', [0, 4, 8, 11], [0, 4, 8, 11], [4, 8, 11], 115),
    pattern('minor7b5', 'm7♭5', 'm7b5', [0, 3, 6, 10], [0, 3, 6, 10], [3, 6, 10], 115),
    pattern('quartal', 'quartal', 'ext', [0, 5, 10], [0, 5, 10], [5, 10], 90),
    pattern('quartal-7', 'quartal7', 'ext', [0, 5, 10, 15], [0, 5, 10, 15], [5, 10, 15], 95),
];
const PATTERNS_BY_TYPE = [...PATTERNS].sort((left, right) => left.type.localeCompare(right.type));

type Candidate = {
    pattern: ChordPattern;
    root: number;
    score: number;
    rootless: boolean;
    exact: boolean;
    intervals: number[];
    unexplainedToneCount: number;
    definingToneCoverage: number;
    bassEvidence: number;
};

// Reference detector scoring parameters (ChordScoring.cpp / ChordTypes.h).
const SCORE = {
    exactMatch: 150,
    requiredTone: 30,
    optionalTone: 10,
    rootInBass: 25,
    importantTone: 30,
    matchRatio: 80,
    extraTonePenalty: 4,
    rootlessVoicing: 10,
    closeVoicing: 5,
    missingRootPenalty: 40,
    noThirdOrSuspensionPenalty: 25,
    minimumCandidate: 80,
    confidenceMarginScale: 100,
    confidenceAbsoluteScale: 250,
    confidenceNoteCount: 6,
} as const;

function pitchClass(note: number): number {
    return ((note % 12) + 12) % 12;
}

function uniqueSorted(values: readonly number[]): number[] {
    return [...new Set(values)].sort((a, b) => a - b);
}

function intervalsFor(root: number, pitchClasses: readonly number[], expand: boolean): number[] {
    const intervals = pitchClasses.flatMap((pc) => {
        const interval = (pc - root + 12) % 12;
        return expand && interval !== 0 ? [interval, interval + 12] : [interval];
    });
    return uniqueSorted(intervals);
}

function sameIntervals(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((interval, index) => interval === right[index]);
}

function isAllowed(patternToCheck: ChordPattern, options: ChordEstimatorOptions): boolean {
    if (options.includeTriads === false && ['major', 'minor', 'sus2', 'sus4', 'power5'].includes(patternToCheck.type))
        return false;
    if (options.includeDiminished === false && ['dim', 'dim7', 'm7b5'].includes(patternToCheck.quality)) return false;
    if (options.includeAugmented === false && patternToCheck.quality === 'aug') return false;
    if (
        options.includeSevenths === false &&
        patternToCheck.intervals.some((interval) => interval === 10 || interval === 11)
    )
        return false;
    return true;
}

function classifyVoicing(midiNotes: readonly number[]): 'close' | 'open' | 'drop2' | 'drop3' | 'rootless' {
    const span = midiNotes[midiNotes.length - 1] - midiNotes[0];
    if (span <= 12) return 'close';
    if (midiNotes.length >= 4 && midiNotes[1] - midiNotes[0] > 7) return 'drop2';
    if (midiNotes.length >= 4 && midiNotes[2] - midiNotes[1] > 7) return 'drop3';
    return 'open';
}

function scorePattern(
    intervals: readonly number[],
    patternToScore: ChordPattern,
    bassPc: number,
    root: number,
    voicing: 'close' | 'open' | 'drop2' | 'drop3' | 'rootless',
    preferBassRoot: boolean
): Candidate | undefined {
    const intervalSet = new Set(intervals);
    const patternSet = new Set(patternToScore.intervals);
    const hasRequired = patternToScore.required.every((interval) => intervalSet.has(interval));
    if (!hasRequired) return undefined;

    const exact =
        intervalSet.size === patternSet.size && [...intervalSet].every((interval) => patternSet.has(interval));
    const matched = intervals.filter((interval) => patternSet.has(interval)).length;
    const important = intervals.filter((interval) => patternToScore.important.includes(interval)).length;
    const optional = intervals.filter((interval) => patternToScore.optional?.includes(interval)).length;
    const extras = intervals.filter(
        (interval) => !patternSet.has(interval) && !patternToScore.optional?.includes(interval)
    ).length;

    let score = patternToScore.baseScore;
    if (exact) score += SCORE.exactMatch;
    score += patternToScore.required.length * SCORE.requiredTone;
    score += important * SCORE.importantTone;
    score += optional * SCORE.optionalTone;
    score += (matched / patternToScore.intervals.length) * SCORE.matchRatio;
    score -= extras * SCORE.extraTonePenalty;
    const bassEvidence = bassPc === root ? 2 : patternSet.has((bassPc - root + 12) % 12) ? 1 : 0;
    if (preferBassRoot && bassEvidence === 2) score += SCORE.rootInBass;
    if (voicing === 'rootless') score += SCORE.rootlessVoicing;
    else if (voicing === 'close') score += SCORE.closeVoicing;
    if (!intervalSet.has(0) && voicing !== 'rootless') score -= SCORE.missingRootPenalty;
    if (!intervals.some((interval) => [2, 3, 4, 5].includes(interval))) score -= SCORE.noThirdOrSuspensionPenalty;
    return {
        pattern: patternToScore,
        root,
        score,
        rootless: voicing === 'rootless',
        exact,
        intervals: [...intervals],
        unexplainedToneCount: extras,
        definingToneCoverage: important / Math.max(1, patternToScore.important.length),
        bassEvidence,
    };
}

function confidenceFor(best: Candidate, secondBest: Candidate | undefined, noteCount: number): number {
    const margin = Math.max(0, best.score - (secondBest?.score ?? 0));
    const marginConfidence = Math.min(margin / SCORE.confidenceMarginScale, 1);
    const absoluteConfidence = Math.min(best.score / SCORE.confidenceAbsoluteScale, 1);
    const noteConfidence = Math.min(noteCount / SCORE.confidenceNoteCount, 1);
    return 0.35 * marginConfidence + 0.25 * absoluteConfidence + 0.15 * noteConfidence + 0.25 * (best.exact ? 1 : 0.5);
}

/** Detect a chord by scoring interval patterns for every played and virtual root. */
export function detectPatternChord(
    midiNotes: readonly number[],
    bassPc?: number,
    options: ChordEstimatorOptions & { previousChordKey?: string } = {}
): PatternChordResult | undefined {
    if (midiNotes.length < 2) return undefined;
    const sortedNotes = [...new Set(midiNotes)].sort((a, b) => a - b);
    const pcs = uniqueSorted(sortedNotes.map(pitchClass));
    if (pcs.length < 2) return undefined;
    const bass = bassPc ?? pitchClass(sortedNotes[0]);
    const expand = sortedNotes.length > 3;
    const voicing = classifyVoicing(sortedNotes);
    const candidates: Candidate[] = [];
    // The reference detector visits played roots first, then absent virtual roots.
    // Its map-backed pattern store is lexicographically ordered by pattern name.
    const roots = [...pcs, ...Array.from({ length: 12 }, (_, root) => root).filter((root) => !pcs.includes(root))];

    for (const root of roots) {
        const rootless = !pcs.includes(root);
        const intervals = intervalsFor(root, pcs, expand);
        const exactPatterns = PATTERNS_BY_TYPE.filter((candidatePattern) =>
            sameIntervals(intervals, candidatePattern.intervals)
        );
        for (const candidatePattern of exactPatterns.length > 0 ? exactPatterns : PATTERNS_BY_TYPE) {
            if (!isAllowed(candidatePattern, options)) continue;
            const candidate = scorePattern(
                intervals,
                candidatePattern,
                bass,
                root,
                rootless ? 'rootless' : voicing,
                options.preferBassRoot ?? true
            );
            if (candidate && candidate.score > SCORE.minimumCandidate) candidates.push(candidate);
        }
    }
    if (candidates.length === 0) return undefined;

    candidates.sort((left, right) => {
        if (left.unexplainedToneCount !== right.unexplainedToneCount)
            return left.unexplainedToneCount - right.unexplainedToneCount;
        if (left.definingToneCoverage !== right.definingToneCoverage)
            return right.definingToneCoverage - left.definingToneCoverage;
        if (left.bassEvidence !== right.bassEvidence) return right.bassEvidence - left.bassEvidence;
        const leftContinuity = `${left.root}:${left.pattern.type}` === options.previousChordKey ? 1 : 0;
        const rightContinuity = `${right.root}:${right.pattern.type}` === options.previousChordKey ? 1 : 0;
        if (leftContinuity !== rightContinuity) return rightContinuity - leftContinuity;
        if (left.pattern.intervals.length !== right.pattern.intervals.length)
            return right.pattern.intervals.length - left.pattern.intervals.length;
        if (left.score !== right.score) return right.score - left.score;
        if (left.root !== right.root) return left.root - right.root;
        return left.pattern.type.localeCompare(right.pattern.type);
    });
    let best = candidates[0];
    const secondBest = candidates[1];

    // C6 and Am7 have the same pitch classes. The bass provides the most useful
    // signal; without it, retain the higher-priority major-sixth interpretation.
    const topCandidates = candidates.slice(0, 3);
    const second = topCandidates[1];
    if (second && best.score - second.score <= 40) {
        const types = new Set([best.pattern.type, second.pattern.type]);
        if (types.has('major6') && types.has('minor7')) {
            if (second.root === bass) best = second;
            else if (best.root !== bass) best = best.pattern.type === 'major6' ? best : second;
        } else if (best.pattern.type === 'diminished7' && second.pattern.type === 'diminished7') {
            if (second.root === bass) best = second;
        } else if (
            types.has('minor6') &&
            types.has('minor') &&
            second.pattern.type === 'minor6' &&
            second.root === bass
        ) {
            best = second;
        }
    }

    const confidence = confidenceFor(best, secondBest, sortedNotes.length);
    return {
        chord: {
            root: best.root,
            quality: best.pattern.quality,
            bassPc: bass,
            confidence,
        },
        chordType: best.pattern.type,
        symbol: best.pattern.symbol,
        isRootless: best.rootless,
        score: best.score,
        matchedIntervals: best.intervals.filter((interval) => best.pattern.intervals.includes(interval)),
        missingIntervals: best.pattern.intervals.filter((interval) => !best.intervals.includes(interval)),
        extraIntervals: best.intervals.filter((interval) => !best.pattern.intervals.includes(interval)),
        voicingType: best.rootless ? 'rootless' : voicing,
        alternatives: candidates.slice(1, 4).map((candidate) => ({
            root: candidate.root,
            chordType: candidate.pattern.type,
            symbol: candidate.pattern.symbol,
            score: candidate.score,
            unexplainedToneCount: candidate.unexplainedToneCount,
            definingToneCoverage: candidate.definingToneCoverage,
            bassEvidence: candidate.bassEvidence,
            complexity: candidate.pattern.intervals.length,
        })),
    };
}

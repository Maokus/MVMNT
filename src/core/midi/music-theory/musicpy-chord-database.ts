// Semitone interval constants (values from musicpy database.py)
const M2 = 2,
    m3 = 3,
    M3 = 4,
    P4 = 5,
    d5 = 6,
    P5 = 7,
    A5 = 8,
    M6 = 9,
    m7 = 10,
    M7 = 11,
    P8 = 12,
    M9 = 14,
    P11 = 17,
    A11 = 18,
    M13 = 21;

// d7 (diminished seventh) = 9 semitones (enharmonic with M6)
const d7 = 9;
// A6 (augmented sixth) = 10 semitones (enharmonic with m7)
const A6 = 10;

export type ChordTypeEntry = {
    name: string;
    aliases: string[];
    intervals: number[];
};

// All chord types ported from musicpy database.py chordTypes, in original order.
// intervals = raw semitone values above root, sorted ascending.
export const CHORD_TYPES: ChordTypeEntry[] = [
    { name: 'major', aliases: ['M', 'maj', 'majorthird'], intervals: [M3, P5] },
    { name: 'minor', aliases: ['m', 'minorthird', 'min', '-'], intervals: [m3, P5] },
    { name: 'maj7', aliases: ['M7', 'major7th', 'majorseventh'], intervals: [M3, P5, M7] },
    { name: 'm7', aliases: ['min7', 'minor7th', 'minorseventh', '-7'], intervals: [m3, P5, m7] },
    { name: '7', aliases: ['seven', 'seventh', 'dominant seventh', 'dom7', 'dominant7'], intervals: [M3, P5, m7] },
    { name: 'germansixth', aliases: [], intervals: [M3, P5, A6] },
    { name: 'minormajor7', aliases: ['minor major 7', 'mM7'], intervals: [m3, P5, M7] },
    { name: 'dim', aliases: ['o'], intervals: [m3, d5] },
    { name: 'dim7', aliases: ['o7'], intervals: [m3, d5, d7] },
    { name: 'half-diminished7', aliases: ['ø7', 'ø', 'half-diminished', 'half-dim', 'm7b5'], intervals: [m3, d5, m7] },
    { name: 'aug', aliases: ['augmented', '+', 'aug3', '+3'], intervals: [M3, A5] },
    { name: 'aug7', aliases: ['augmented7', '+7'], intervals: [M3, A5, m7] },
    { name: 'augmaj7', aliases: ['augmented-major7', '+maj7', 'augM7'], intervals: [M3, A5, M7] },
    { name: 'aug6', aliases: ['augmented6', '+6', 'italian-sixth'], intervals: [M3, A6] },
    { name: 'frenchsixth', aliases: [], intervals: [M3, d5, A6] },
    { name: 'aug9', aliases: ['+9'], intervals: [M3, A5, m7, M9] },
    { name: 'sus', aliases: ['sus4'], intervals: [P4, P5] },
    { name: 'sus2', aliases: [], intervals: [M2, P5] },
    { name: '9', aliases: ['dominant9', 'dominant-ninth', 'ninth'], intervals: [M3, P5, m7, M9] },
    { name: 'maj9', aliases: ['major-ninth', 'major9th', 'M9'], intervals: [M3, P5, M7, M9] },
    { name: 'm9', aliases: ['minor9', 'minor9th', '-9'], intervals: [m3, P5, m7, M9] },
    { name: 'augmaj9', aliases: ['+maj9', '+M9', 'augM9'], intervals: [M3, A5, M7, M9] },
    { name: 'add6', aliases: ['6', 'sixth'], intervals: [M3, P5, M6] },
    { name: 'm6', aliases: ['minorsixth'], intervals: [m3, P5, M6] },
    { name: 'add2', aliases: ['+2'], intervals: [M2, M3, P5] },
    { name: 'add9', aliases: [], intervals: [M3, P5, M9] },
    { name: 'madd2', aliases: ['m+2'], intervals: [M2, m3, P5] },
    { name: 'madd9', aliases: [], intervals: [m3, P5, M9] },
    { name: '7sus4', aliases: ['7sus'], intervals: [P4, P5, m7] },
    { name: '7sus2', aliases: [], intervals: [M2, P5, m7] },
    { name: 'maj7sus4', aliases: ['maj7sus', 'M7sus4'], intervals: [P4, P5, M7] },
    { name: 'maj7sus2', aliases: ['M7sus2'], intervals: [M2, P5, M7] },
    { name: '9sus4', aliases: ['9sus'], intervals: [P4, P5, m7, M9] },
    { name: '9sus2', aliases: [], intervals: [M2, P5, m7, M9] },
    { name: 'maj9sus4', aliases: ['maj9sus', 'M9sus', 'M9sus4'], intervals: [P4, P5, M7, M9] },
    { name: '11', aliases: ['dominant11', 'dominant 11'], intervals: [M3, P5, m7, M9, P11] },
    { name: 'maj11', aliases: ['M11', 'eleventh', 'major 11', 'major eleventh'], intervals: [M3, P5, M7, M9, P11] },
    { name: 'm11', aliases: ['minor eleventh', 'minor 11'], intervals: [m3, P5, m7, M9, P11] },
    { name: '13', aliases: ['dominant13', 'dominant 13'], intervals: [M3, P5, m7, M9, P11, M13] },
    { name: 'maj13', aliases: ['major 13', 'M13'], intervals: [M3, P5, M7, M9, P11, M13] },
    { name: 'm13', aliases: ['minor 13'], intervals: [m3, P5, m7, M9, P11, M13] },
    { name: '13sus4', aliases: ['13sus'], intervals: [P4, P5, m7, M9, M13] },
    { name: '13sus2', aliases: [], intervals: [M2, P5, m7, P11, M13] },
    { name: 'maj13sus4', aliases: ['maj13sus', 'M13sus', 'M13sus4'], intervals: [P4, P5, M7, M9, M13] },
    { name: 'maj13sus2', aliases: ['M13sus2'], intervals: [M2, P5, M7, P11, M13] },
    { name: 'add4', aliases: ['+4'], intervals: [M3, P4, P5] },
    { name: 'madd4', aliases: ['m+4'], intervals: [m3, P4, P5] },
    { name: 'maj7b5', aliases: ['M7b5'], intervals: [M3, d5, M7] },
    { name: 'maj7#11', aliases: ['M7#11'], intervals: [M3, P5, M7, A11] },
    { name: 'maj9#11', aliases: ['M9#11'], intervals: [M3, P5, M7, M9, A11] },
    { name: '69', aliases: ['6/9', 'add69'], intervals: [M3, P5, M6, M9] },
    { name: 'm69', aliases: ['madd69'], intervals: [m3, P5, M6, M9] },
    { name: '6sus4', aliases: ['6sus'], intervals: [P4, P5, M6] },
    { name: '6sus2', aliases: [], intervals: [M2, P5, M6] },
    { name: '5', aliases: ['power chord'], intervals: [P5] },
    { name: '5(+octave)', aliases: ['power chord(with octave)'], intervals: [P5, P8] },
    { name: 'maj13#11', aliases: ['M13#11'], intervals: [M3, P5, M7, M9, A11, M13] },
    { name: '13#11', aliases: [], intervals: [M3, P5, m7, M9, A11, M13] },
    { name: 'fifth_9th', aliases: [], intervals: [P5, M9] },
    { name: 'minormajor9', aliases: ['minor major 9', 'mM9'], intervals: [m3, P5, M7, M9] },
    { name: 'dim(Maj7)', aliases: [], intervals: [m3, d5, M7] },
];

// Semitone-to-degree label for display (e.g. alteration/omission labels).
export const SEMITONE_TO_DEGREE: Record<number, string> = {
    1: 'b2',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: '#4',
    7: '5',
    8: '#5',
    9: '6',
    10: 'b7',
    11: '7',
    12: '8',
    13: 'b9',
    14: '9',
    15: '#9',
    17: '11',
    18: '#11',
    19: 'b13',
    21: '13',
};

// Compress a single interval into the [0, 15] detection window.
// Intervals above root that are >15 semitones are folded down by octave.
function compressInterval(interval: number): number {
    while (interval < 0) interval += 12;
    while (interval > 15) interval -= 12;
    return interval;
}

// Compute the detection key for a set of raw database intervals.
// Applies inoctave compression (matching what standardize() produces),
// deduplicates, sorts, and joins with commas.
function detectionKey(rawIntervals: number[]): string {
    const seen = new Set<number>();
    for (const v of rawIntervals) {
        const c = compressInterval(v);
        if (c !== 0) seen.add(c);
    }
    return [...seen].sort((a, b) => a - b).join(',');
}

// DETECT_MAP: compressed-interval-key → canonical chord name.
// First-entry wins for any duplicate keys (e.g. dominant-7th vs. german-sixth).
export const DETECT_MAP = new Map<string, string>();
for (const entry of CHORD_TYPES) {
    const key = detectionKey(entry.intervals);
    if (!DETECT_MAP.has(key)) {
        DETECT_MAP.set(key, entry.name);
    }
}

// Short display symbol for each chord type name (used by formatResult).
// 'major' → '' (just root note); 'minor' → 'm'; others use the name as-is where omitted.
export const CHORD_SYMBOL: Record<string, string> = {
    major: '',
    minor: 'm',
    maj7: 'maj7',
    m7: 'm7',
    '7': '7',
    germansixth: 'ger6',
    minormajor7: 'mM7',
    dim: 'dim',
    dim7: 'dim7',
    'half-diminished7': 'm7b5',
    aug: 'aug',
    aug7: 'aug7',
    augmaj7: 'augM7',
    aug6: 'aug6',
    frenchsixth: 'fr6',
    aug9: 'aug9',
    sus: 'sus4',
    sus2: 'sus2',
    '9': '9',
    maj9: 'maj9',
    m9: 'm9',
    augmaj9: 'augM9',
    add6: '6',
    m6: 'm6',
    add2: 'add2',
    add9: 'add9',
    madd2: 'madd2',
    madd9: 'madd9',
    '7sus4': '7sus4',
    '7sus2': '7sus2',
    maj7sus4: 'maj7sus4',
    maj7sus2: 'maj7sus2',
    '9sus4': '9sus4',
    '9sus2': '9sus2',
    maj9sus4: 'maj9sus4',
    '11': '11',
    maj11: 'maj11',
    m11: 'm11',
    '13': '13',
    maj13: 'maj13',
    m13: 'm13',
    '13sus4': '13sus4',
    '13sus2': '13sus2',
    maj13sus4: 'maj13sus4',
    maj13sus2: 'maj13sus2',
    add4: 'add4',
    madd4: 'madd4',
    maj7b5: 'maj7b5',
    'maj7#11': 'maj7#11',
    'maj9#11': 'maj9#11',
    '69': '6/9',
    m69: 'm6/9',
    '6sus4': '6sus4',
    '6sus2': '6sus2',
    '5': '5',
    '5(+octave)': '5(+8)',
    'maj13#11': 'maj13#11',
    '13#11': '13#11',
    fifth_9th: '5,9',
    minormajor9: 'mM9',
    'dim(Maj7)': 'dimM7',
};

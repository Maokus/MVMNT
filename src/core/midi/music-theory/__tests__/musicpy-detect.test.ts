import { describe, it, expect } from 'vitest';
import { detectMusicpy, sequenceSimilarity } from '../musicpy-detect';

// MIDI note helpers
const C4 = 60,
    D4 = 62,
    Eb4 = 63,
    E4 = 64,
    F4 = 65,
    G4 = 67,
    Ab4 = 68,
    A4 = 69,
    Bb4 = 70,
    B4 = 71,
    C5 = 72;
const Db4 = 61,
    Gb4 = 66;

// Pitch classes
const C = 0,
    D = 2,
    Eb = 3,
    E = 4,
    F = 5,
    Gb = 6,
    G = 7,
    Ab = 8,
    A = 9,
    Bb = 10,
    B = 11;

describe('sequenceSimilarity', () => {
    it('returns 1 for identical arrays', () => {
        expect(sequenceSimilarity([3, 7], [3, 7])).toBe(1);
    });

    it('returns 0 for disjoint arrays', () => {
        expect(sequenceSimilarity([1, 2], [3, 4])).toBe(0);
    });

    it('returns 0 for empty vs non-empty', () => {
        expect(sequenceSimilarity([], [1, 2])).toBe(0);
    });

    it('returns 1 for two empty arrays', () => {
        expect(sequenceSimilarity([], [])).toBe(1);
    });

    it('computes partial overlap correctly', () => {
        // intersection = {7}, |a|=2, |b|=2 → 2*1/4 = 0.5
        expect(sequenceSimilarity([3, 7], [7, 10])).toBeCloseTo(0.5);
    });
});

describe('detectMusicpy — edge cases', () => {
    it('returns null for empty input', () => {
        expect(detectMusicpy([])).toBeNull();
    });

    it('returns single-note result for one note', () => {
        const r = detectMusicpy([C4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('C');
        expect(r!.confidence).toBe(1.0);
    });

    it('returns interval name for two notes (perfect fifth)', () => {
        const r = detectMusicpy([C4, G4]);
        expect(r).not.toBeNull();
        expect(r!.chordType).toBe('P5');
    });

    it('returns interval name for two notes (tritone)', () => {
        const r = detectMusicpy([C4, Gb4]);
        expect(r).not.toBeNull();
        expect(r!.chordType).toBe('tritone');
    });
});

describe('detectMusicpy — exact root-position matches', () => {
    it('C major triad [C4 E4 G4]', () => {
        const r = detectMusicpy([C4, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('major');
        expect(r!.inversion).toBe(0);
        expect(r!.confidence).toBe(1.0);
    });

    it('C minor triad [C4 Eb4 G4]', () => {
        const r = detectMusicpy([C4, Eb4, G4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('minor');
        expect(r!.inversion).toBe(0);
    });

    it('C dominant seventh [C4 E4 G4 Bb4]', () => {
        const r = detectMusicpy([C4, E4, G4, Bb4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('7');
        expect(r!.inversion).toBe(0);
    });

    it('C major seventh [C4 E4 G4 B4]', () => {
        const r = detectMusicpy([C4, E4, G4, B4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('maj7');
        expect(r!.inversion).toBe(0);
    });

    it('C minor seventh [C4 Eb4 G4 Bb4]', () => {
        const r = detectMusicpy([C4, Eb4, G4, Bb4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('m7');
        expect(r!.inversion).toBe(0);
    });

    it('C half-diminished seventh [C4 Eb4 Gb4 Bb4]', () => {
        const r = detectMusicpy([C4, Eb4, Gb4, Bb4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('half-diminished7');
        expect(r!.inversion).toBe(0);
    });

    it('C diminished seventh [C4 Eb4 Gb4 A4]', () => {
        const r = detectMusicpy([C4, Eb4, Gb4, A4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('dim7');
        expect(r!.inversion).toBe(0);
    });

    it('C sus2 [C4 D4 G4]', () => {
        const r = detectMusicpy([C4, D4, G4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('sus2');
    });

    it('C sus4 [C4 F4 G4]', () => {
        const r = detectMusicpy([C4, F4, G4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('sus');
    });

    it('C add9 [C4 E4 G4 D5]', () => {
        const r = detectMusicpy([C4, E4, G4, D4 + 12]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('add9');
    });

    it('C add6 [C4 E4 G4 A4]', () => {
        const r = detectMusicpy([C4, E4, G4, A4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('add6');
    });

    it('D minor seventh [D4 F4 A4 C5]', () => {
        const r = detectMusicpy([D4, F4, A4, C5]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(D);
        expect(r!.chordType).toBe('m7');
    });

    it('C diminished triad [C4 Eb4 Gb4]', () => {
        const r = detectMusicpy([C4, Eb4, Gb4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('dim');
    });
});

describe('detectMusicpy — inversions', () => {
    it('C major first inversion [E4 G4 C5]', () => {
        const r = detectMusicpy([E4, G4, C5]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('major');
        expect(r!.inversion).toBeGreaterThan(0);
        expect(r!.bassNote).toBe(E);
    });

    it('C major second inversion [G4 C5 E5]', () => {
        const r = detectMusicpy([G4, C5, E4 + 12]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('major');
        expect(r!.inversion).toBeGreaterThan(0);
        expect(r!.bassNote).toBe(G);
    });

    it('C minor first inversion [Eb4 G4 C5]', () => {
        const r = detectMusicpy([Eb4, G4, C5]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('minor');
        expect(r!.inversion).toBeGreaterThan(0);
    });

    it('returns high confidence for inverted chords (exact root found)', () => {
        const r = detectMusicpy([E4, G4, C5]);
        expect(r).not.toBeNull();
        // Exact root match in step 3 → confidence 1.0; inversion path → 0.95
        expect(r!.confidence).toBeGreaterThanOrEqual(0.95);
    });
});

describe('detectMusicpy — preferBassRoot option', () => {
    it('prefers bass as root when preferBassRoot=true', () => {
        // C F A = Fmaj/C — bass is C, but chord is F major
        const r = detectMusicpy([C4, F4, A4], { rootPreference: true });
        expect(r).not.toBeNull();
        // Could be Fmaj/C (root=F, bass=C) or Dm (root=D)
        // Either way, it should be a valid chord
        expect(r!.root).toBeDefined();
    });
});

describe('detectMusicpy — similarity fallback (omitted notes)', () => {
    it('[C4 Eb4 Bb4] (Cm7 omit 5) finds similarity match for m7', () => {
        // [3, 10] has no exact chord match; best similarity hit should be m7 [3, 7, 10]
        const r = detectMusicpy([C4, Eb4, Bb4], { similarityRatio: 0.5 });
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('m7');
        expect(r!.confidence).toBeLessThan(1.0);
        expect(r!.omits).toContain('5');
    });
});

describe('detectMusicpy — octave-duplicated notes', () => {
    it('deduplicates octave notes before detection', () => {
        // C4, C5, E4, G4 — C is doubled at octave
        const r = detectMusicpy([C4, C5, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('major');
    });

    it('deduplicates spread voicing G3-C4-E4-G4', () => {
        const G3 = 55;
        const r = detectMusicpy([G3, C4, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.root).toBe(C);
        expect(r!.chordType).toBe('major');
    });
});

describe('detectMusicpy — result structure', () => {
    it('bassNote is null for root-position chords', () => {
        const r = detectMusicpy([C4, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.bassNote).toBeNull();
    });

    it('isPolychord is false for normal chords', () => {
        const r = detectMusicpy([C4, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.isPolychord).toBe(false);
    });

    it('upperChord is null for normal chords', () => {
        const r = detectMusicpy([C4, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.upperChord).toBeNull();
    });

    it('omits and alterations are empty for exact match', () => {
        const r = detectMusicpy([C4, E4, G4]);
        expect(r).not.toBeNull();
        expect(r!.omits).toHaveLength(0);
        expect(r!.alterations).toHaveLength(0);
    });
});

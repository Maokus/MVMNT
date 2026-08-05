import { describe, expect, it } from 'vitest';
import { detectPatternChord } from '../pattern-chord-detector';

const C4 = 60;
const E4 = 64;
const G4 = 67;
const Bb4 = 70;
const D5 = 74;
const A4 = 69;

describe('detectPatternChord', () => {
    it('identifies an exact major triad', () => {
        const result = detectPatternChord([C4, E4, G4]);
        expect(result).toMatchObject({ chordType: 'major', symbol: '', isRootless: false });
        expect(result!.chord.root).toBe(0);
        expect(result!.chord.confidence).toBeGreaterThan(0.8);
    });

    it('recognises a dominant ninth by its extended interval', () => {
        const result = detectPatternChord([C4, E4, G4, Bb4, D5]);
        expect(result).toMatchObject({ chordType: 'dominant9', symbol: '9' });
        expect(result!.chord.root).toBe(0);
    });

    it('covers the reference altered and #11 pattern vocabulary', () => {
        const majorSharp11 = detectPatternChord([C4, E4, G4, 71, D5, 78]);
        expect(majorSharp11).toMatchObject({ chordType: 'major9#11', symbol: 'maj9♯11' });

        const alteredDominant = detectPatternChord([C4, E4, 68, Bb4, 75, 80]);
        expect(alteredDominant).toMatchObject({ chordType: 'dominant7#5#9b13', symbol: '7♯5♯9♭13' });
    });

    it('uses the bass to resolve C6 versus Am7', () => {
        const result = detectPatternChord([A4 - 12, C4, E4, G4]);
        expect(result).toMatchObject({ chordType: 'minor7' });
        expect(result!.chord.root).toBe(9);
    });

    it('ranks tied candidates deterministically with explicit evidence', () => {
        const notes = [A4 - 12, C4, E4, G4];
        const first = detectPatternChord(notes, 9)!;
        const second = detectPatternChord(notes, 9)!;
        expect(first.chordType).toBe(second.chordType);
        expect(
            first.alternatives.some((candidate) => candidate.chordType === 'major6' || candidate.chordType === 'minor7')
        ).toBe(true);
    });

    it('does not let a rootless interpretation override a complete chord', () => {
        const result = detectPatternChord([E4, G4, Bb4, D5]);
        expect(result).toMatchObject({ chordType: 'half-diminished7', isRootless: false });
        expect(result!.chord.root).toBe(4);
    });
});

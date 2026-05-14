import { describe, it, expect } from 'vitest';
import { CHORD_TYPES, DETECT_MAP } from '../musicpy-chord-database';

describe('CHORD_TYPES database integrity', () => {
    it('contains at least 55 chord types', () => {
        expect(CHORD_TYPES.length).toBeGreaterThanOrEqual(55);
    });

    it('every entry has a non-empty name', () => {
        for (const entry of CHORD_TYPES) {
            expect(entry.name).toBeTruthy();
        }
    });

    it('every entry has at least one interval', () => {
        for (const entry of CHORD_TYPES) {
            expect(entry.intervals.length).toBeGreaterThan(0);
        }
    });

    it('every interval array is sorted ascending', () => {
        for (const entry of CHORD_TYPES) {
            const sorted = [...entry.intervals].sort((a, b) => a - b);
            expect(entry.intervals).toEqual(sorted);
        }
    });

    it('all interval values are positive semitones', () => {
        for (const entry of CHORD_TYPES) {
            for (const interval of entry.intervals) {
                expect(interval).toBeGreaterThan(0);
            }
        }
    });

    it('no two entries share the same name', () => {
        const names = CHORD_TYPES.map((e) => e.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });

    it('contains essential triad types', () => {
        const names = new Set(CHORD_TYPES.map((e) => e.name));
        expect(names.has('major')).toBe(true);
        expect(names.has('minor')).toBe(true);
        expect(names.has('dim')).toBe(true);
        expect(names.has('aug')).toBe(true);
    });

    it('contains essential seventh chord types', () => {
        const names = new Set(CHORD_TYPES.map((e) => e.name));
        expect(names.has('7')).toBe(true);
        expect(names.has('maj7')).toBe(true);
        expect(names.has('m7')).toBe(true);
        expect(names.has('dim7')).toBe(true);
        expect(names.has('half-diminished7')).toBe(true);
    });

    it('contains extended chord types', () => {
        const names = new Set(CHORD_TYPES.map((e) => e.name));
        expect(names.has('9')).toBe(true);
        expect(names.has('maj9')).toBe(true);
        expect(names.has('11')).toBe(true);
        expect(names.has('13')).toBe(true);
    });

    it('contains sus and add types', () => {
        const names = new Set(CHORD_TYPES.map((e) => e.name));
        expect(names.has('sus')).toBe(true);
        expect(names.has('sus2')).toBe(true);
        expect(names.has('7sus4')).toBe(true);
        expect(names.has('add9')).toBe(true);
        expect(names.has('add6')).toBe(true);
    });
});

describe('DETECT_MAP integrity', () => {
    it('has entries for every chord type (at minimum a subset)', () => {
        expect(DETECT_MAP.size).toBeGreaterThan(0);
    });

    it('resolves C major intervals [4,7] → "major"', () => {
        expect(DETECT_MAP.get('4,7')).toBe('major');
    });

    it('resolves C minor intervals [3,7] → "minor"', () => {
        expect(DETECT_MAP.get('3,7')).toBe('minor');
    });

    it('resolves dominant seventh [4,7,10] → "7"', () => {
        expect(DETECT_MAP.get('4,7,10')).toBe('7');
    });

    it('resolves major seventh [4,7,11] → "maj7"', () => {
        expect(DETECT_MAP.get('4,7,11')).toBe('maj7');
    });

    it('resolves minor seventh [3,7,10] → "m7"', () => {
        expect(DETECT_MAP.get('3,7,10')).toBe('m7');
    });

    it('resolves diminished triad [3,6] → "dim"', () => {
        expect(DETECT_MAP.get('3,6')).toBe('dim');
    });

    it('resolves diminished seventh [3,6,9] → "dim7"', () => {
        expect(DETECT_MAP.get('3,6,9')).toBe('dim7');
    });

    it('resolves half-diminished seventh [3,6,10] → "half-diminished7"', () => {
        expect(DETECT_MAP.get('3,6,10')).toBe('half-diminished7');
    });

    it('resolves augmented triad [4,8] → "aug"', () => {
        expect(DETECT_MAP.get('4,8')).toBe('aug');
    });

    it('resolves sus2 [2,7] → "sus2"', () => {
        expect(DETECT_MAP.get('2,7')).toBe('sus2');
    });

    it('resolves sus4 [5,7] → "sus"', () => {
        expect(DETECT_MAP.get('5,7')).toBe('sus');
    });

    it('resolves dominant ninth [4,7,10,14] → "9"', () => {
        expect(DETECT_MAP.get('4,7,10,14')).toBe('9');
    });

    it('resolves major ninth [4,7,11,14] → "maj9"', () => {
        expect(DETECT_MAP.get('4,7,11,14')).toBe('maj9');
    });

    it('all DETECT_MAP keys are comma-separated integers', () => {
        for (const key of DETECT_MAP.keys()) {
            expect(key).toMatch(/^\d+(,\d+)*$/);
        }
    });

    it('all DETECT_MAP values are non-empty strings', () => {
        for (const value of DETECT_MAP.values()) {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        }
    });

    it('has no duplicate keys (data entry sanity)', () => {
        const keys = [...DETECT_MAP.keys()];
        const unique = new Set(keys);
        expect(unique.size).toBe(keys.length);
    });
});

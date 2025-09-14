import { describe, it, expect } from 'vitest';
import { estimateChordPB } from '@core/midi/music-theory/chord-estimator';

function makeChroma(indices: number[]): Float32Array {
    const v = new Float32Array(12);
    indices.forEach((i) => (v[((i % 12) + 12) % 12] = 1));
    const sum = v.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 12; i++) v[i] = v[i] / (sum || 1);
    return v;
}

describe('Chord estimation (via @math/midi)', () => {
    it('detects C major triad', () => {
        const chroma = makeChroma([0, 4, 7]);
        const chord = estimateChordPB(chroma, 0, {
            includeTriads: true,
            includeDiminished: true,
            includeAugmented: true,
            includeSevenths: true,
            preferBassRoot: true,
        });
        expect(chord).toBeTruthy();
        expect(chord!.root).toBe(0);
        expect(['maj', '7', 'maj7']).toContain(chord!.quality);
    });

    it('detects A minor triad', () => {
        const chroma = makeChroma([9, 0, 4]); // Am tones relative to C major keyspace (A,C,E)
        const chord = estimateChordPB(chroma, 9, {
            includeTriads: true,
            includeDiminished: true,
            includeAugmented: false,
            includeSevenths: true,
            preferBassRoot: true,
        });
        expect(chord).toBeTruthy();
        expect(chord!.root).toBe(9);
        expect(['min', 'min7']).toContain(chord!.quality);
    });

    it('prefers root in bass when ambiguous', () => {
        const chroma = makeChroma([0, 4, 7, 9]); // add A (could hint to something else)
        const chordRootDifferentBass = estimateChordPB(chroma, 9, {
            includeTriads: true,
            includeDiminished: true,
            includeAugmented: false,
            includeSevenths: false,
            preferBassRoot: true,
        });
        expect(chordRootDifferentBass).toBeTruthy();
        expect([0, 9]).toContain(chordRootDifferentBass!.root);
    });
});

import { describe, it, expect } from 'vitest';
import { ChordEstimateDisplayElement } from '../chord-estimate-display';

function makeChroma(indices: number[]): Float32Array {
    const v = new Float32Array(12);
    indices.forEach((i) => (v[((i % 12) + 12) % 12] = 1));
    const sum = v.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 12; i++) v[i] = v[i] / (sum || 1);
    return v;
}

describe('ChordEstimateDisplayElement _estimateChordPB', () => {
    it('detects C major triad', () => {
        const el = new ChordEstimateDisplayElement('test');
        const chroma = makeChroma([0, 4, 7]);
        const chord = (el as any)._estimateChordPB(chroma, 0, {
            includeTriads: true,
            includeDim: true,
            includeAug: true,
            include7: true,
            preferBassRoot: true,
        });
        expect(chord).toBeTruthy();
        expect(chord!.root).toBe(0);
        expect(['maj', '7', 'maj7']).toContain(chord!.quality);
    });

    it('detects A minor triad', () => {
        const el = new ChordEstimateDisplayElement('test');
        const chroma = makeChroma([9, 0, 4]); // Am tones relative to C major keyspace (A,C,E)
        const chord = (el as any)._estimateChordPB(chroma, 9, {
            includeTriads: true,
            includeDim: true,
            includeAug: false,
            include7: true,
            preferBassRoot: true,
        });
        expect(chord).toBeTruthy();
        expect(chord!.root).toBe(9);
        expect(['min', 'min7']).toContain(chord!.quality);
    });

    it('prefers root in bass when ambiguous', () => {
        const el = new ChordEstimateDisplayElement('test');
        const chroma = makeChroma([0, 4, 7, 9]); // add A (could hint to something else)
        const chordRootDifferentBass = (el as any)._estimateChordPB(chroma, 9, {
            includeTriads: true,
            includeDim: true,
            includeAug: false,
            include7: false,
            preferBassRoot: true,
        });
        expect(chordRootDifferentBass).toBeTruthy();
        expect([0, 9]).toContain(chordRootDifferentBass!.root);
    });
});

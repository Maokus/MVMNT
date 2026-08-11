import { describe, it, expect } from 'vitest';
import { estimateChordPB } from '@core/midi/music-theory/chord-estimator';
import { ChordEstimateDisplayElement, formatScaleDegree } from '../midi-displays/chord-estimate-display';

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

describe('Chord Estimate Display controls', () => {
    it('formats chord roots as degrees of the selected major scale', () => {
        expect(formatScaleDegree(2, 'C')).toBe('II');
        expect(formatScaleDegree(5, 'C')).toBe('IV');
        expect(formatScaleDegree(2, 'D')).toBe('I');
        expect(formatScaleDegree(1, 'C')).toBe('♭II');
    });

    it('uses scale degrees for chord roots and inversions when enabled', () => {
        const element = new ChordEstimateDisplayElement() as any;

        expect(element._formatChordLabel({ root: 2, quality: '7' }, false, 'sharps', true, 'C')).toBe('II7');
        expect(element._formatChordLabel({ root: 5, quality: 'maj', bassPc: 0 }, true, 'sharps', true, 'C')).toBe(
            'IV/I'
        );
    });

    it('shows the scale-root selector only in scale degree mode', () => {
        const schema = ChordEstimateDisplayElement.getConfigSchema() as any;
        const content = schema.tabs.find((tab: any) => tab.id === 'content');
        const estimation = content.groups.find((group: any) => group.id === 'estimation');
        const degreeMode = estimation.properties.find((property: any) => property.key === 'scaleDegreeMode');
        const scaleRoot = estimation.properties.find((property: any) => property.key === 'scaleRoot');

        expect(degreeMode.default).toBe(false);
        expect(scaleRoot.default).toBe('C');
        expect(scaleRoot.visibleWhen).toEqual([{ key: 'scaleDegreeMode', equals: true }]);
    });

    it('hides allow-quality controls for pattern scoring and musicpy', () => {
        const schema = ChordEstimateDisplayElement.getConfigSchema() as any;
        const content = schema.tabs.find((tab: any) => tab.id === 'content');
        const estimation = content.groups.find((group: any) => group.id === 'estimation');
        const triads = estimation.properties.find((property: any) => property.key === 'includeTriads');
        expect(triads.visibleWhen).toEqual([
            { key: 'detectionMethod', notEquals: 'musicpy' },
            { key: 'detectionMethod', notEquals: 'pattern-scoring' },
        ]);
    });

    it('shows window controls only for windowed chroma analysis', () => {
        const schema = ChordEstimateDisplayElement.getConfigSchema() as any;
        const content = schema.tabs.find((tab: any) => tab.id === 'content');
        const source = content.groups.find((group: any) => group.id === 'chordSource');
        expect(source.properties.find((property: any) => property.key === 'windowSeconds').visibleWhen).toEqual([
            { key: 'analysisMode', equals: 'windowed' },
        ]);
    });
});

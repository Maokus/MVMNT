import { describe, it, expect } from 'vitest';
import { estimateChordPB } from '@core/midi/music-theory/chord-estimator';
import { TimingManager } from '@core/timing/timing-manager';
import { Text } from '@core/render/render-objects';
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

    it('offers sustain-aware chord estimation as an opt-in setting', () => {
        const schema = ChordEstimateDisplayElement.getConfigSchema() as any;
        const content = schema.tabs.find((tab: any) => tab.id === 'content');
        const source = content.groups.find((group: any) => group.id === 'chordSource');
        const sustainPedalAware = source.properties.find((property: any) => property.key === 'sustainPedalAware');

        expect(sustainPedalAware).toMatchObject({
            type: 'boolean',
            label: 'Sustain Pedal Aware',
            default: false,
        });
    });

    it('renders a whole chord from alternating notes held by the sustain pedal', () => {
        const element = new ChordEstimateDisplayElement('sustained-chord', {
            midiTrackId: 'piano',
            sustainPedalAware: true,
            detectionMethod: 'simple-interval',
            showActiveNotes: false,
            showChroma: false,
            smoothingMs: 0,
        }) as any;
        const notes = [
            { note: 48, channel: 0, velocity: 100, startSeconds: 0, endSeconds: 0.2 },
            { note: 64, channel: 0, velocity: 100, startSeconds: 0.5, endSeconds: 0.8 },
            { note: 67, channel: 0, velocity: 100, startSeconds: 0.5, endSeconds: 0.8 },
        ];
        element.__capabilityContext = {
            timeline: {
                selectCC: () => ({
                    ok: true,
                    value: [
                        { channel: 0, value: 127, timeSeconds: 0.1 },
                        { channel: 0, value: 0, timeSeconds: 1.5 },
                    ],
                }),
                selectNotes: ({ startSeconds, endSeconds }: { startSeconds: number; endSeconds: number }) => ({
                    ok: true,
                    value: notes.filter((note) => note.endSeconds > startSeconds && note.startSeconds < endSeconds),
                }),
            },
        };

        const renderObjects = element._buildRenderObjects({}, 0.6);
        const chordLabel = renderObjects.find((object: unknown) => object instanceof Text) as Text;

        expect(chordLabel.text).toBe('C');
    });
});

describe('Whole-bar chord estimation', () => {
    function makeDisplay(
        options: {
            method?: string;
            numerator?: number;
            denominator?: number;
            tempoChange?: boolean;
            separateBass?: boolean;
        } = {}
    ) {
        const timing = new TimingManager();
        timing.setBPM(120);
        timing.setTimeSignature({ numerator: options.numerator ?? 4, denominator: options.denominator ?? 4 });
        if (options.tempoChange)
            timing.setTempoMap([
                { time: 0, bpm: 120 },
                { time: 1, bpm: 60 },
            ]);
        const barBeats = (timing.timeSignature.numerator * 4) / timing.timeSignature.denominator;
        const barEnd = timing.beatsToSeconds(barBeats);
        const notes = [60, 64, 67, 71].map((note, index) => ({
            note,
            channel: 0,
            velocity: 100,
            startSeconds: timing.beatsToSeconds((barBeats * (index + 0.1)) / 4),
            endSeconds: timing.beatsToSeconds((barBeats * (index + 0.8)) / 4),
        }));
        const element = new ChordEstimateDisplayElement('bar-chord', {
            midiTrackId: 'piano',
            analysisMode: 'bar',
            detectionMethod: options.method ?? 'pattern-scoring',
            showActiveNotes: false,
            showChroma: false,
            smoothingMs: 5000,
            ...(options.separateBass ? { bassMode: 'separate-track', bassTrackId: 'bass' } : {}),
        }) as any;
        element.__capabilityContext = {
            timing: {
                secondsToBeats: (seconds: number) => ({ ok: true, value: timing.secondsToBeats(seconds) }),
                beatsToSeconds: (beats: number) => ({ ok: true, value: timing.beatsToSeconds(beats) }),
            },
            timeline: {
                getMetadata: () => ({ ok: true, value: { tempoBpm: 120, timeSignature: timing.timeSignature } }),
                selectNotes: ({ trackIds, startSeconds, endSeconds }: any) => ({
                    ok: true,
                    value: (trackIds[0] === 'bass'
                        ? [{ note: 52, channel: 0, velocity: 100, startSeconds: barEnd / 2, endSeconds: barEnd * 0.75 }]
                        : [
                              ...notes,
                              ...[62, 65, 69].map((note) => ({
                                  note,
                                  channel: 0,
                                  velocity: 100,
                                  startSeconds: barEnd,
                                  endSeconds: timing.beatsToSeconds(barBeats * 2),
                              })),
                          ]
                    ).filter((note) => note.endSeconds > startSeconds && note.startSeconds < endSeconds),
                }),
            },
        };
        const labelAt = (time: number) =>
            element._buildRenderObjects({}, time).find((object: unknown) => object instanceof Text).text;
        return { labelAt, barEnd, timing, barBeats };
    }

    it.each(['pattern-scoring', 'musicpy', 'simple-interval', 'template-match'])(
        'shows a complete Cmaj7 arpeggio from the bar start with %s',
        (method) => {
            const { labelAt, barEnd } = makeDisplay({ method });
            // Seek out of order: playback history and gaps between notes must not change the label.
            for (const time of [barEnd * 0.95, 0, barEnd / 2, barEnd * 0.24]) {
                expect(labelAt(time)).toBe('Cmaj7');
            }
            expect(labelAt(barEnd)).toBe('Dm');
        }
    );

    it.each([
        [3, 4],
        [6, 8],
    ])('uses the project %s/%s meter', (numerator, denominator) => {
        const { labelAt, barEnd } = makeDisplay({ numerator, denominator });
        expect(barEnd).toBe(1.5);
        expect(labelAt(0)).toBe('Cmaj7');
        expect(labelAt(barEnd - 0.001)).toBe('Cmaj7');
        expect(labelAt(barEnd)).toBe('Dm');
    });

    it('converts both bar boundaries through the project tempo map', () => {
        const { labelAt, barEnd, timing, barBeats } = makeDisplay({ tempoChange: true });
        expect(barEnd).toBe(3);
        expect(labelAt(0)).toBe('Cmaj7');
        expect(labelAt(barEnd)).toBe('Dm');
        expect(labelAt(timing.beatsToSeconds(barBeats * 2))).toBe('N.C.');
    });

    it('uses the whole bar of a separate bass track for a stable inversion', () => {
        const { labelAt, barEnd } = makeDisplay({ separateBass: true });
        expect(labelAt(0)).toBe('Cmaj7/E');
        expect(labelAt(barEnd * 0.95)).toBe('Cmaj7/E');
    });

    it('exposes whole-bar analysis while retaining active notes as the default', () => {
        const schema = ChordEstimateDisplayElement.getConfigSchema() as any;
        const source = schema.tabs
            .find((tab: any) => tab.id === 'content')
            .groups.find((group: any) => group.id === 'chordSource');
        const mode = source.properties.find((property: any) => property.key === 'analysisMode');
        expect(mode.default).toBe('active');
        expect(mode.options).toContainEqual({ value: 'bar', label: 'Whole Bar' });
    });
});

import { describe, expect, it } from 'vitest';
import {
    buildChordObservation,
    clusterChordOnsets,
    detectChordFromObservation,
    stabiliseChordFrames,
    type CanonicalChordResult,
    type ChordTimelineNote,
} from '../chord-detection-pipeline';

const note = (midi: number, startTime: number, endTime: number): ChordTimelineNote => ({
    note: midi,
    channel: 0,
    velocity: 100,
    startTime,
    endTime,
});

const cMajor = (time: number): CanonicalChordResult => ({
    method: 'pattern-scoring',
    chord: { root: 0, quality: 'maj', confidence: 1 },
    chordType: 'major',
    symbol: '',
    confidence: 1,
    matchedTones: [0, 4, 7],
    missingTones: [],
    extraTones: [],
    alternatives: [],
    metadata: { kind: 'basic' },
    bassNote: 48,
    bassPc: 0,
    rawScore: time,
});

describe('chord detection pipeline', () => {
    it('uses exact active notes at chord boundaries rather than a window union', () => {
        const notes = [note(60, 0, 1), note(64, 0, 1), note(67, 0, 1), note(62, 1, 2), note(65, 1, 2), note(69, 1, 2)];
        expect(buildChordObservation({ targetTime: 1, notes }).midiNotes).toEqual([62, 65, 69]);
        expect(buildChordObservation({ targetTime: 0.999, notes }).midiNotes).toEqual([60, 64, 67]);
    });

    it('keeps staggered onsets separate until the chord is actually complete', () => {
        const notes = [note(60, 0, 2), note(64, 0.1, 2), note(67, 0.2, 2)];
        expect(buildChordObservation({ targetTime: 0.15, notes }).midiNotes).toEqual([60, 64]);
        const observation = buildChordObservation({ targetTime: 0.2, notes });
        expect(detectChordFromObservation(observation, 'simple-interval')).toMatchObject({ chordType: 'maj' });
    });

    it('clusters near-simultaneous prerecorded onsets deterministically', () => {
        expect(clusterChordOnsets([0.02, 0, 0.018, 0.1])).toEqual([0, 0.1]);
    });

    it('separates bass from harmonic notes while retaining slash-bass data', () => {
        const observation = buildChordObservation({
            targetTime: 1,
            notes: [note(60, 0, 2), note(64, 0, 2), note(67, 0, 2)],
            bassNotes: [note(52, 0, 2)],
        });
        expect(observation.midiNotes).toEqual([60, 64, 67]);
        expect(observation.bassPc).toBe(4);
        expect(detectChordFromObservation(observation, 'pattern-scoring')).toMatchObject({
            chordType: 'major',
            bassPc: 4,
        });
    });

    it('honours pattern filtering and bass-root preference', () => {
        const observation = buildChordObservation({
            targetTime: 1,
            notes: [note(60, 0, 2), note(64, 0, 2), note(67, 0, 2)],
        });
        expect(detectChordFromObservation(observation, 'pattern-scoring', { includeTriads: false })).toBeUndefined();
        expect(detectChordFromObservation(observation, 'pattern-scoring', { includeTriads: true })).toMatchObject({
            chordType: 'major',
        });
    });

    it('holds a complete result through brief silence without extending the hold', () => {
        const result = cMajor(0);
        const frames = stabiliseChordFrames([{ time: 0, result }, { time: 0.05 }, { time: 0.11 }], 100);
        expect(frames[1]).toBe(result);
        expect(frames[2]).toBeUndefined();
    });

    it('is deterministic when frames are evaluated out of timestamp order', () => {
        const ordered = stabiliseChordFrames([{ time: 0, result: cMajor(0) }, { time: 0.05 }], 100);
        const unordered = stabiliseChordFrames([{ time: 0.05 }, { time: 0, result: cMajor(0) }], 100);
        expect(unordered[0]?.chordType).toBe(ordered[1]?.chordType);
        expect(unordered[1]?.chordType).toBe(ordered[0]?.chordType);
    });

    it('preserves extended labels while holding', () => {
        const extended = {
            ...cMajor(0),
            chordType: 'dominant13',
            symbol: '13',
            chord: { root: 0, quality: 'ext' as const, confidence: 1 },
        };
        expect(stabiliseChordFrames([{ time: 0, result: extended }, { time: 0.05 }], 100)[1]).toMatchObject({
            chordType: 'dominant13',
            symbol: '13',
        });
    });
});

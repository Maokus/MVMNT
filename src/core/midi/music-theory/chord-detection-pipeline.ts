import type { ChordEstimatorOptions, EstimatedChord, MusicpyChordResult } from './chord-estimator';
import { detectChordFromNotes, detectChordMusicpy, estimateChordPB } from './chord-estimator';
import { detectPatternChord, type PatternChordResult } from './pattern-chord-detector';

export type ChordDetectionMethod = 'pattern-scoring' | 'musicpy' | 'template-match' | 'simple-interval';
export type ChordAnalysisMode = 'active' | 'windowed';

export type ChordTimelineNote = {
    note: number;
    channel: number;
    startTime: number;
    endTime: number;
    velocity: number;
};

export type ChordObservation = {
    targetTime: number;
    notes: ChordTimelineNote[];
    bassNotes: ChordTimelineNote[];
    midiNotes: number[];
    chroma: Float32Array;
    bassNote?: number;
    bassPc?: number;
    analysisMode: ChordAnalysisMode;
};

export type CanonicalChordResult = {
    method: ChordDetectionMethod;
    chord: EstimatedChord;
    chordType: string;
    symbol: string;
    confidence: number;
    rawScore?: number;
    matchedTones: Array<number | string>;
    missingTones: Array<number | string>;
    extraTones: Array<number | string>;
    bassNote?: number;
    bassPc?: number;
    inversion?: number;
    voicingType?: string;
    alternatives: Array<{ root: number; chordType: string; symbol: string; score?: number }>;
    metadata:
        | { kind: 'pattern'; value: PatternChordResult }
        | { kind: 'musicpy'; value: MusicpyChordResult }
        | { kind: 'basic' };
};

export type ChordDetectorAdapterOptions = ChordEstimatorOptions & { previousChordKey?: string };

const pc = (note: number) => ((note % 12) + 12) % 12;

function activeAt(notes: readonly ChordTimelineNote[], time: number): ChordTimelineNote[] {
    return notes.filter((note) => note.startTime <= time && time < note.endTime);
}

function weightedChroma(notes: readonly ChordTimelineNote[]): Float32Array {
    const chroma = new Float32Array(12);
    for (const note of notes)
        chroma[pc(note.note)] += 0.5 + (0.5 * Math.max(1, Math.min(127, note.velocity || 64))) / 127;
    const total = chroma.reduce((sum, value) => sum + value, 0);
    if (total > 0) for (let index = 0; index < chroma.length; index++) chroma[index] /= total;
    return chroma;
}

function windowedChroma(notes: readonly ChordTimelineNote[], start: number, end: number): Float32Array {
    const chroma = new Float32Array(12);
    for (const note of notes) {
        const overlap = Math.max(0, Math.min(end, note.endTime) - Math.max(start, note.startTime));
        if (overlap <= 0) continue;
        chroma[pc(note.note)] += overlap * (0.5 + (0.5 * Math.max(1, Math.min(127, note.velocity || 64))) / 127);
    }
    const total = chroma.reduce((sum, value) => sum + value, 0);
    if (total > 0) for (let index = 0; index < chroma.length; index++) chroma[index] /= total;
    return chroma;
}

export function buildChordObservation(args: {
    targetTime: number;
    notes: readonly ChordTimelineNote[];
    bassNotes?: readonly ChordTimelineNote[];
    analysisMode?: ChordAnalysisMode;
    windowSeconds?: number;
    windowFuturePercent?: number;
}): ChordObservation {
    const analysisMode = args.analysisMode ?? 'active';
    const activeNotes = activeAt(args.notes, args.targetTime).sort(
        (left, right) => left.note - right.note || left.startTime - right.startTime
    );
    const activeBass = activeAt(args.bassNotes ?? args.notes, args.targetTime).sort(
        (left, right) => left.note - right.note || left.startTime - right.startTime
    );
    const futureRatio = Math.max(0, Math.min(1, (args.windowFuturePercent ?? 0) / 100));
    const windowSeconds = Math.max(0.05, args.windowSeconds ?? 0.1);
    const start = Math.max(0, args.targetTime - windowSeconds * (1 - futureRatio));
    const end = args.targetTime + windowSeconds * futureRatio;
    const notes =
        analysisMode === 'windowed'
            ? args.notes.filter((note) => note.endTime > start && note.startTime < end)
            : activeNotes;
    const bass = activeBass[0];
    return {
        targetTime: args.targetTime,
        notes: [...notes],
        bassNotes: activeBass,
        midiNotes: notes.map((note) => note.note),
        chroma: analysisMode === 'windowed' ? windowedChroma(notes, start, end) : weightedChroma(activeNotes),
        bassNote: bass?.note,
        bassPc: bass ? pc(bass.note) : undefined,
        analysisMode,
    };
}

export function detectChordFromObservation(
    observation: ChordObservation,
    method: ChordDetectionMethod,
    options: ChordDetectorAdapterOptions = {}
): CanonicalChordResult | undefined {
    if (observation.midiNotes.length === 0) return undefined;
    if (method === 'pattern-scoring') {
        const result = detectPatternChord(observation.midiNotes, observation.bassPc, options);
        if (!result) return undefined;
        return {
            method,
            chord: result.chord,
            chordType: result.chordType,
            symbol: result.symbol,
            confidence: result.chord.confidence,
            rawScore: result.score,
            matchedTones: result.matchedIntervals,
            missingTones: result.missingIntervals,
            extraTones: result.extraIntervals,
            bassNote: observation.bassNote,
            bassPc: observation.bassPc,
            voicingType: result.voicingType,
            alternatives: result.alternatives,
            metadata: { kind: 'pattern', value: result },
        };
    }
    if (method === 'musicpy') {
        const result = detectChordMusicpy(observation.midiNotes, observation.bassPc, {
            rootPreference: options.preferBassRoot,
        });
        if (!result) return undefined;
        const raw = result.raw;
        return {
            method,
            chord: { ...result.chord, bassPc: observation.bassPc ?? result.chord.bassPc },
            chordType: raw.chordType,
            symbol: raw.chordType,
            confidence: result.chord.confidence,
            matchedTones: [],
            missingTones: raw.omits,
            extraTones: raw.alterations,
            bassNote: observation.bassNote,
            bassPc: observation.bassPc,
            inversion: raw.inversion,
            alternatives: [],
            metadata: { kind: 'musicpy', value: raw },
        };
    }
    const chord =
        method === 'template-match'
            ? estimateChordPB(observation.chroma, observation.bassPc, options)
            : (detectChordFromNotes(observation.midiNotes, observation.bassPc, options) ??
              estimateChordPB(observation.chroma, observation.bassPc, options));
    if (!chord) return undefined;
    return {
        method,
        chord,
        chordType: chord.quality,
        symbol: chord.quality,
        confidence: chord.confidence,
        matchedTones: [],
        missingTones: [],
        extraTones: [],
        bassNote: observation.bassNote,
        bassPc: observation.bassPc,
        alternatives: [],
        metadata: { kind: 'basic' },
    };
}

export function chordKey(result: CanonicalChordResult | undefined): string | undefined {
    return result ? `${result.chord.root}:${result.chordType}:${result.bassPc ?? ''}` : undefined;
}

/** Groups near-simultaneous prerecorded MIDI onsets into deterministic analysis frames. */
export function clusterChordOnsets(times: readonly number[], clusterSeconds = 0.03): number[] {
    const sorted = [...times].filter(Number.isFinite).sort((left, right) => left - right);
    const clusters: number[] = [];
    for (const time of sorted) {
        const previous = clusters[clusters.length - 1];
        if (previous === undefined || time - previous > clusterSeconds) clusters.push(time);
    }
    return clusters;
}

export function stabiliseChordFrames(
    frames: readonly { time: number; result?: CanonicalChordResult }[],
    holdMilliseconds: number,
    minimumConfidence = 0.2
): Array<CanonicalChordResult | undefined> {
    const sorted = [...frames]
        .map((frame, index) => ({ ...frame, index }))
        .sort((left, right) => left.time - right.time || left.index - right.index);
    let held: CanonicalChordResult | undefined;
    let holdStartedAt = -Infinity;
    const output = new Map<number, CanonicalChordResult | undefined>();
    for (const frame of sorted) {
        if (frame.result && frame.result.confidence >= minimumConfidence) {
            held = frame.result;
            holdStartedAt = frame.time;
        } else if (held && (frame.time - holdStartedAt) * 1000 > holdMilliseconds) {
            held = undefined;
        }
        output.set(frame.index, frame.result && frame.result.confidence >= minimumConfidence ? frame.result : held);
    }
    return frames.map((_, index) => output.get(index));
}

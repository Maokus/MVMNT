import { NoteEvent } from '@core/midi/note-event';

export type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | '7' | 'maj7' | 'min7' | 'm7b5' | 'dim7';

export interface EstimatedChord {
    root: number; // 0..11
    quality: ChordQuality;
    bassPc?: number;
    confidence: number; // 0..1
}

export interface ChordEstimatorOptions {
    includeTriads?: boolean;
    includeDiminished?: boolean;
    includeAugmented?: boolean;
    includeSevenths?: boolean;
    preferBassRoot?: boolean;
}

/**
 * Compute chroma vector and bass pitch class from note events within a time window.
 * Duration- and velocity-weighted aggregation.
 */
export function computeChromaFromNotes(
    notes: Pick<NoteEvent, 'note' | 'startTime' | 'endTime' | 'velocity' | 'channel'>[],
    start: number,
    end: number
): { chroma: Float32Array; bassPc?: number } {
    const chroma = new Float32Array(12);
    let bassPc: number | undefined = undefined;
    let bassMidi: number | undefined = undefined;
    for (const n of notes) {
        const overlap = Math.max(0, Math.min(end, n.endTime) - Math.max(start, n.startTime));
        if (overlap <= 0) continue;
        const velocity = Math.max(1, Math.min(127, n.velocity || 64));
        const weight = overlap * (0.5 + (0.5 * velocity) / 127);
        const pc = ((n.note % 12) + 12) % 12;
        chroma[pc] += weight;
        if (bassMidi === undefined || n.note < bassMidi) {
            bassMidi = n.note;
            bassPc = pc;
        }
    }
    const total = chroma.reduce((a, b) => a + b, 0);
    if (total > 0) for (let i = 0; i < 12; i++) chroma[i] /= total;
    return { chroma, bassPc };
}

/**
 * Pardo–Birmingham–inspired chord estimation via template matching over chroma with bass preference.
 */
export function estimateChordPB(
    chroma: Float32Array,
    bassPc?: number,
    options: ChordEstimatorOptions = {}
): EstimatedChord | undefined {
    const includeTriads = options.includeTriads ?? true;
    const includeDim = options.includeDiminished ?? true;
    const includeAug = options.includeAugmented ?? false;
    const include7 = options.includeSevenths ?? true;
    const preferBassRoot = options.preferBassRoot ?? true;

    type Template = { quality: ChordQuality; mask: number[] };
    const baseTemplates: Template[] = [];
    if (includeTriads) {
        baseTemplates.push(
            { quality: 'maj', mask: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0] },
            { quality: 'min', mask: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0] }
        );
    }
    if (includeDim) baseTemplates.push({ quality: 'dim', mask: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0] });
    if (includeAug) baseTemplates.push({ quality: 'aug', mask: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] });
    if (include7) {
        baseTemplates.push(
            { quality: '7', mask: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
            { quality: 'maj7', mask: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1] },
            { quality: 'min7', mask: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0] },
            { quality: 'm7b5', mask: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0] },
            { quality: 'dim7', mask: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] }
        );
    }

    const toneWeight = 1.0;
    const nonTonePenalty = 0.35;
    const bassBonusRoot = preferBassRoot ? 0.15 : 0.0;
    const bassBonusChordTone = 0.07;

    let best: { root: number; quality: ChordQuality; score: number } | null = null;
    for (let root = 0; root < 12; root++) {
        for (const tmpl of baseTemplates) {
            const tmask = new Array(12).fill(0);
            for (let i = 0; i < 12; i++) if (tmpl.mask[i]) tmask[(i + root) % 12] = 1;
            let toneEnergy = 0;
            let nonToneEnergy = 0;
            for (let pc = 0; pc < 12; pc++) {
                const e = chroma[pc];
                if (tmask[pc]) toneEnergy += e;
                else nonToneEnergy += e;
            }
            let score = toneEnergy * toneWeight - nonToneEnergy * nonTonePenalty;
            if (bassPc !== undefined) {
                if (bassPc === root) score += bassBonusRoot;
                else if (tmask[bassPc]) score += bassBonusChordTone;
            }
            if (!best || score > best.score) best = { root, quality: tmpl.quality, score };
        }
    }
    if (!best) return undefined;
    const scoreIdeal = toneWeight;
    const confidence = Math.max(0, Math.min(1, best.score / scoreIdeal));
    return { root: best.root, quality: best.quality, bassPc, confidence };
}

/**
 * Convenience: estimate chord directly from notes in a time window.
 */
export function estimateChordForWindow(
    notes: Pick<NoteEvent, 'note' | 'startTime' | 'endTime' | 'velocity' | 'channel'>[],
    start: number,
    end: number,
    options: ChordEstimatorOptions = {}
): EstimatedChord | undefined {
    const { chroma, bassPc } = computeChromaFromNotes(notes, start, end);
    return estimateChordPB(chroma, bassPc, options);
}

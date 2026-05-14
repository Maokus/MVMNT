import { NoteEvent } from '@core/midi/note-event';

export type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | '7' | 'maj7' | 'min7' | 'm7b5' | 'dim7' | 'sus2' | 'sus4';

// Interval lookup table: sorted semitone intervals from root → chord quality.
// Intervals are computed mod-12 (within one octave) and sorted ascending.
// Mirrors the musicpy detectTypes database for the chord types we support.
const INTERVAL_DETECT_MAP = new Map<string, ChordQuality>([
    // Triads
    ['4,7', 'maj'],
    ['3,7', 'min'],
    ['3,6', 'dim'],
    ['4,8', 'aug'],
    ['2,7', 'sus2'],
    ['5,7', 'sus4'],
    // Seventh chords
    ['4,7,10', '7'],
    ['4,7,11', 'maj7'],
    ['3,7,10', 'min7'],
    ['3,6,10', 'm7b5'],
    ['3,6,9', 'dim7'],
    // 7sus4
    ['5,7,10', '7'],
]);

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

export function estimateChordForWindow(
    notes: Pick<NoteEvent, 'note' | 'startTime' | 'endTime' | 'velocity' | 'channel'>[],
    start: number,
    end: number,
    options: ChordEstimatorOptions = {}
): EstimatedChord | undefined {
    const { chroma, bassPc } = computeChromaFromNotes(notes, start, end);
    return estimateChordPB(chroma, bassPc, options);
}

/**
 * Musicpy-style chord detection: tries every pitch class as root, computes
 * sorted semitone intervals (mod-12), and performs an exact lookup in the
 * interval→quality table.  Returns the best match (root = bass preferred when
 * preferBassRoot is set), or undefined when no known chord pattern is found.
 */
export function detectChordFromNotes(
    midiNotes: number[],
    bassPc: number | undefined,
    options: ChordEstimatorOptions = {}
): EstimatedChord | undefined {
    if (midiNotes.length === 0) return undefined;

    const includeTriads = options.includeTriads ?? true;
    const includeDim = options.includeDiminished ?? true;
    const includeAug = options.includeAugmented ?? false;
    const include7 = options.includeSevenths ?? true;
    const preferBassRoot = options.preferBassRoot ?? true;

    const allowed = new Set<ChordQuality>();
    if (includeTriads) {
        allowed.add('maj');
        allowed.add('min');
        allowed.add('sus2');
        allowed.add('sus4');
    }
    if (includeDim) {
        allowed.add('dim');
        allowed.add('dim7');
    }
    if (includeAug) allowed.add('aug');
    if (include7) {
        allowed.add('7');
        allowed.add('maj7');
        allowed.add('min7');
        allowed.add('m7b5');
    }

    // Deduplicate: unique pitch classes, remember lowest MIDI note for each
    const pcToMidi = new Map<number, number>();
    for (const n of midiNotes) {
        const pc = ((n % 12) + 12) % 12;
        if (!pcToMidi.has(pc) || n < pcToMidi.get(pc)!) pcToMidi.set(pc, n);
    }
    if (pcToMidi.size < 2) return undefined;

    // Sort pitch classes by their lowest MIDI pitch (bass-first order)
    const pcs = [...pcToMidi.entries()].sort((a, b) => a[1] - b[1]).map(([pc]) => pc);

    let bassRootMatch: { root: number; quality: ChordQuality } | null = null;
    let anyMatch: { root: number; quality: ChordQuality } | null = null;

    for (const root of pcs) {
        const key = pcs
            .filter((pc) => pc !== root)
            .map((pc) => (pc - root + 12) % 12)
            .sort((a, b) => a - b)
            .join(',');
        const quality = INTERVAL_DETECT_MAP.get(key);
        if (quality && allowed.has(quality)) {
            if (anyMatch === null) anyMatch = { root, quality };
            if (bassPc !== undefined && root === bassPc && bassRootMatch === null) {
                bassRootMatch = { root, quality };
            }
        }
    }

    const match = preferBassRoot && bassRootMatch ? bassRootMatch : (anyMatch ?? bassRootMatch);
    if (!match) return undefined;
    return { root: match.root, quality: match.quality, bassPc, confidence: 1.0 };
}

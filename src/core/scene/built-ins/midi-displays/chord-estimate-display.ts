// Chord Estimate Display: estimates current chord using a Pardo–Birmingham-inspired method
import { BoundSceneElement, asNumber, type PropertyTransform } from '@core/scene/runtime/bound-scene-element';
import { EnhancedConfigSchema, type SceneElementInterface } from '@core/scene/runtime/schema';
import { prop, insertElementConfig } from '@core/scene/runtime/schema-builders';
import { propGroup, tab } from '@core/scene/built-ins/schema-groups';
import { applyOpacity } from '@utils/color';
import { Rectangle, RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import {
    type EstimatedChord,
    type MusicpyChordResult,
    type PatternChordResult,
} from '@core/midi/music-theory/chord-estimator';
import {
    buildChordObservation,
    clusterChordOnsets,
    chordKey,
    detectChordFromObservation,
    stabiliseChordFrames,
    type CanonicalChordResult,
    type ChordAnalysisMode,
    type ChordDetectionMethod,
    type ChordTimelineNote,
} from '@core/midi/music-theory/chord-detection-pipeline';
import { PLUGIN_CAPABILITIES } from '@mvmnt-app/plugin-sdk';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/built-ins/define-built-in';

const clampWindowSeconds: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    return numeric === undefined ? undefined : Math.max(0.05, numeric);
};

const clampWindowFuturePercent: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) return undefined;
    return Math.max(0, Math.min(100, numeric));
};

const clampSmoothingMs: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    return numeric === undefined ? undefined : Math.max(0, numeric);
};

type ChordEstimateRuntimeProps = {
    visible: boolean;
    windowSeconds: number;
    windowFuturePercent: number;
    midiTrackId: string | null;
    detectionMethod: ChordDetectionMethod;
    analysisMode?: ChordAnalysisMode;
    bassMode?: 'included' | 'split-note' | 'separate-track';
    bassTrackId?: string | null;
    bassSplitNote?: number;
    includeTriads: boolean;
    includeDiminished: boolean;
    includeAugmented: boolean;
    includeSevenths: boolean;
    preferBassRoot: boolean;
    accidentalStyle?: 'sharps' | 'flats';
    scaleDegreeMode?: boolean;
    scaleRoot?: string;
    showInversion: boolean;
    smoothingMs: number;
    fontFamily: string;
    fontSize?: number;
    chordFontSize?: number;
    detailsFontSize?: number;
    color: string;
    opacity?: number;
    textAlign?: CanvasTextAlign;
    textJustification?: CanvasTextAlign; // legacy — kept for backward compat with saved scenes
    lineSpacing: number;
    showActiveNotes: boolean;
    showChroma: boolean;
    chromaColor?: string;
    chromaOpacity?: number;
    // container props
    showBackground?: boolean;
    backgroundColor?: string;
    backgroundOpacity?: number;
    backgroundPaddingX?: number;
    backgroundPaddingY?: number;
    backgroundCornerRadius?: number;
};

// Chord type name → display symbol (for musicpy label rendering).
const CHORD_TYPE_SYMBOL: Record<string, string> = {
    major: '',
    minor: 'm',
    maj7: 'maj7',
    m7: 'm7',
    '7': '7',
    dim: '°',
    dim7: '°7',
    'half-diminished7': 'ø',
    aug: '+',
    aug7: '+7',
    augmaj7: '+maj7',
    aug6: '+6',
    aug9: '+9',
    augmaj9: '+maj9',
    minormajor7: 'mMaj7',
    minormajor9: 'mMaj9',
    sus: 'sus4',
    sus2: 'sus2',
    '9': '9',
    maj9: 'maj9',
    m9: 'm9',
    '11': '11',
    maj11: 'maj11',
    m11: 'm11',
    '13': '13',
    maj13: 'maj13',
    m13: 'm13',
    '7sus4': '7sus4',
    '7sus2': '7sus2',
    maj7sus4: 'maj7sus4',
    maj7sus2: 'maj7sus2',
    '9sus4': '9sus4',
    '9sus2': '9sus2',
    maj9sus4: 'maj9sus4',
    '13sus4': '13sus4',
    '13sus2': '13sus2',
    maj13sus4: 'maj13sus4',
    maj13sus2: 'maj13sus2',
    add6: '6',
    m6: 'm6',
    add2: 'add2',
    add9: 'add9',
    madd2: 'madd2',
    madd9: 'madd9',
    add4: 'add4',
    madd4: 'madd4',
    '69': '6/9',
    m69: 'm6/9',
    '6sus4': '6sus4',
    '6sus2': '6sus2',
    maj7b5: 'maj7♭5',
    'maj7#11': 'maj7♯11',
    'maj9#11': 'maj9♯11',
    'maj13#11': 'maj13♯11',
    '13#11': '13♯11',
    '5': '5',
    '5(+octave)': '5',
    germansixth: '(Ger6)',
    frenchsixth: '(Fr6)',
    'dim(Maj7)': '°Maj7',
    fifth_9th: '(no3)add9',
};

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROOT_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SCALE_ROOT_CHOICES = [
    { value: 'C', label: 'C' },
    { value: 'C#', label: 'C♯ / D♭' },
    { value: 'D', label: 'D' },
    { value: 'D#', label: 'D♯ / E♭' },
    { value: 'E', label: 'E' },
    { value: 'F', label: 'F' },
    { value: 'F#', label: 'F♯ / G♭' },
    { value: 'G', label: 'G' },
    { value: 'G#', label: 'G♯ / A♭' },
    { value: 'A', label: 'A' },
    { value: 'A#', label: 'A♯ / B♭' },
    { value: 'B', label: 'B' },
];
const CHROMATIC_SCALE_DEGREES = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];

/** Formats a pitch class relative to a major scale root, including chromatic degrees. */
export function formatScaleDegree(pitchClass: number, scaleRoot: string = 'C'): string {
    const scaleRootPitchClass = ROOT_NAMES.indexOf(scaleRoot);
    const root = scaleRootPitchClass === -1 ? 0 : scaleRootPitchClass;
    const offset = (((pitchClass - root) % 12) + 12) % 12;
    return CHROMATIC_SCALE_DEGREES[offset];
}

export class ChordEstimateDisplayElement extends BoundSceneElement {
    constructor(id: string = 'chordEstimateDisplay', config: { [key: string]: any } = {}) {
        super('chordEstimateDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Chord Estimate Display',
                description:
                    'Estimates the current chord (Pardo–Birmingham-inspired) and displays it as text (timeline-backed)',
                category: 'MIDI Displays',
                presets: [
                    {
                        id: 'musicpyFull',
                        label: 'Musicpy Full',
                        values: {
                            detectionMethod: 'musicpy',
                            preferBassRoot: true,
                            showInversion: true,
                            smoothingMs: 180,
                            wholeDetect: false,
                            polyChordFirst: false,
                        },
                    },
                    {
                        id: 'patternScoring',
                        label: 'Pattern Scoring',
                        values: {
                            detectionMethod: 'pattern-scoring',
                            preferBassRoot: true,
                            showInversion: true,
                            smoothingMs: 180,
                        },
                    },
                    {
                        id: 'bandDefault',
                        label: 'Band Default',
                        values: {
                            detectionMethod: 'simple-interval',
                            includeTriads: true,
                            includeDiminished: true,
                            includeAugmented: false,
                            includeSevenths: true,
                            preferBassRoot: true,
                            showInversion: true,
                            smoothingMs: 160,
                        },
                    },
                    {
                        id: 'jazzExtended',
                        label: 'Jazz Extended',
                        values: {
                            detectionMethod: 'musicpy',
                            includeTriads: true,
                            includeDiminished: true,
                            includeAugmented: true,
                            includeSevenths: true,
                            preferBassRoot: false,
                            showInversion: true,
                            smoothingMs: 240,
                        },
                    },
                    {
                        id: 'simpleTriads',
                        label: 'Simple Triads',
                        values: {
                            detectionMethod: 'simple-interval',
                            includeTriads: true,
                            includeDiminished: false,
                            includeAugmented: false,
                            includeSevenths: false,
                            preferBassRoot: true,
                            showInversion: false,
                            smoothingMs: 120,
                        },
                    },
                    {
                        id: 'darkStage',
                        label: 'Dark Stage',
                        values: {
                            fontFamily: 'BuiltIn:inter|600',
                            chordFontSize: 54,
                            color: '#f8fafc',
                            lineSpacing: 8,
                        },
                    },
                    {
                        id: 'glassOverlay',
                        label: 'Glass Overlay',
                        values: {
                            fontFamily: 'BuiltIn:inter|400',
                            chordFontSize: 42,
                            color: '#cbd5f5',
                            lineSpacing: 4,
                        },
                    },
                    {
                        id: 'boldBroadcast',
                        label: 'Broadcast Bold',
                        values: {
                            fontFamily: 'BuiltIn:inter|700',
                            chordFontSize: 60,
                            color: '#f97316',
                            lineSpacing: 10,
                        },
                    },
                ],
            },
            [
                tab.content([
                    {
                        id: 'chordSource',
                        label: 'Source',
                        collapsed: false,
                        description: 'Choose the MIDI track and analysis window for detection.',
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track'),
                            prop.select('analysisMode', 'Analysis Input', 'active', [
                                { value: 'active', label: 'Active Notes at Playhead' },
                                { value: 'windowed', label: 'Windowed Chroma' },
                            ]),
                            prop.select('bassMode', 'Bass Source', 'included', [
                                { value: 'included', label: 'Include in Harmonic Notes' },
                                { value: 'split-note', label: 'Separate Below Split' },
                                { value: 'separate-track', label: 'Separate MIDI Track' },
                            ]),
                            prop.midiTrack('bassTrackId', 'Bass MIDI Track', {
                                visibleWhen: [{ key: 'bassMode', equals: 'separate-track' }],
                            }),
                            prop.number('bassSplitNote', 'Bass Split Note', 48, {
                                min: 0,
                                max: 127,
                                step: 1,
                                visibleWhen: [{ key: 'bassMode', equals: 'split-note' }],
                            }),
                            {
                                key: 'windowSeconds',
                                type: 'number',
                                label: 'Analysis Window (s)',
                                default: 0.1,
                                step: 0.05,
                                runtime: { transform: clampWindowSeconds, defaultValue: 0.1 },
                                visibleWhen: [{ key: 'analysisMode', equals: 'windowed' }],
                            },
                            {
                                key: 'windowFuturePercent',
                                type: 'number',
                                label: 'Future Window (%)',
                                default: 0,
                                min: 0,
                                max: 100,
                                step: 5,
                                runtime: { transform: clampWindowFuturePercent, defaultValue: 0 },
                                visibleWhen: [{ key: 'analysisMode', equals: 'windowed' }],
                            },
                            prop.number('layoutWidth', 'Width (px)', 400, { min: 1, step: 1 }),
                            prop.number('layoutHeight', 'Layout Height (px)', 100, { min: 1, step: 1 }),
                        ],
                    },
                    {
                        id: 'estimation',
                        label: 'Estimation',
                        collapsed: false,
                        description: 'Refine which chord qualities are considered during detection.',
                        properties: [
                            prop.select('detectionMethod', 'Detection Method', 'pattern-scoring', [
                                { value: 'pattern-scoring', label: 'Pattern Scoring (jazz/extended)' },
                                { value: 'musicpy', label: 'Musicpy Full' },
                                { value: 'template-match', label: 'Template Match' },
                                { value: 'simple-interval', label: 'Simple Interval' },
                            ]),
                            prop.boolean('includeTriads', 'Allow Triads (maj/min)', true, {
                                visibleWhen: [
                                    { key: 'detectionMethod', notEquals: 'musicpy' },
                                    { key: 'detectionMethod', notEquals: 'pattern-scoring' },
                                ],
                            }),
                            prop.boolean('includeDiminished', 'Allow Diminished', true, {
                                visibleWhen: [
                                    { key: 'detectionMethod', notEquals: 'musicpy' },
                                    { key: 'detectionMethod', notEquals: 'pattern-scoring' },
                                ],
                            }),
                            prop.boolean('includeAugmented', 'Allow Augmented', false, {
                                visibleWhen: [
                                    { key: 'detectionMethod', notEquals: 'musicpy' },
                                    { key: 'detectionMethod', notEquals: 'pattern-scoring' },
                                ],
                            }),
                            prop.boolean('includeSevenths', 'Allow 7ths', true, {
                                visibleWhen: [
                                    { key: 'detectionMethod', notEquals: 'musicpy' },
                                    { key: 'detectionMethod', notEquals: 'pattern-scoring' },
                                ],
                            }),
                            prop.boolean('preferBassRoot', 'Prefer Root in Bass', true),
                            prop.boolean('showInversion', 'Show Inversion (slash)', true),
                            prop.select('accidentalStyle', 'Accidental Style', 'sharps', [
                                { value: 'sharps', label: 'Sharps (C#, D#…)' },
                                { value: 'flats', label: 'Flats (Db, Eb…)' },
                            ]),
                            prop.boolean('scaleDegreeMode', 'Scale Degree Mode', false, {
                                description: 'Show chord roots as degrees of the selected major scale.',
                            }),
                            prop.select('scaleRoot', 'Scale Root', 'C', SCALE_ROOT_CHOICES, {
                                visibleWhen: [{ key: 'scaleDegreeMode', equals: true }],
                            }),
                            {
                                key: 'smoothingMs',
                                type: 'number',
                                label: 'Hold Chord (ms)',
                                default: 100,
                                step: 10,
                                runtime: { transform: clampSmoothingMs, defaultValue: 1 },
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'appearance',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.color('color', 'Text Color', '#ffffff'),
                            prop.number('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'opacity' } },
                            { kind: 'property', propertyKey: 'opacity' },
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            prop.font('fontFamily', 'Font Family', 'BuiltIn:inter|400'),
                            {
                                key: 'chordFontSize',
                                type: 'number',
                                label: 'Chord Font Size (px)',
                                default: 48,
                                step: 1,
                                runtime: { transform: asNumber },
                            },
                            {
                                key: 'detailsFontSize',
                                type: 'number',
                                label: 'Details Font Size (px)',
                                default: 24,
                                step: 1,
                                runtime: { transform: asNumber },
                            },
                            prop.select('textAlign', 'Text Alignment', 'left', [
                                { value: 'left', label: 'Left' },
                                { value: 'center', label: 'Center' },
                                { value: 'right', label: 'Right' },
                            ]),
                            prop.number('lineSpacing', 'Line Spacing (px)', 6, { step: 1 }),
                            prop.boolean('showActiveNotes', 'Show Active Notes', true),
                            prop.boolean('showChroma', 'Show Chroma Chart', true),
                            prop.color('chromaColor', 'Chroma Chart Color', '#ffffff', {
                                visibleWhen: [{ key: 'showChroma', equals: true }],
                            }),
                            prop.number('chromaOpacity', 'Chroma Chart Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                                visibleWhen: [{ key: 'showChroma', equals: true }],
                            }),
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'chromaOpacity' } },
                            { kind: 'property', propertyKey: 'chromaOpacity' },
                        ],
                    },
                    propGroup.container(),
                ]),
            ]
        );
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps() as ChordEstimateRuntimeProps;

        const {
            windowSeconds,
            windowFuturePercent,
            midiTrackId,
            detectionMethod,
            analysisMode,
            bassMode,
            bassTrackId,
            bassSplitNote,
            includeTriads,
            includeDiminished,
            includeAugmented,
            includeSevenths,
            preferBassRoot,
            showInversion,
            scaleDegreeMode,
            scaleRoot,
            smoothingMs,
            fontFamily: configuredFont,
            chordFontSize: chordFontSizeRaw,
            detailsFontSize: detailsFontSizeRaw,
            color: rawColor,
            lineSpacing,
            showActiveNotes,
            showChroma,
        } = props;

        const method: ChordDetectionMethod = detectionMethod ?? 'pattern-scoring';
        const color = applyOpacity(rawColor ?? '#ffffff', props.opacity ?? 1);
        const justify = (props.textAlign ?? props.textJustification ?? 'left') as CanvasTextAlign;

        const layoutWidth = (props as any).layoutWidth ?? 400;
        const layoutHeight = (props as any).layoutHeight ?? 100;
        const layoutRect = new Rectangle(0, 0, layoutWidth, layoutHeight, { fillColor: null });
        layoutRect.setLayoutParticipation('include');

        const renderObjects: RenderObject[] = [layoutRect];

        const t = Math.max(0, targetTime);
        const holdMilliseconds = Math.max(0, smoothingMs ?? 0);
        const effectiveWindowSeconds = Math.max(0.05, windowSeconds ?? 0.1);
        const holdSeconds = holdMilliseconds / 1000;
        const queryStart = Math.max(
            0,
            t - Math.max(holdSeconds, analysisMode === 'windowed' ? effectiveWindowSeconds : 0)
        );
        const queryEnd = t + Math.max(0.000_001, analysisMode === 'windowed' ? effectiveWindowSeconds : 0.000_001);
        const noteEvents: ChordTimelineNote[] = [];
        const bassEvents: ChordTimelineNote[] = [];
        const timeline = getEnginePrivateContext(this).timeline;
        if (midiTrackId && timeline) {
            const selected = timeline.selectNotes({
                trackIds: [midiTrackId],
                startSeconds: queryStart,
                endSeconds: queryEnd,
            });
            const notes = selected.ok ? selected.value : [];
            for (const n of notes) {
                noteEvents.push({
                    note: n.note,
                    channel: n.channel,
                    startTime: n.startSeconds,
                    endTime: n.endSeconds,
                    velocity: n.velocity || 0,
                });
            }
        }
        if (bassMode === 'separate-track' && bassTrackId && timeline) {
            const selected = timeline.selectNotes({
                trackIds: [bassTrackId],
                startSeconds: queryStart,
                endSeconds: queryEnd,
            });
            for (const n of selected.ok ? selected.value : []) {
                bassEvents.push({
                    note: n.note,
                    channel: n.channel,
                    startTime: n.startSeconds,
                    endTime: n.endSeconds,
                    velocity: n.velocity || 0,
                });
            }
        }
        const harmonicNotes =
            bassMode === 'split-note' ? noteEvents.filter((note) => note.note >= (bassSplitNote ?? 48)) : noteEvents;
        const splitBassNotes =
            bassMode === 'split-note' ? noteEvents.filter((note) => note.note < (bassSplitNote ?? 48)) : [];
        const observationOptions = {
            analysisMode: analysisMode ?? 'active',
            windowSeconds: effectiveWindowSeconds,
            windowFuturePercent,
        } as const;

        const detectionOptions = {
            includeTriads,
            includeDiminished,
            includeAugmented,
            includeSevenths,
            preferBassRoot,
        };
        const frameTimes = [
            ...new Set([...clusterChordOnsets(harmonicNotes.flatMap((note) => [note.startTime, note.endTime])), t]),
        ]
            .filter((time) => time >= queryStart && time <= t)
            .sort((left, right) => left - right);
        let previousChordKey: string | undefined;
        const frames = frameTimes.map((time) => {
            const observation = buildChordObservation({
                targetTime: time,
                notes: harmonicNotes,
                bassNotes:
                    bassMode === 'separate-track'
                        ? bassEvents
                        : bassMode === 'split-note'
                          ? splitBassNotes
                          : harmonicNotes,
                ...observationOptions,
            });
            const result = detectChordFromObservation(observation, method, { ...detectionOptions, previousChordKey });
            previousChordKey = chordKey(result) ?? previousChordKey;
            return { time, result };
        });
        const stableResults = stabiliseChordFrames(frames, holdMilliseconds);
        const result = stableResults[stableResults.length - 1];
        const chord = result?.chord;
        const rawMusicpy = result?.metadata.kind === 'musicpy' ? result.metadata.value : undefined;
        const rawPattern = result?.metadata.kind === 'pattern' ? result.metadata.value : undefined;
        const observation = buildChordObservation({
            targetTime: t,
            notes: harmonicNotes,
            bassNotes:
                bassMode === 'separate-track' ? bassEvents : bassMode === 'split-note' ? splitBassNotes : harmonicNotes,
            ...observationOptions,
        });
        const chroma = observation.chroma;
        const activeNotes = observation.notes;

        // Appearance
        const fontSelection = configuredFont ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '600').toString();
        const chordFontSize = chordFontSizeRaw ?? 48;
        const detailsFontSize = detailsFontSizeRaw ?? 24;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const fontChord = `${fontWeight} ${chordFontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const fontDetails = `${fontWeight} ${detailsFontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        let y = 0;
        let label: string;
        if (!chord) {
            label = 'N.C.';
        } else if (method === 'musicpy' && rawMusicpy) {
            label = this._formatMusicpyChordLabel(
                rawMusicpy,
                showInversion,
                props.accidentalStyle ?? 'sharps',
                scaleDegreeMode,
                scaleRoot
            );
        } else if (method === 'pattern-scoring' && rawPattern) {
            label = this._formatPatternChordLabel(
                rawPattern,
                showInversion,
                props.accidentalStyle ?? 'sharps',
                scaleDegreeMode,
                scaleRoot
            );
        } else {
            label = this._formatChordLabel(
                chord,
                showInversion,
                props.accidentalStyle ?? 'sharps',
                scaleDegreeMode,
                scaleRoot
            );
        }

        // When a layout box is active, anchor text within it so alignment matches the visible box.
        // Always use layoutWidth for text positioning regardless of showBackground — the layout box
        // defines the element's extent and text should align to it.
        const textXForJustify = (j: CanvasTextAlign): number => {
            if (j === 'center') return layoutWidth / 2;
            if (j === 'right' || j === 'end') return layoutWidth;
            return 0;
        };
        const textX = textXForJustify(justify);

        const title = new Text(textX, y, label, fontChord, { color, align: justify, baseline: 'top' });
        title.setLayoutParticipation('exclude');
        renderObjects.push(title);
        y += chordFontSize + lineSpacing;

        // Active notes line
        if (showActiveNotes) {
            const allUniqueNotes = Array.from(new Set(activeNotes.map((n) => n.note))).sort((a, b) => a - b);
            const MAX_NOTES = 8;
            const truncated = allUniqueNotes.length > MAX_NOTES;
            const displayNotes = truncated ? allUniqueNotes.slice(0, MAX_NOTES) : allUniqueNotes;
            const uniqueNotes: { length: number; map: (fn: (n: number) => any) => any[] } = {
                length: displayNotes.length,
                map: (fn: (n: number) => any) => {
                    const mapped = displayNotes.map(fn);
                    if (truncated) mapped.push('...');
                    return mapped;
                },
            };
            const noteName = (midiNote: number): string => {
                const names = props.accidentalStyle === 'flats' ? ROOT_NAMES_FLAT : ROOT_NAMES;
                const octave = Math.floor(midiNote / 12) - 1;
                const name = names[midiNote % 12];
                return `${name}${octave}`;
            };
            const noteLine = uniqueNotes.length
                ? `Notes: ${uniqueNotes.map((n) => noteName(n)).join(' ')}`
                : 'Notes: —';
            const ln = new Text(textX, y, noteLine, fontDetails, { color, align: justify, baseline: 'top' });
            ln.setLayoutParticipation('exclude');
            renderObjects.push(ln);
            y += detailsFontSize + lineSpacing;
        }

        // Chroma line (12 bins with names)
        if (showChroma) {
            const chromaColorRaw = props.chromaColor ?? '#ffffff';
            const chromaOpacityScale = props.chromaOpacity ?? 1;
            const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const rectWidth = 20;
            const spacing = 30;
            const totalWidth = (names.length - 1) * spacing + rectWidth;
            let startX = textX;
            if (justify === 'center') startX = textX - totalWidth / 2;
            else if (justify === 'right' || justify === 'end') startX = textX - totalWidth;
            for (let i = 0; i < names.length; i++) {
                const rectX = startX + i * spacing;
                const rect = new Rectangle(rectX, y, rectWidth, 20, {
                    fillColor: applyOpacity(chromaColorRaw, chroma[i] * chromaOpacityScale),
                });
                rect.setLayoutParticipation('exclude');
                renderObjects.push(rect);
            }
            y += 20 + lineSpacing;
        }

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bgHeight = y + paddingY * 2;
            const bg = new Rectangle(-paddingX, -paddingY, layoutWidth + paddingX * 2, bgHeight, {
                fillColor: bgColor,
            });
            if (props.backgroundCornerRadius) bg.cornerRadius = props.backgroundCornerRadius;
            bg.setLayoutParticipation('exclude');
            renderObjects.splice(1, 0, bg);
        }

        return renderObjects;
    }

    private _formatMusicpyChordLabel(
        raw: MusicpyChordResult,
        showInversion: boolean,
        accidentalStyle: 'sharps' | 'flats' = 'sharps',
        scaleDegreeMode = false,
        scaleRoot = 'C'
    ): string {
        const rootNames = accidentalStyle === 'flats' ? ROOT_NAMES_FLAT : ROOT_NAMES;
        const formatRoot = (pitchClass: number) =>
            scaleDegreeMode ? formatScaleDegree(pitchClass, scaleRoot) : rootNames[pitchClass];
        if (raw.isPolychord && raw.upperChord) {
            const upper = this._formatMusicpyChordLabel(
                raw.upperChord,
                false,
                accidentalStyle,
                scaleDegreeMode,
                scaleRoot
            );
            const lowerRoot = formatRoot(raw.root);
            const lowerSymbol = CHORD_TYPE_SYMBOL[raw.chordType] ?? raw.chordType;
            return `${upper}/${lowerRoot}${lowerSymbol}`;
        }

        const root = formatRoot(raw.root);
        const symbol = CHORD_TYPE_SYMBOL[raw.chordType] ?? raw.chordType;
        let label = `${root}${symbol}`;

        if (showInversion && raw.bassNote !== null) {
            label += `/${formatRoot(raw.bassNote)}`;
        }

        const suffixes: string[] = [];
        if (raw.omits.length > 0) suffixes.push(`omit${raw.omits.join(',')}`);
        if (raw.alterations.length > 0) suffixes.push(raw.alterations.join(','));
        if (suffixes.length > 0) label += `(${suffixes.join(' ')})`;

        return label;
    }

    private _formatChordLabel(
        ch: EstimatedChord,
        showInversion: boolean,
        accidentalStyle: 'sharps' | 'flats' = 'sharps',
        scaleDegreeMode = false,
        scaleRoot = 'C'
    ): string {
        const rootNames = accidentalStyle === 'flats' ? ROOT_NAMES_FLAT : ROOT_NAMES;
        const formatRoot = (pitchClass: number) =>
            scaleDegreeMode ? formatScaleDegree(pitchClass, scaleRoot) : rootNames[pitchClass];
        const root = formatRoot(ch.root);
        let qual: string = '';
        switch (ch.quality) {
            case 'maj':
                qual = '';
                break;
            case 'min':
                qual = 'm';
                break;
            case 'dim':
                qual = 'dim';
                break;
            case 'aug':
                qual = 'aug';
                break;
            case '7':
                qual = '7';
                break;
            case 'maj7':
                qual = 'maj7';
                break;
            case 'min7':
                qual = 'm7';
                break;
            case 'm7b5':
                qual = 'm7♭5';
                break;
            case 'dim7':
                qual = 'dim7';
                break;
            case 'sus2':
                qual = 'sus2';
                break;
            case 'sus4':
                qual = 'sus4';
                break;
            case 'ext':
                qual = '';
                break;
        }
        let label = `${root}${qual}`;
        if (showInversion && ch.bassPc !== undefined && ch.bassPc !== ch.root) {
            label += `/${formatRoot(ch.bassPc)}`;
        }
        return label;
    }

    private _formatPatternChordLabel(
        result: PatternChordResult,
        showInversion: boolean,
        accidentalStyle: 'sharps' | 'flats' = 'sharps',
        scaleDegreeMode = false,
        scaleRoot = 'C'
    ): string {
        const rootNames = accidentalStyle === 'flats' ? ROOT_NAMES_FLAT : ROOT_NAMES;
        const formatRoot = (pitchClass: number) =>
            scaleDegreeMode ? formatScaleDegree(pitchClass, scaleRoot) : rootNames[pitchClass];
        let label = `${formatRoot(result.chord.root)}${result.symbol}`;
        if (showInversion && result.chord.bassPc !== undefined && result.chord.bassPc !== result.chord.root) {
            label += `/${formatRoot(result.chord.bassPc)}`;
        }
        return label;
    }

    // Estimation utilities imported from music-theory module

    dispose(): void {
        super.dispose();
    }
}

export const chordEstimateDisplay = defineHostAdaptedBuiltIn(
    {
        type: 'chordEstimateDisplay',
        metadata: {
            name: 'Chord Estimate Display',
            description: 'Timeline-backed chord estimation',
            category: 'MIDI Displays',
        },
        capabilities: { required: ['timeline.read'], optional: [] },
    },
    ChordEstimateDisplayElement
);

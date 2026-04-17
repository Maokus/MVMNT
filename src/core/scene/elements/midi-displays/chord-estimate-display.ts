// Chord Estimate Display: estimates current chord using a Pardo–Birmingham-inspired method
import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { EnhancedConfigSchema, type SceneElementInterface } from '@core/types.js';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { Rectangle, RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { computeChromaFromNotes, estimateChordPB, type EstimatedChord } from '@core/midi/music-theory/chord-estimator';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

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
    includeTriads: boolean;
    includeDiminished: boolean;
    includeAugmented: boolean;
    includeSevenths: boolean;
    preferBassRoot: boolean;
    showInversion: boolean;
    smoothingMs: number;
    fontFamily: string;
    fontSize: number;
    chordFontSize?: number;
    detailsFontSize?: number;
    color: string;
    textJustification: CanvasTextAlign;
    lineSpacing: number;
    showActiveNotes: boolean;
    showChroma: boolean;
};

export class ChordEstimateDisplayElement extends SceneElement {
    private _lastChord?: EstimatedChord;
    private _lastTime = -1;

    constructor(id: string = 'chordEstimateDisplay', config: { [key: string]: any } = {}) {
        super('chordEstimateDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Chord Estimate Display',
            description:
                'Estimates the current chord (Pardo–Birmingham-inspired) and displays it as text (timeline-backed)',
            category: 'MIDI Displays',
        }, [
            {
                id: 'chordSource',
                label: 'Source',
                variant: 'basic',
                collapsed: false,
                description: 'Choose the MIDI track and analysis window for detection.',
                properties: [
                    prop.midiTrack('midiTrackId', 'MIDI Track'),
                    {
                        key: 'windowSeconds',
                        type: 'number',
                        label: 'Analysis Window (s)',
                        default: 0.1,
                        step: 0.05,
                        runtime: { transform: clampWindowSeconds, defaultValue: 0.1 },
                    },
                    {
                        key: 'windowFuturePercent',
                        type: 'number',
                        label: 'Future Window (%)',
                        default: 0,
                        step: 5,
                        runtime: { transform: clampWindowFuturePercent, defaultValue: 0 },
                    },
                ],
            },
            {
                id: 'estimation',
                label: 'Estimation',
                variant: 'advanced',
                collapsed: true,
                description: 'Refine which chord qualities are considered during detection.',
                properties: [
                    prop.boolean('includeTriads', 'Allow Triads (maj/min)', true),
                    prop.boolean('includeDiminished', 'Allow Diminished', true),
                    prop.boolean('includeAugmented', 'Allow Augmented', false),
                    prop.boolean('includeSevenths', 'Allow 7ths', true),
                    prop.boolean('preferBassRoot', 'Prefer Root in Bass', true),
                    prop.boolean('showInversion', 'Show Inversion (slash)', true),
                    {
                        key: 'smoothingMs',
                        type: 'number',
                        label: 'Hold Chord (ms)',
                        default: 100,
                        step: 10,
                        runtime: { transform: clampSmoothingMs, defaultValue: 1 },
                    },
                ],
                presets: [
                    {
                        id: 'bandDefault',
                        label: 'Band Default',
                        values: {
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
                            includeTriads: true,
                            includeDiminished: false,
                            includeAugmented: false,
                            includeSevenths: false,
                            preferBassRoot: true,
                            showInversion: false,
                            smoothingMs: 120,
                        },
                    },
                ],
            },
            {
                id: 'appearance',
                label: 'Typography',
                variant: 'basic',
                collapsed: false,
                description: 'Adjust how chords and details are rendered.',
                properties: [
                    prop.select('textJustification', 'Text Alignment', 'left', [
                        { value: 'left', label: 'Left' },
                        { value: 'right', label: 'Right' },
                    ]),
                    prop.font('fontFamily', 'Font Family', 'Inter'),
                    prop.number('fontSize', 'Label Font Size (px)', 48, { step: 1 }),
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
                    prop.color('color', 'Text Color', '#ffffff'),
                    prop.number('lineSpacing', 'Line Spacing (px)', 6, { step: 1 }),
                    prop.boolean('showActiveNotes', 'Show Active Notes', true),
                    prop.boolean('showChroma', 'Show Chroma Chart', true),
                ],
                presets: [
                    {
                        id: 'darkStage',
                        label: 'Dark Stage',
                        values: { fontFamily: 'Inter|600', chordFontSize: 54, color: '#f8fafc', lineSpacing: 8 },
                    },
                    {
                        id: 'glassOverlay',
                        label: 'Glass Overlay',
                        values: { fontFamily: 'Inter|400', chordFontSize: 42, color: '#cbd5f5', lineSpacing: 4 },
                    },
                    {
                        id: 'boldBroadcast',
                        label: 'Broadcast Bold',
                        values: { fontFamily: 'Inter|700', chordFontSize: 60, color: '#f97316', lineSpacing: 10 },
                    },
                ],
            },
        ]);
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps() as ChordEstimateRuntimeProps;

        if (!props.visible) return [];

        const {
            windowSeconds,
            windowFuturePercent,
            midiTrackId,
            includeTriads,
            includeDiminished,
            includeAugmented,
            includeSevenths,
            preferBassRoot,
            showInversion,
            smoothingMs,
            fontFamily: configuredFont,
            fontSize,
            chordFontSize: chordFontSizeRaw,
            detailsFontSize: detailsFontSizeRaw,
            color,
            textJustification,
            lineSpacing,
            showActiveNotes,
            showChroma,
        } = props;

        const renderObjects: RenderObject[] = [];

        // Effective time
        const t = Math.max(0, targetTime);

        // Estimation window
        const futureRatio = Math.max(0, Math.min(1, windowFuturePercent / 100));
        const pastRatio = 1 - futureRatio;
        let start = t - windowSeconds * pastRatio;
        let end = t + windowSeconds * futureRatio;
        if (start < 0) {
            const deficit = -start;
            start = 0;
            end += deficit;
        }

        // Active notes and chroma via plugin host API
        const noteEvents: { note: number; channel: number; startTime: number; endTime: number; velocity: number }[] =
            [];
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        if (midiTrackId && api && status === 'ok') {
            const notes = api.timeline.selectNotesInWindow({ trackIds: [midiTrackId], startSec: start, endSec: end });
            for (const n of notes) {
                noteEvents.push({
                    note: n.note,
                    channel: n.channel,
                    startTime: n.startTime,
                    endTime: n.endTime,
                    velocity: n.velocity || 0,
                });
            }
        }
        const { chroma, bassPc } = computeChromaFromNotes(noteEvents, start, end);

        // Estimate chord
        let chord: EstimatedChord | undefined;
        const energy = chroma.reduce((a, b) => a + b, 0);
        if (energy > 0) {
            chord = estimateChordPB(chroma, bassPc, {
                includeTriads,
                includeDiminished,
                includeAugmented,
                includeSevenths,
                preferBassRoot,
            });
        }

        // Simple temporal smoothing to reduce flicker
        if (chord) {
            if (this._lastChord && this._lastTime >= 0) {
                const dtMs = Math.abs(t - this._lastTime) * 1000;
                if (
                    dtMs < smoothingMs &&
                    this._lastChord.confidence > 0.2 &&
                    chord.confidence < this._lastChord.confidence * 1.0
                ) {
                    chord = this._lastChord; // hold previous
                }
            }
            this._lastChord = chord;
            this._lastTime = t;
        }

        // Appearance
        const fontSelection = configuredFont ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '600').toString();
        const chordFontSize = chordFontSizeRaw ?? fontSize;
        const detailsFontSize = detailsFontSizeRaw ?? Math.max(6, Math.round(fontSize * 0.5));
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const fontChord = `${fontWeight} ${chordFontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const fontDetails = `${fontWeight} ${detailsFontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const justify = textJustification;

        let y = 0;
        const label = chord ? this._formatChordLabel(chord, showInversion) : 'N.C.';
        const title = new Text(0, y, label, fontChord, color, justify, 'top');
        renderObjects.push(title);
        y += chordFontSize + lineSpacing;

        // Active notes line (unique MIDI notes overlapping window)
        if (showActiveNotes) {
            const allUniqueNotes = Array.from(new Set(noteEvents.map((n) => n.note))).sort((a, b) => a - b);
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
                const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = Math.floor(midiNote / 12) - 1;
                const name = names[midiNote % 12];
                return `${name}${octave}`;
            };
            const noteLine = uniqueNotes.length
                ? `Notes: ${uniqueNotes.map((n) => noteName(n)).join(' ')}`
                : 'Notes: —';
            const ln = new Text(0, y, noteLine, fontDetails, color, justify, 'top');
            ln.setIncludeInLayoutBounds(false);
            renderObjects.push(ln);
            y += detailsFontSize + lineSpacing;
        }

        // Chroma line (12 bins with names)
        if (showChroma) {
            const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const rectWidth = 20;
            const spacing = 30;
            const totalWidth = (names.length - 1) * spacing + rectWidth;
            let startX = 0;
            if (justify === 'center') startX = -totalWidth / 2;
            else if (justify === 'right' || justify === 'end') startX = -totalWidth;
            for (let i = 0; i < names.length; i++) {
                const rectX = startX + i * spacing;
                const rect = new Rectangle(rectX, y, rectWidth, 20, `rgba(255,255,255,${chroma[i]})`);
                renderObjects.push(rect);
            }
            y += detailsFontSize + lineSpacing;
        }

        return renderObjects;
    }

    private _formatChordLabel(ch: EstimatedChord, showInversion: boolean): string {
        const rootNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const root = rootNames[ch.root];
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
        }
        let label = `${root}${qual}`;
        if (showInversion && ch.bassPc !== undefined && ch.bassPc !== ch.root) {
            label += `/${rootNames[ch.bassPc]}`;
        }
        return label;
    }

    // Estimation utilities imported from music-theory module

    dispose(): void {
        super.dispose();
    }
}

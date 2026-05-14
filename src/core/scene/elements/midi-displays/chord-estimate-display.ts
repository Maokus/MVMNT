// Chord Estimate Display: estimates current chord using a Pardo–Birmingham-inspired method
import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { EnhancedConfigSchema, type SceneElementInterface } from '@core/types.js';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { applyOpacity } from '@utils/color';
import { Rectangle, RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import {
    computeChromaFromNotes,
    detectChordFromNotes,
    estimateChordPB,
    type EstimatedChord,
} from '@core/midi/music-theory/chord-estimator';
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

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

export class ChordEstimateDisplayElement extends SceneElement {
    private _lastChord?: EstimatedChord;
    private _lastTime = -1;

    constructor(id: string = 'chordEstimateDisplay', config: { [key: string]: any } = {}) {
        super('chordEstimateDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Chord Estimate Display',
                description:
                    'Estimates the current chord (Pardo–Birmingham-inspired) and displays it as text (timeline-backed)',
                category: 'MIDI Displays',
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
                    {
                        id: 'darkStage',
                        label: 'Dark Stage',
                        values: {
                            fontFamily: 'Inter|600',
                            chordFontSize: 54,
                            color: '#f8fafc',
                            lineSpacing: 8,
                        },
                    },
                    {
                        id: 'glassOverlay',
                        label: 'Glass Overlay',
                        values: {
                            fontFamily: 'Inter|400',
                            chordFontSize: 42,
                            color: '#cbd5f5',
                            lineSpacing: 4,
                        },
                    },
                    {
                        id: 'boldBroadcast',
                        label: 'Broadcast Bold',
                        values: {
                            fontFamily: 'Inter|700',
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
                                min: 0,
                                max: 100,
                                step: 5,
                                runtime: { transform: clampWindowFuturePercent, defaultValue: 0 },
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
                    },
                ]),
                tab.appearance([
                    {
                        id: 'appearance',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.color('color', 'Text Color', '#ffffff'),
                            prop.range('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            prop.font('fontFamily', 'Font Family', 'Inter'),
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
                            prop.range('chromaOpacity', 'Chroma Chart Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                                visibleWhen: [{ key: 'showChroma', equals: true }],
                            }),
                        ],
                    },
                    propGroup.container(),
                ]),
            ]
        );
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
            chordFontSize: chordFontSizeRaw,
            detailsFontSize: detailsFontSizeRaw,
            color: rawColor,
            lineSpacing,
            showActiveNotes,
            showChroma,
        } = props;

        const color = applyOpacity(rawColor ?? '#ffffff', props.opacity ?? 1);
        const justify = (props.textAlign ?? props.textJustification ?? 'left') as CanvasTextAlign;

        const layoutWidth = (props as any).layoutWidth ?? 400;
        const layoutHeight = (props as any).layoutHeight ?? 100;
        const layoutRect = new Rectangle(0, 0, layoutWidth, layoutHeight, null, null, 0);
        layoutRect.setIncludeInLayoutBounds(true);

        const renderObjects: RenderObject[] = [layoutRect];

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
        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        if (midiTrackId && host.ok) {
            const notes = host.api.timeline.selectNotesInWindow({
                trackIds: [midiTrackId],
                startSec: start,
                endSec: end,
            });
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

        // Musicpy-style exact interval detection, with PB template-matching as fallback
        const detectionOptions = {
            includeTriads,
            includeDiminished,
            includeAugmented,
            includeSevenths,
            preferBassRoot,
        };
        let chord: EstimatedChord | undefined;
        const midiNoteNumbers = noteEvents.map((n) => n.note);
        const energy = chroma.reduce((a, b) => a + b, 0);
        if (energy > 0) {
            chord =
                detectChordFromNotes(midiNoteNumbers, bassPc, detectionOptions) ??
                estimateChordPB(chroma, bassPc, detectionOptions);
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
        const chordFontSize = chordFontSizeRaw ?? 48;
        const detailsFontSize = detailsFontSizeRaw ?? 24;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const fontChord = `${fontWeight} ${chordFontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const fontDetails = `${fontWeight} ${detailsFontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        let y = 0;
        const label = chord ? this._formatChordLabel(chord, showInversion) : 'N.C.';

        // When a layout box is active, anchor text within it so alignment matches the visible box.
        // Always use layoutWidth for text positioning regardless of showBackground — the layout box
        // defines the element's extent and text should align to it.
        const textXForJustify = (j: CanvasTextAlign): number => {
            if (j === 'center') return layoutWidth / 2;
            if (j === 'right' || j === 'end') return layoutWidth;
            return 0;
        };
        const textX = textXForJustify(justify);

        const title = new Text(textX, y, label, fontChord, color, justify, 'top');
        title.setIncludeInLayoutBounds(false);
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
            const ln = new Text(textX, y, noteLine, fontDetails, color, justify, 'top');
            ln.setIncludeInLayoutBounds(false);
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
                const rect = new Rectangle(
                    rectX,
                    y,
                    rectWidth,
                    20,
                    applyOpacity(chromaColorRaw, chroma[i] * chromaOpacityScale)
                );
                rect.setIncludeInLayoutBounds(false);
                renderObjects.push(rect);
            }
            y += 20 + lineSpacing;
        }

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bgHeight = y + paddingY * 2;
            const bg = new Rectangle(-paddingX, -paddingY, layoutWidth + paddingX * 2, bgHeight, bgColor);
            if (props.backgroundCornerRadius) bg.cornerRadius = props.backgroundCornerRadius;
            bg.setIncludeInLayoutBounds(false);
            renderObjects.splice(1, 0, bg);
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
            case 'sus2':
                qual = 'sus2';
                break;
            case 'sus4':
                qual = 'sus4';
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

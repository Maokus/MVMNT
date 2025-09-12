// Chord Estimate Display: estimates current chord using a Pardo–Birmingham-inspired method
import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types.js';
import { Rectangle, RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@shared/services/fonts/font-loader';
import { computeChromaFromNotes, estimateChordPB, EstimatedChord } from '@math/midi/chord-estimator';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';

export class ChordEstimateDisplayElement extends SceneElement {
    private _lastChord?: EstimatedChord;
    private _lastTime = -1;

    constructor(id: string = 'chordEstimateDisplay', config: { [key: string]: any } = {}) {
        super('chordEstimateDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Chord Estimate Display',
            description:
                'Estimates the current chord (Pardo–Birmingham-inspired) and displays it as text (timeline-backed)',
            category: 'music',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        { key: 'midiTrackId', type: 'midiTrackRef', label: 'MIDI Track', default: null },
                        {
                            key: 'windowSeconds',
                            type: 'number',
                            label: 'Analysis Window (s)',
                            default: 0.6,
                            min: 0.05,
                            max: 4,
                            step: 0.05,
                        },
                    ],
                },
                {
                    id: 'estimation',
                    label: 'Estimation',
                    collapsed: true,
                    properties: [
                        { key: 'includeTriads', type: 'boolean', label: 'Triads (maj/min)', default: true },
                        { key: 'includeDiminished', type: 'boolean', label: 'Include Diminished', default: true },
                        { key: 'includeAugmented', type: 'boolean', label: 'Include Augmented', default: false },
                        { key: 'includeSevenths', type: 'boolean', label: 'Include 7ths', default: true },
                        { key: 'preferBassRoot', type: 'boolean', label: 'Prefer Root in Bass', default: true },
                        { key: 'showInversion', type: 'boolean', label: 'Show Inversion (slash)', default: true },
                        {
                            key: 'smoothingMs',
                            type: 'number',
                            label: 'Hold Chord (ms)',
                            default: 160,
                            min: 0,
                            max: 1000,
                            step: 10,
                        },
                    ],
                },
                {
                    id: 'appearance',
                    label: 'Appearance',
                    collapsed: true,
                    properties: [
                        {
                            key: 'textJustification',
                            type: 'select',
                            label: 'Text Justification',
                            default: 'left',
                            options: [
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ],
                        },
                        { key: 'fontFamily', type: 'font', label: 'Font Family', default: 'Inter' },
                        { key: 'fontSize', type: 'number', label: 'Font Size', default: 48, min: 6, max: 150, step: 1 },
                        {
                            key: 'chordFontSize',
                            type: 'number',
                            label: 'Chord Font Size',
                            default: 48,
                            min: 6,
                            max: 150,
                            step: 1,
                        },
                        {
                            key: 'detailsFontSize',
                            type: 'number',
                            label: 'Details Font Size',
                            default: 24,
                            min: 6,
                            max: 150,
                            step: 1,
                        },
                        { key: 'color', type: 'color', label: 'Text Color', default: '#ffffff' },
                        {
                            key: 'lineSpacing',
                            type: 'number',
                            label: 'Line Spacing',
                            default: 6,
                            min: 0,
                            max: 60,
                            step: 1,
                        },
                        { key: 'showActiveNotes', type: 'boolean', label: 'Show Active Notes', default: true },
                        { key: 'showChroma', type: 'boolean', label: 'Show Chroma', default: true },
                        {
                            key: 'chromaPrecision',
                            type: 'number',
                            label: 'Chroma Precision',
                            default: 2,
                            min: 0,
                            max: 6,
                            step: 1,
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObject[] = [];

        // Effective time
        const t = Math.max(0, targetTime);

        // Estimation window
        const windowSeconds = Math.max(0.05, (this.getProperty('windowSeconds') as number) ?? 0.6);
        const start = Math.max(0, t - windowSeconds / 2);
        const end = t + windowSeconds / 2;

        // Active notes and chroma via timeline store
        const trackId = (this.getProperty('midiTrackId') as string) || null;
        const noteEvents: { note: number; channel: number; startTime: number; endTime: number; velocity: number }[] =
            [];
        if (trackId) {
            const state = useTimelineStore.getState();
            const notes = selectNotesInWindow(state, { trackIds: [trackId], startSec: start, endSec: end });
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
        const includeTriads = !!this.getProperty('includeTriads');
        const includeDim = !!this.getProperty('includeDiminished');
        const includeAug = !!this.getProperty('includeAugmented');
        const include7 = !!this.getProperty('includeSevenths');
        const preferBassRoot = !!this.getProperty('preferBassRoot');
        const smoothingMs = Math.max(0, (this.getProperty('smoothingMs') as number) ?? 160);

        let chord: EstimatedChord | undefined;
        const energy = chroma.reduce((a, b) => a + b, 0);
        if (energy > 0) {
            chord = estimateChordPB(chroma, bassPc, {
                includeTriads,
                includeDiminished: includeDim,
                includeAugmented: includeAug,
                includeSevenths: include7,
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
        const fontSelection = (this.getProperty('fontFamily') as string) || 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '600').toString();
        const fontSize = (this.getProperty('fontSize') as number) || 48; // legacy fallback
        const chordFontSize = (this.getProperty('chordFontSize') as number) ?? fontSize;
        const detailsFontSize =
            (this.getProperty('detailsFontSize') as number) ?? Math.max(6, Math.round(fontSize * 0.5));
        const color = (this.getProperty('color') as string) || '#ffffff';
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const fontChord = `${fontWeight} ${chordFontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const fontDetails = `${fontWeight} ${detailsFontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const justify = ((this.getProperty('textJustification') as string) || 'left') as CanvasTextAlign;
        const showInversion = !!this.getProperty('showInversion');
        const lineSpacing = ((this.getProperty('lineSpacing') as number) ?? 6) as number;

        let y = 0;
        const label = chord ? this._formatChordLabel(chord, showInversion) : 'N.C.';
        const title = new Text(0, y, label, fontChord, color, justify, 'top');
        renderObjects.push(title);
        y += chordFontSize + lineSpacing;

        // Active notes line (unique MIDI notes overlapping window)
        if (this.getProperty('showActiveNotes')) {
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
        if (this.getProperty('showChroma')) {
            const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            for (let i = 0; i < names.length; i++) {
                const rect = new Rectangle(i * 30, y, 20, 20, `rgba(255,255,255,${chroma[i]})`);
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

    // Estimation moved to @math/midi/chord-estimator

    dispose(): void {
        super.dispose();
    }
}

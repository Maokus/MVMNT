// Chord Estimate Display: estimates current chord using a Pardo–Birmingham-inspired method
import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text } from '@core/render/render-objects';
import { MidiManager } from '@core/midi/midi-manager';
import { ensureFontLoaded, parseFontSelection } from '@shared/services/fonts/font-loader';
import { globalMacroManager } from '@bindings/macro-manager';

type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | '7' | 'maj7' | 'min7' | 'm7b5' | 'dim7';

interface EstimatedChord {
    root: number; // 0..11 pitch class
    quality: ChordQuality;
    bassPc?: number; // optional bass pitch class
    confidence: number; // 0..1
}

export class ChordEstimateDisplayElement extends SceneElement {
    public midiManager: MidiManager;
    private _currentMidiFile: File | null = null;
    private _midiMacroListener?: (
        eventType:
            | 'macroValueChanged'
            | 'macroCreated'
            | 'macroDeleted'
            | 'macroAssigned'
            | 'macroUnassigned'
            | 'macrosImported',
        data: any
    ) => void;

    private _lastChord?: EstimatedChord;
    private _lastTime = -1;

    constructor(id: string = 'chordEstimateDisplay', config: { [key: string]: any } = {}) {
        super('chordEstimateDisplay', id, config);
        this.midiManager = new MidiManager(this.id);
        this._setupMIDIFileListener();
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Chord Estimate Display',
            description: 'Estimates the current chord (Pardo–Birmingham-inspired) and displays it as text',
            category: 'music',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        { key: 'midiFile', type: 'file', label: 'MIDI File', accept: '.mid,.midi', default: null },
                        { key: 'timeOffset', type: 'number', label: 'Time Offset (s)', default: 0, step: 0.01 },
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
                        { key: 'color', type: 'color', label: 'Text Color', default: '#ffffff' },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObject[] = [];

        // Effective time
        const timeOffset = (this.getProperty('timeOffset') as number) || 0;
        const t = Math.max(0, targetTime + timeOffset);

        // Load MIDI file if changed
        const midiFile = this.getProperty<File>('midiFile');
        if (midiFile !== this._currentMidiFile) {
            this._handleMIDIFileConfig(midiFile);
            this._currentMidiFile = midiFile || null;
        }

        // Estimation window
        const windowSeconds = Math.max(0.05, (this.getProperty('windowSeconds') as number) ?? 0.6);
        const start = Math.max(0, t - windowSeconds / 2);
        const end = t + windowSeconds / 2;

        // Active notes and chroma
        const activeNotes = this.midiManager.getNotesInTimeWindow(start, end);
        const noteEvents = this.midiManager.createNoteEvents(activeNotes);
        const chroma = new Float32Array(12);
        let bassPc: number | undefined = undefined;
        let bassFreq: number | undefined = undefined;

        // Weight by overlap duration within window and velocity
        for (const n of noteEvents) {
            const overlap = Math.max(0, Math.min(end, n.endTime) - Math.max(start, n.startTime));
            if (overlap <= 0) continue;
            const velocity = Math.max(1, Math.min(127, n.velocity || 64));
            const weight = overlap * (0.5 + (0.5 * velocity) / 127); // duration + velocity weighting
            const pc = ((n.note % 12) + 12) % 12;
            chroma[pc] += weight;

            // Track bass (lowest frequency note) within window
            const freq = n.note + (n.channel || 0) * 0; // frequency proxy: MIDI note number is sufficient
            if (bassFreq === undefined || n.note < (bassFreq as number)) {
                bassFreq = n.note;
                bassPc = pc;
            }
        }

        // Normalize chroma
        const total = chroma.reduce((a, b) => a + b, 0);
        if (total > 0) {
            for (let i = 0; i < 12; i++) chroma[i] /= total;
        }

        // Estimate chord
        const includeTriads = !!this.getProperty('includeTriads');
        const includeDim = !!this.getProperty('includeDiminished');
        const includeAug = !!this.getProperty('includeAugmented');
        const include7 = !!this.getProperty('includeSevenths');
        const preferBassRoot = !!this.getProperty('preferBassRoot');
        const smoothingMs = Math.max(0, (this.getProperty('smoothingMs') as number) ?? 160);

        let chord: EstimatedChord | undefined;
        if (total > 0) {
            chord = this._estimateChordPB(chroma, bassPc, {
                includeTriads,
                includeDim,
                includeAug,
                include7,
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
                    chord.confidence < this._lastChord.confidence * 1.05
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
        const fontSize = (this.getProperty('fontSize') as number) || 48;
        const color = (this.getProperty('color') as string) || '#ffffff';
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;
        const justify = ((this.getProperty('textJustification') as string) || 'left') as CanvasTextAlign;
        const showInversion = !!this.getProperty('showInversion');

        const label = chord ? this._formatChordLabel(chord, showInversion) : 'N.C.';
        const text = new Text(0, 0, label, font, color, justify, 'top');
        renderObjects.push(text);

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

    private _estimateChordPB(
        chroma: Float32Array,
        bassPc: number | undefined,
        opts: {
            includeTriads: boolean;
            includeDim: boolean;
            includeAug: boolean;
            include7: boolean;
            preferBassRoot: boolean;
        }
    ): EstimatedChord | undefined {
        // Build candidate templates (binary chord tones) per root
        type Template = { quality: ChordQuality; mask: number[] };
        const baseTemplates: Template[] = [];
        if (opts.includeTriads) {
            baseTemplates.push(
                { quality: 'maj', mask: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0] }, // 0,4,7
                { quality: 'min', mask: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0] } // 0,3,7
            );
        }
        if (opts.includeDim) {
            baseTemplates.push({ quality: 'dim', mask: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0] }); // 0,3,6
        }
        if (opts.includeAug) {
            baseTemplates.push({ quality: 'aug', mask: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }); // 0,4,8
        }
        if (opts.include7) {
            // Add sevenths based on majors/minors
            baseTemplates.push(
                { quality: '7', mask: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0] }, // 0,4,7,10 (dominant)
                { quality: 'maj7', mask: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1] }, // 0,4,7,11
                { quality: 'min7', mask: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0] }, // 0,3,7,10
                { quality: 'm7b5', mask: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0] }, // 0,3,6,10 (half-dim)
                { quality: 'dim7', mask: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] } // 0,3,6,9
            );
        }

        const toneWeight = 1.0; // weight for chord tones
        const nonTonePenalty = 0.35; // penalty factor for non-chord tones (inspired by PB nonchord treatment)
        const bassBonusRoot = opts.preferBassRoot ? 0.15 : 0.0;
        const bassBonusChordTone = 0.07;

        let best: { root: number; quality: ChordQuality; score: number } | null = null;

        for (let root = 0; root < 12; root++) {
            for (const tmpl of baseTemplates) {
                // Rotate template to this root
                const tmask = new Array(12).fill(0);
                for (let i = 0; i < 12; i++) {
                    if (tmpl.mask[i]) tmask[(i + root) % 12] = 1;
                }

                // Score: chord tone energy minus penalty for non-chord energy
                let toneEnergy = 0;
                let nonToneEnergy = 0;
                for (let pc = 0; pc < 12; pc++) {
                    const e = chroma[pc];
                    if (tmask[pc]) toneEnergy += e;
                    else nonToneEnergy += e;
                }
                let score = toneEnergy * toneWeight - nonToneEnergy * nonTonePenalty;

                // Bass bonuses
                if (bassPc !== undefined) {
                    if (bassPc === root) score += bassBonusRoot;
                    else if (tmask[bassPc]) score += bassBonusChordTone;
                }

                if (!best || score > best.score) {
                    best = { root, quality: tmpl.quality, score };
                }
            }
        }

        if (!best) return undefined;

        // Confidence: clamp score into 0..1 by comparing with ideal case (all energy on tones)
        // Approximate ideal toneEnergy = 1, nonToneEnergy = 0 -> scoreIdeal = 1 * toneWeight
        const scoreIdeal = toneWeight;
        const confidence = Math.max(0, Math.min(1, best.score / scoreIdeal));

        return { root: best.root, quality: best.quality, bassPc, confidence };
    }

    private async _handleMIDIFileConfig(midiFileData: File | null): Promise<void> {
        if (!midiFileData) return;
        if (midiFileData instanceof File) await this._loadMIDIFile(midiFileData);
    }

    private async _loadMIDIFile(file: File): Promise<void> {
        try {
            const resetMacroValues = this._currentMidiFile !== file;
            await this.midiManager.loadMidiFile(file, resetMacroValues);
            this._dispatchChangeEvent();
            if (typeof window !== 'undefined') {
                const vis: any = (window as any).debugVisualizer;
                if (vis && typeof vis.invalidateRender === 'function') vis.invalidateRender();
            }
        } catch (err) {
            console.error(`Failed to load MIDI file for ${this.id}:`, err);
        }
    }

    private _setupMIDIFileListener(): void {
        this._midiMacroListener = (
            eventType:
                | 'macroValueChanged'
                | 'macroCreated'
                | 'macroDeleted'
                | 'macroAssigned'
                | 'macroUnassigned'
                | 'macrosImported',
            data: any
        ) => {
            if (eventType === 'macroValueChanged' && data.name === 'midiFile') {
                if (this.isBoundToMacro('midiFile', 'midiFile')) {
                    const newFile = this.getProperty<File>('midiFile');
                    if (newFile !== this._currentMidiFile) {
                        this._handleMIDIFileConfig(newFile);
                        this._currentMidiFile = newFile || null;
                        if (typeof window !== 'undefined') {
                            const vis: any = (window as any).debugVisualizer;
                            if (vis && typeof vis.invalidateRender === 'function') vis.invalidateRender();
                        }
                    }
                }
            }
        };
        globalMacroManager.addListener(this._midiMacroListener);
    }

    dispose(): void {
        super.dispose();
        if (this._midiMacroListener) {
            globalMacroManager.removeListener(this._midiMacroListener);
            this._midiMacroListener = undefined;
        }
    }

    private _dispatchChangeEvent(): void {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('sceneElementChanged', { detail: { elementId: this.id } }));
        }
    }
}

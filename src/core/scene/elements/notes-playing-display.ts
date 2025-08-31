// Notes Playing Display: show currently playing notes per channel/track
import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text } from '@core/render/render-objects';
import { MidiManager } from '@core/midi/midi-manager';
import { ensureFontLoaded, parseFontSelection } from '@shared/services/fonts/font-loader';
import { globalMacroManager } from '@bindings/macro-manager';

export class NotesPlayingDisplayElement extends SceneElement {
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

    constructor(id: string = 'notesPlayingDisplay', config: { [key: string]: any } = {}) {
        super('notesPlayingDisplay', id, config);
        this.midiManager = new MidiManager(this.id);
        this._setupMIDIFileListener();
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Notes Playing Display',
            description: 'Displays active notes and velocities per track/channel',
            category: 'info',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        { key: 'midiFile', type: 'file', label: 'MIDI File', accept: '.mid,.midi', default: null },
                        { key: 'timeOffset', type: 'number', label: 'Time Offset (s)', default: 0, step: 0.01 },
                    ],
                },
                {
                    id: 'appearance',
                    label: 'Appearance',
                    collapsed: true,
                    properties: [
                        { key: 'fontFamily', type: 'font', label: 'Font Family', default: 'Inter' },
                        { key: 'fontSize', type: 'number', label: 'Font Size', default: 14, min: 6, max: 72, step: 1 },
                        { key: 'color', type: 'color', label: 'Text Color', default: '#cccccc' },
                        {
                            key: 'lineSpacing',
                            type: 'number',
                            label: 'Line Spacing',
                            default: 4,
                            min: 0,
                            max: 40,
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

        const timeOffset = (this.getProperty('timeOffset') as number) || 0;
        const actualTime = targetTime + timeOffset;
        const effectiveTime = Math.max(0, actualTime);

        // Load MIDI file if changed
        const midiFile = this.getProperty<File>('midiFile');
        if (midiFile !== this._currentMidiFile) {
            this._handleMIDIFileConfig(midiFile);
            this._currentMidiFile = midiFile || null;
        }

        // Determine active notes at effectiveTime
        const notesRaw = this.midiManager.getNotes?.() || [];
        const noteEvents = this.midiManager.createNoteEvents(notesRaw);
        const active = noteEvents.filter(
            (n) => (n.startTime ?? 0) <= effectiveTime && (n.endTime ?? 0) > effectiveTime
        );

        // Group by channel to represent tracks succinctly (Track N ~= Channel N+1)
        const byChannel = new Map<number, { note: number; vel: number }[]>();
        for (const n of active) {
            const arr = byChannel.get(n.channel) || [];
            arr.push({ note: n.note, vel: n.velocity });
            byChannel.set(n.channel, arr);
        }

        // Appearance
        const fontSelection = (this.getProperty('fontFamily') as string) || 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = (this.getProperty('fontSize') as number) || 14;
        const color = (this.getProperty('color') as string) || '#cccccc';
        const lineSpacing = (this.getProperty('lineSpacing') as number) ?? 4;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        // Build lines following the requested format
        // Example: "Note: Bb1 (Vel: 78) Note: A2 (Vel: 60) < Track 1"
        const noteName = (midiNote: number): string => {
            const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const octave = Math.floor(midiNote / 12) - 1;
            const name = names[midiNote % 12];
            return `${name}${octave}`;
        };

        let y = 0;
        if (byChannel.size === 0 || actualTime < 0) {
            const txt = new Text(0, 0, 'Note:  < Track 1', font, color, 'left', 'top');
            renderObjects.push(txt);
            return renderObjects;
        }

        const sortedChannels = Array.from(byChannel.keys()).sort((a, b) => a - b);
        for (const ch of sortedChannels) {
            const list = byChannel.get(ch)!;
            // keep stable ordering by pitch then velocity
            list.sort((a, b) => a.note - b.note || a.vel - b.vel);
            const parts = list.map((n) => `Note: ${noteName(n.note)} (Vel: ${Math.max(0, Math.min(127, n.vel))})`);
            const line = `${parts.join(' ')} < Track ${ch + 1}`;
            const text = new Text(0, y, line, font, color, 'left', 'top');
            renderObjects.push(text);
            y += fontSize + lineSpacing;
        }

        return renderObjects;
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

// Notes Played Tracker element: shows counts of played notes and events from a MIDI file
import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@shared/services/fonts/font-loader';
import { globalMacroManager } from '@bindings/macro-manager';
import type { TimelineService } from '@core/timing';

export class NotesPlayedTrackerElement extends SceneElement {
    private _currentMidiFile: File | null = null;
    private _timeline(): TimelineService | undefined {
        try {
            return (window as any).mvmntTimelineService as TimelineService;
        } catch {
            return undefined;
        }
    }
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

    constructor(id: string = 'notesPlayedTracker', config: { [key: string]: any } = {}) {
        super('notesPlayedTracker', id, config);
        this._setupMIDIFileListener();
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Notes Played Tracker',
            description: 'Displays how many notes/events have played so far (timeline-backed)',
            category: 'info',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        {
                            key: 'bpm',
                            type: 'number',
                            label: 'BPM (Tempo)',
                            default: 120,
                            min: 20,
                            max: 300,
                            step: 0.1,
                            description: 'Beats per minute used to time notes/events',
                        },
                        { key: 'midiTrackId', type: 'midiTrackRef', label: 'MIDI Track', default: null },
                        {
                            key: 'midiFile',
                            type: 'file',
                            label: 'MIDI File (deprecated)',
                            accept: '.mid,.midi',
                            default: null,
                        },
                        {
                            key: 'timeOffset',
                            type: 'number',
                            label: 'Time Offset (s)',
                            default: 0,
                            step: 0.01,
                            description: 'Offset applied to target time (can be negative)',
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
                        {
                            key: 'fontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Choose the font family (Google Fonts supported)',
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 30,
                            min: 6,
                            max: 72,
                            step: 1,
                        },
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

        // Compute counts from notes via timeline
        const trackId = (this.getProperty('midiTrackId') as string) || null;
        const tl = this._timeline();
        // To compute totals, we need all notes; if service doesn't expose a direct getter, approximate using a large window
        let totalNotes = 0;
        let playedNotes = 0;
        let playedEvents = 0;
        if (trackId && tl) {
            const track = tl.getTrack(trackId) as any;
            const offset = (track?.offsetSec || 0) as number;
            const duration = (track?.midiData?.durationSec || 0) as number;
            const startSec = Math.max(0, offset + 0);
            const endSec = duration ? offset + duration : effectiveTime + 600; // fallback large window
            const all = tl.getNotesInWindow({ trackIds: [trackId], startSec, endSec });
            totalNotes = all.length;
            if (actualTime >= 0) {
                playedNotes = all.filter((n) => (n.startSec ?? 0) <= effectiveTime).length;
                for (const n of all) {
                    if ((n.startSec ?? n.startTime ?? 0) <= effectiveTime) playedEvents++;
                    if ((n.endSec ?? n.endTime ?? 0) <= effectiveTime) playedEvents++;
                }
            }
        }
        const totalEvents = totalNotes * 2;

        const pctNotes = totalNotes > 0 ? (playedNotes / totalNotes) * 100 : 0;
        const pctEvents = totalEvents > 0 ? (playedEvents / totalEvents) * 100 : 0;

        // Appearance
        const fontSelection = (this.getProperty('fontFamily') as string) || 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = (this.getProperty('fontSize') as number) || 14;
        const color = (this.getProperty('color') as string) || '#cccccc';
        const lineSpacing = (this.getProperty('lineSpacing') as number) ?? 4;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        const line1 = `Num played notes: ${playedNotes}/${totalNotes} (${pctNotes.toFixed(2)}%)`;
        const line2 = `Num played events: ${playedEvents}/${totalEvents} (${pctEvents.toFixed(2)}%)`;
        const justification = ((this.getProperty('textJustification') as string) || 'left') as CanvasTextAlign;
        const text1 = new Text(0, 0, line1, font, color, justification, 'top');
        const text2 = new Text(0, fontSize + lineSpacing, line2, font, color, justification, 'top');

        renderObjects.push(text1, text2);
        return renderObjects;
    }

    private async _handleMIDIFileConfig(midiFileData: File | null): Promise<void> {
        if (!midiFileData) return;
        if (midiFileData instanceof File) await this._autoImportMIDIFile(midiFileData);
    }

    private async _autoImportMIDIFile(file: File): Promise<void> {
        try {
            const tl = this._timeline();
            if (!tl) return;
            const id = await tl.addMidiTrack({ file, name: file.name });
            this.setProperty('midiTrackId', id);
            this._dispatchChangeEvent();
            if (typeof window !== 'undefined') {
                const vis: any = (window as any).debugVisualizer;
                if (vis && typeof vis.invalidateRender === 'function') vis.invalidateRender();
            }
        } catch (err) {
            console.error(`Failed to import MIDI file for ${this.id}:`, err);
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

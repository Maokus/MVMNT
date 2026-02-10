// Template: MIDI Notes Element
// Displays currently playing MIDI notes as colored bars
import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '@core/scene/elements/base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';

const normalizeMidiTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

export class MidiNotesElement extends SceneElement {
    constructor(id: string = 'midiNotes', config: Record<string, unknown> = {}) {
        super('midi-notes', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        
        return {
            ...base,
            name: 'MIDI Notes',
            description: 'Display currently playing MIDI notes',
            category: 'Custom',
            groups: [
                ...basicGroups,
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'midiTrackId',
                            type: 'timelineTrackRef',
                            label: 'MIDI Track',
                            default: null,
                            allowedTrackTypes: ['midi'],
                            description: 'MIDI track to display',
                            runtime: { transform: normalizeMidiTrackId, defaultValue: null },
                        },
                    ],
                },
                {
                    id: 'notesAppearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'noteWidth',
                            type: 'number',
                            label: 'Note Width',
                            default: 40,
                            min: 10,
                            max: 200,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 40 },
                        },
                        {
                            key: 'noteHeight',
                            type: 'number',
                            label: 'Note Height',
                            default: 100,
                            min: 20,
                            max: 500,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 100 },
                        },
                        {
                            key: 'noteSpacing',
                            type: 'number',
                            label: 'Note Spacing',
                            default: 8,
                            min: 0,
                            max: 50,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 8 },
                        },
                        {
                            key: 'noteColor',
                            type: 'colorAlpha',
                            label: 'Note Color',
                            default: '#10B981FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#10B981FF' },
                        },
                        {
                            key: 'showNoteNames',
                            type: 'boolean',
                            label: 'Show Note Names',
                            default: true,
                            runtime: {
                                transform: (value) => {
                                    if (typeof value === 'boolean') return value;
                                    if (typeof value === 'string') {
                                        return value.toLowerCase() === 'true';
                                    }
                                    return true;
                                },
                                defaultValue: true
                            },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        
        if (!props.visible) return [];
        
        const objects: RenderObject[] = [];
        
        if (!props.midiTrackId) {
            // Show message when no track selected
            objects.push(
                new Text(
                    0, 0,
                    'Select a MIDI track',
                    '14px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'top'
                )
            );
            return objects;
        }
        
        // Get MIDI data at current time from timeline store
        const EPS = 1e-3; // Small epsilon to get notes at current time
        const state = useTimelineStore.getState();
        const activeNotes = selectNotesInWindow(state, {
            trackIds: [props.midiTrackId],
            startSec: targetTime - EPS,
            endSec: targetTime + EPS,
        });
        
        if (activeNotes.length === 0) {
            // Show message when no notes playing
            objects.push(
                new Text(
                    0, 0,
                    'No notes playing',
                    '12px Inter, sans-serif',
                    '#64748b',
                    'left',
                    'top'
                )
            );
            return objects;
        }
        
        // Render each active note
        activeNotes.forEach((noteData: any, index: number) => {
            const x = index * (props.noteWidth + props.noteSpacing);
            
            // Draw note bar
            objects.push(
                new Rectangle(
                    x,
                    0,
                    props.noteWidth,
                    props.noteHeight,
                    props.noteColor
                )
            );
            
            // Draw note name if enabled
            if (props.showNoteNames) {
                const noteName = this._getNoteNameFromNumber(noteData.note);
                objects.push(
                    new Text(
                        x + props.noteWidth / 2,
                        props.noteHeight / 2,
                        noteName,
                        '14px Inter, sans-serif',
                        '#ffffff',
                        'center',
                        'middle'
                    )
                );
            }
        });
        
        return objects;
    }
    
    private _getNoteNameFromNumber(noteNumber: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(noteNumber / 12) - 1;
        const noteName = noteNames[noteNumber % 12];
        return `${noteName}${octave}`;
    }
}

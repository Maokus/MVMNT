// Template: MIDI Notes Element
// Displays currently playing MIDI notes as colored bars
import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    Rectangle,
    Text,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class MidiNotesElement extends SceneElement {
    constructor(id: string = 'midiNotes', config: Record<string, unknown> = {}) {
        super('midi-notes', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'MIDI Notes',
                description: 'Display currently playing MIDI notes',
                category: 'Custom',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', { description: 'MIDI track to display' }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'notesAppearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.number('noteWidth', 'Note Width', 40, { min: 10, max: 200, step: 1 }),
                            prop.number('noteHeight', 'Note Height', 100, { min: 20, max: 500, step: 1 }),
                            prop.number('noteSpacing', 'Note Spacing', 8, { min: 0, max: 50, step: 1 }),
                            prop.colorAlpha('noteColor', 'Note Color', '#10B981FF'),
                            prop.boolean('showNoteNames', 'Show Note Names', true),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (!props.midiTrackId) {
            // Show message when no track selected
            objects.push(new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top'));
            return objects;
        }

        // Get MIDI data at current time from public host plugin API
        const EPS = 1e-3; // Small epsilon to get notes at current time
        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        if (!api || status !== 'ok') {
            const message =
                status === 'unsupported-version'
                    ? 'Plugin API version unsupported'
                    : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
                      ? 'Timeline API unavailable (requires timeline.read)'
                      : 'Plugin host API unavailable';
            objects.push(new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }

        const activeNotes = api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: targetTime - EPS,
            endSec: targetTime + EPS,
        });

        if (activeNotes.length === 0) {
            // Show message when no notes playing
            objects.push(new Text(0, 0, 'No notes playing', '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }

        // Render each active note
        activeNotes.forEach((noteData, index: number) => {
            const x = index * (props.noteWidth + props.noteSpacing);

            // Draw note bar
            objects.push(new Rectangle(x, 0, props.noteWidth, props.noteHeight, props.noteColor));

            // Draw note name if enabled
            if (props.showNoteNames) {
                const noteName = api.utilities.midiNoteToName(noteData.note);
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
}

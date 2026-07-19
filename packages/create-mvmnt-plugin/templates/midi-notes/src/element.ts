import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text } from '@mvmnt-app/plugin-sdk/render';
export const midiNotes = definePluginElement({
    type: 'midi-notes',
    metadata: { name: 'MIDI Notes', description: 'Display currently playing MIDI notes', category: 'Custom' },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            {
                                key: 'midiTrackId',
                                label: 'MIDI Track',
                                type: 'timelineTrackRef',
                                allowedTrackTypes: ['midi'],
                                default: null,
                            },
                        ],
                    },
                ],
            },
            {
                id: 'appearance',
                label: 'Appearance',
                groups: [
                    {
                        id: 'notesAppearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            { key: 'noteWidth', label: 'Note Width', type: 'number', default: 40 },
                            { key: 'noteHeight', label: 'Note Height', type: 'number', default: 100 },
                            { key: 'noteSpacing', label: 'Note Spacing', type: 'number', default: 8 },
                            { key: 'noteColor', label: 'Note Color', type: 'colorAlpha', default: '#10B981FF' },
                            { key: 'showNoteNames', label: 'Show Note Names', type: 'boolean', default: true },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: ['timeline.read', 'midi.utils'], optional: [] },
    render(props, _state, time, context) {
        if (!props.midiTrackId) return [new Text(0, 0, 'Select a MIDI track', '14px sans-serif')];
        const active = context.timeline!.selectNotes({
            trackIds: [props.midiTrackId],
            startSeconds: time.seconds - 0.001,
            endSeconds: time.seconds + 0.001,
        });
        if (!active.ok) return [];
        return active.value.flatMap((note, index) => {
            const x = index * (props.noteWidth + props.noteSpacing);
            return [
                new Rectangle(x, 0, props.noteWidth, props.noteHeight, { fillColor: props.noteColor }),
                ...(props.showNoteNames
                    ? [
                          new Text(
                              x + props.noteWidth / 2,
                              props.noteHeight / 2,
                              context.midi!.noteName(note.note),
                              '14px sans-serif'
                          ),
                      ]
                    : []),
            ];
        });
    },
});

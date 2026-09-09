import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text } from '@mvmnt-app/plugin-sdk/render';
export const midiNotes = definePluginElement({
    type: 'midi-notes',
    metadata: { name: 'MIDI Notes', description: 'Display currently playing MIDI notes', category: 'Custom' },
    schema: {
        tabs: [
            tab.content([group('midiSource', 'MIDI Source', [prop.midiTrack('midiTrackId', 'MIDI Track')])]),
            tab.appearance([
                group('notesAppearance', 'Appearance', [
                    prop.number('noteWidth', 'Note Width', 40),
                    prop.number('noteHeight', 'Note Height', 100),
                    prop.number('noteSpacing', 'Note Spacing', 8),
                    prop.colorAlpha('noteColor', 'Note Color', '#10B981FF'),
                    prop.boolean('showNoteNames', 'Show Note Names', true),
                ]),
            ]),
        ],
    },
    render({ props, time, context }) {
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

// Template: SDK 2 MIDI notes element.
import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text, type RenderObject } from '@mvmnt-app/plugin-sdk/render';

export const midiNotes = definePluginElement({
    type: 'midi-notes',
    metadata: { name: 'MIDI Notes', description: 'Display currently playing MIDI notes', category: 'Custom' },
    schema: { tabs: [
        { id: 'content', label: 'Content', groups: [{ id: 'midiSource', label: 'MIDI Source', collapsed: false, properties: [
            { key: 'midiTrackId', label: 'MIDI Track', type: 'timelineTrackRef', allowedTrackTypes: ['midi'], default: null },
        ] }] },
        { id: 'appearance', label: 'Appearance', groups: [{ id: 'notesAppearance', label: 'Appearance', collapsed: false, properties: [
            { key: 'noteWidth', label: 'Note Width', type: 'number', default: 40, min: 10, max: 200, step: 1 },
            { key: 'noteHeight', label: 'Note Height', type: 'number', default: 100, min: 20, max: 500, step: 1 },
            { key: 'noteSpacing', label: 'Note Spacing', type: 'number', default: 8, min: 0, max: 50, step: 1 },
            { key: 'noteColor', label: 'Note Color', type: 'colorAlpha', default: '#10B981FF' },
            { key: 'showNoteNames', label: 'Show Note Names', type: 'boolean', default: true },
        ] }] },
    ] },
    capabilities: { required: ['timeline.read', 'midi.utils'], optional: [] },
    render(props, _state, time, context) {
        if (!props.midiTrackId) return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', { color: '#94a3b8' })];
        const active = context.timeline!.selectNotes({
            trackIds: [props.midiTrackId], startSeconds: time.seconds - 1e-3, endSeconds: time.seconds + 1e-3,
        });
        if (!active.ok || active.value.length === 0) {
            return [new Text(0, 0, 'No notes playing', '12px Inter, sans-serif', { color: '#64748b' })];
        }
        const objects: RenderObject[] = [];
        active.value.forEach((note, index) => {
            const x = index * (props.noteWidth + props.noteSpacing);
            objects.push(new Rectangle(x, 0, props.noteWidth, props.noteHeight, { fillColor: props.noteColor }));
            if (props.showNoteNames) objects.push(new Text(
                x + props.noteWidth / 2, props.noteHeight / 2, context.midi!.noteName(note.note),
                '14px Inter, sans-serif', { color: '#ffffff', align: 'center', baseline: 'middle' },
            ));
        });
        return objects;
    },
});

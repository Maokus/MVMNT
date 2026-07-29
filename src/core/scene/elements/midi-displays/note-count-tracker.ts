import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';
import { parseFontSelection } from '@fonts/font-loader';

interface Props extends Readonly<Record<string, any>> {}
const defaultFormat =
    'Num played notes: #playedNotes/#totalNotes (#percentNotes%)\nNum played events: #playedEvents/#totalEvents (#percentEvents%)';
const substitute = (template: string, values: Record<string, string>) =>
    template.replace(
        /#(playedNotes|totalNotes|percentNotes|playedEvents|totalEvents|percentEvents)/g,
        (_, key) => values[key] ?? ''
    );
export const notesPlayedTracker = definePluginElement<Props, undefined>({
    type: 'notesPlayedTracker',
    metadata: {
        name: 'Note Count Tracker',
        description: 'Displays how many notes/events have played so far',
        category: 'MIDI Displays',
    },
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
                    {
                        id: 'formatting',
                        label: 'Formatting',
                        collapsed: false,
                        properties: [
                            { key: 'formatString', label: 'Format String', type: 'longString', default: defaultFormat },
                        ],
                    },
                ],
            },
            {
                id: 'appearance',
                label: 'Appearance',
                groups: [
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            { key: 'color', label: 'Color', type: 'colorAlpha', default: '#CCCCCCFF' },
                            {
                                key: 'opacity',
                                label: 'Opacity',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'opacity' } },
                            { kind: 'property', propertyKey: 'opacity' },
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            { key: 'fontFamily', label: 'Font Family', type: 'font', default: 'Inter|400' },
                            { key: 'fontSize', label: 'Font Size', type: 'number', default: 30 },
                            {
                                key: 'textAlign',
                                label: 'Text Alignment',
                                type: 'select',
                                default: 'left',
                                options: [
                                    { value: 'left', label: 'Left' },
                                    { value: 'center', label: 'Center' },
                                    { value: 'right', label: 'Right' },
                                ],
                            },
                            { key: 'lineSpacing', label: 'Line Spacing', type: 'number', default: 4 },
                        ],
                    },
                    {
                        id: 'container',
                        label: 'Container',
                        collapsed: true,
                        properties: [
                            { key: 'showBackground', label: 'Show Background', type: 'boolean', default: false },
                            { key: 'backgroundColor', label: 'Background', type: 'colorAlpha', default: '#000000FF' },
                            {
                                key: 'backgroundOpacity',
                                label: 'Background Opacity',
                                type: 'number',
                                default: 0.8,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                            { key: 'backgroundPaddingX', label: 'Horizontal Padding', type: 'number', default: 8 },
                            { key: 'backgroundPaddingY', label: 'Vertical Padding', type: 'number', default: 4 },
                            { key: 'backgroundCornerRadius', label: 'Corner Radius', type: 'number', default: 4 },
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'backgroundOpacity' } },
                            { kind: 'property', propertyKey: 'backgroundOpacity' },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: ['timeline.read'], optional: [] },
    render(props, _state, time, context) {
        let notes: readonly any[] = [];
        let cc: readonly any[] = [];
        if (props.midiTrackId) {
            const meta = context.timeline!.getMetadata();
            const end = meta.ok ? meta.value.durationSeconds : Math.max(0, time.seconds);
            const noteResult = context.timeline!.selectNotes({
                trackIds: [props.midiTrackId],
                startSeconds: 0,
                endSeconds: end,
            });
            const ccResult = context.timeline!.selectCC({
                trackIds: [props.midiTrackId],
                startSeconds: 0,
                endSeconds: end,
            });
            if (noteResult.ok) notes = noteResult.value;
            if (ccResult.ok) cc = ccResult.value;
        }
        const playedNotes = notes.filter((note) => note.startSeconds <= time.seconds).length;
        const playedEvents =
            playedNotes +
            notes.filter((note) => note.endSeconds <= time.seconds).length +
            cc.filter((event) => event.timeSeconds <= time.seconds).length;
        const totalEvents = notes.length * 2 + cc.length;
        const values = {
            playedNotes: String(playedNotes),
            totalNotes: String(notes.length),
            percentNotes: (notes.length ? (playedNotes / notes.length) * 100 : 0).toFixed(2),
            playedEvents: String(playedEvents),
            totalEvents: String(totalEvents),
            percentEvents: (totalEvents ? (playedEvents / totalEvents) * 100 : 0).toFixed(2),
        };
        const lines = substitute(props.formatString, values).split(/\r?\n/);
        const { family, weight = '400' } = parseFontSelection(String(props.fontFamily));
        const font = `${weight} ${props.fontSize}px ${family}, sans-serif`;
        const width = Math.max(1, ...lines.map((line) => line.length * props.fontSize * 0.6));
        const height = lines.length * props.fontSize + Math.max(0, lines.length - 1) * props.lineSpacing;
        const x = props.textAlign === 'center' ? -width / 2 : props.textAlign === 'right' ? -width : 0;
        const objects: RenderObject[] = [new Rectangle(x, 0, width, height, { fillColor: null })];
        lines.forEach((line, index) =>
            objects.push(
                new Text(0, index * (props.fontSize + props.lineSpacing), line, font, {
                    color: applyOpacity(props.color, props.opacity),
                    align: props.textAlign,
                })
            )
        );
        if (props.showBackground) {
            const bg = new Rectangle(
                x - props.backgroundPaddingX,
                -props.backgroundPaddingY,
                width + props.backgroundPaddingX * 2,
                height + props.backgroundPaddingY * 2,
                { fillColor: applyOpacity(props.backgroundColor, props.backgroundOpacity) }
            );
            bg.cornerRadius = props.backgroundCornerRadius;
            objects.unshift(bg);
        }
        return objects;
    },
});
export const NoteCountTrackerElement = createBuiltInDefinitionElementClass(notesPlayedTracker);

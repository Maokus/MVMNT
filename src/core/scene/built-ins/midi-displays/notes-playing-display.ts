import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { defineBuiltInElement } from '@core/scene/built-ins/define-built-in';
import { parseFontSelection } from '@fonts/font-loader';

interface Props extends Readonly<Record<string, any>> {}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (note: number) => `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
const num = (key: string, label: string, value: number) => ({ key, label, type: 'number', default: value });
export const notesPlayingDisplay = defineBuiltInElement<Props, undefined>({
    type: 'notesPlayingDisplay',
    metadata: {
        name: 'Notes Playing Display',
        description: 'Displays active notes and velocities',
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
                        label: 'Source',
                        collapsed: false,
                        properties: [
                            {
                                key: 'midiTrackId',
                                label: 'MIDI Track',
                                type: 'timelineTrackRef',
                                allowedTrackTypes: ['midi'],
                                default: null,
                            },
                            {
                                key: 'showAllAvailableTracks',
                                label: 'Show All Tracks When Idle',
                                type: 'boolean',
                                default: false,
                            },
                        ],
                    },
                    {
                        id: 'display',
                        label: 'Display',
                        collapsed: false,
                        properties: [
                            {
                                key: 'displayMode',
                                label: 'Display Mode',
                                type: 'select',
                                default: 'letters',
                                options: [
                                    { value: 'letters', label: 'Letters' },
                                    { value: 'grid', label: 'Grid' },
                                ],
                            },
                            num('fadeOutDuration', 'Fade Out (s)', 0),
                            {
                                ...num('lettersSpacing', 'Letters Spacing', 32),
                                visibleWhen: [{ key: 'displayMode', equals: 'letters' }],
                            },
                            {
                                ...num('gridColumns', 'Columns', 12),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridRows', 'Rows', 12),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridRowNoteOffset', 'Row Note Offset', 12),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridStartNote', 'Start Note', -1),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridCellWidth', 'Cell Width', 65),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridCellHeight', 'Cell Height', 65),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridCellGap', 'Cell Gap', 4),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridCornerRadius', 'Corner Radius', 4),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                ...num('gridStrokeWidth', 'Stroke Width', 0),
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                key: 'gridStrokeColor',
                                label: 'Stroke Color',
                                type: 'colorAlpha',
                                default: '#0F172AFF',
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            {
                                key: 'animationType',
                                label: 'Animation',
                                type: 'select',
                                default: 'none',
                                options: [
                                    { value: 'none', label: 'None' },
                                    { value: 'bump', label: 'Bump' },
                                    { value: 'scale', label: 'Scale' },
                                ],
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
                        id: 'colors',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            {
                                key: 'textColor',
                                label: 'Text Color',
                                type: 'colorAlpha',
                                default: '#CCCCCCFF',
                                visibleWhen: [{ key: 'displayMode', equals: 'letters' }],
                            },
                            {
                                key: 'textOpacity',
                                label: 'Text Opacity',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'letters' }],
                            },
                            {
                                key: 'gridFillColor',
                                label: 'Grid Fill Color',
                                type: 'colorAlpha',
                                default: '#EFEFEFFF',
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                            {
                                key: 'gridFillOpacity',
                                label: 'Grid Fill Opacity',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            },
                        ],
                        layout: [
                            {
                                kind: 'control',
                                control: 'slider',
                                bindings: { value: 'textOpacity' },
                                options: { min: 0, max: 1, step: 0.01 },
                            },
                            { kind: 'property', propertyKey: 'textOpacity' },
                            {
                                kind: 'control',
                                control: 'slider',
                                bindings: { value: 'gridFillOpacity' },
                                options: { min: 0, max: 1, step: 0.01 },
                            },
                            { kind: 'property', propertyKey: 'gridFillOpacity' },
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            { key: 'fontFamily', label: 'Font Family', type: 'font', default: 'BuiltIn:inter|400' },
                            num('fontSize', 'Font Size', 30),
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
                            num('lineSpacing', 'Line Spacing', 4),
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
                            },
                            num('backgroundPaddingX', 'Horizontal Padding', 8),
                            num('backgroundPaddingY', 'Vertical Padding', 4),
                            num('backgroundCornerRadius', 'Corner Radius', 4),
                        ],
                        layout: [
                            {
                                kind: 'control',
                                control: 'slider',
                                bindings: { value: 'backgroundOpacity' },
                                options: { min: 0, max: 1, step: 0.01 },
                            },
                            { kind: 'property', propertyKey: 'backgroundOpacity' },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: ['timeline.read'], optional: [] },
    render(props, _state, time, context) {
        const current = Math.max(0, time.seconds);
        const fade = Math.max(0, props.fadeOutDuration);
        const trackIds = props.midiTrackId ? [props.midiTrackId] : [];
        const recentResult = context.timeline!.selectNotes({
            trackIds,
            startSeconds: Math.max(0, current - Math.max(fade + 0.5, 10)),
            endSeconds: current + 0.1,
        });
        const recent = recentResult.ok ? recentResult.value : [];
        const active = new Map<number, number>();
        const ended = new Map<number, number>();
        recent.forEach((note) => {
            if (note.startSeconds <= current && current < note.endSeconds)
                active.set(note.note, Math.max(active.get(note.note) ?? 0, note.startSeconds));
            else if (fade > 0 && note.endSeconds <= current && note.endSeconds >= current - fade)
                ended.set(note.note, Math.max(ended.get(note.note) ?? 0, note.endSeconds));
        });
        active.forEach((_value, note) => ended.delete(note));
        const opacity = (note: number) =>
            active.has(note)
                ? 1
                : Math.max(0, 1 - (current - (ended.get(note) ?? current - fade)) / Math.max(fade, 1e-6));
        const scale = (note: number) => {
            const elapsed = current - (active.get(note) ?? current);
            if (props.animationType === 'bump' && elapsed < 0.15) return 1 + 0.3 * (1 - (elapsed / 0.15) ** 2);
            if (props.animationType === 'scale' && elapsed < 0.2) return (elapsed / 0.2) ** 2;
            return 1;
        };
        const notes = new Set([...active.keys(), ...ended.keys()]);
        const { family, weight = '400' } = parseFontSelection(String(props.fontFamily));
        const font = `${weight} ${props.fontSize}px ${family}, sans-serif`;
        const color = applyOpacity(props.textColor, props.textOpacity);
        const objects: RenderObject[] = [];
        let width: number;
        let height: number;
        let layoutX: number;
        if (props.displayMode === 'grid') {
            const columns = Math.max(1, Math.floor(props.gridColumns));
            const rows = Math.max(1, Math.floor(props.gridRows));
            width = columns * props.gridCellWidth + (columns - 1) * props.gridCellGap;
            height = rows * props.gridCellHeight + (rows - 1) * props.gridCellGap;
            layoutX = props.textAlign === 'center' ? -width / 2 : props.textAlign === 'right' ? -width : 0;
            let start = Math.floor(props.gridStartNote);
            if (start < 0) {
                const meta = context.timeline!.getMetadata();
                const all = meta.ok
                    ? context.timeline!.selectNotes({
                          trackIds,
                          startSeconds: 0,
                          endSeconds: meta.value.durationSeconds,
                      })
                    : null;
                start = all?.ok && all.value.length ? Math.min(...all.value.map((note) => note.note)) : 0;
            }
            if (!notes.size && props.showAllAvailableTracks)
                for (let row = 0; row < rows; row++)
                    for (let col = 0; col < columns; col++) notes.add(start + col + row * props.gridRowNoteOffset);
            for (let row = 0; row < rows; row++)
                for (let col = 0; col < columns; col++) {
                    const note = start + col + row * props.gridRowNoteOffset;
                    if (!notes.has(note)) continue;
                    const x = layoutX + col * (props.gridCellWidth + props.gridCellGap);
                    const y = (rows - row - 1) * (props.gridCellHeight + props.gridCellGap);
                    const cell = new Rectangle(x, y, props.gridCellWidth, props.gridCellHeight, {
                        fillColor: applyOpacity(props.gridFillColor, props.gridFillOpacity),
                        strokeColor: props.gridStrokeWidth > 0 ? props.gridStrokeColor : null,
                        strokeWidth: props.gridStrokeWidth,
                    });
                    cell.cornerRadius = props.gridCornerRadius;
                    cell.opacity = opacity(note);
                    cell.scaleX = cell.scaleY = scale(note);
                    objects.push(
                        cell,
                        new Text(x + props.gridCellWidth / 2, y + props.gridCellHeight / 2, noteName(note), font, {
                            color,
                            align: 'center',
                            baseline: 'middle',
                        })
                    );
                }
        } else {
            width = 11 * props.lettersSpacing + props.fontSize * 1.2;
            height = props.fontSize;
            layoutX = props.textAlign === 'center' ? -width / 2 : props.textAlign === 'right' ? -width : 0;
            for (let pitch = 0; pitch < 12; pitch++) {
                const matching = [...notes].filter((note) => note % 12 === pitch);
                if (!matching.length) continue;
                const note = matching.find((value) => active.has(value)) ?? matching[0];
                const text = new Text(layoutX + pitch * props.lettersSpacing, 0, NAMES[pitch], font, { color });
                text.opacity = opacity(note);
                text.scaleX = text.scaleY = scale(note);
                objects.push(text);
            }
        }
        objects.unshift(new Rectangle(layoutX, 0, width, height, { fillColor: null }));
        if (props.showBackground) {
            const bg = new Rectangle(
                layoutX - props.backgroundPaddingX,
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

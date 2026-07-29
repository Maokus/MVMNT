import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';
import { parseFontSelection } from '@fonts/font-loader';

interface Props extends Readonly<Record<string, any>> {}
const withOpacity = (color: string, opacity: number) => applyOpacity(color, opacity);
export const timeDisplay = definePluginElement<Props, undefined>({
    type: 'timeDisplay',
    metadata: { name: 'Time Display', description: 'Current time and beat position display', category: 'Misc' },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'timeDisplay',
                        label: 'Time Display',
                        collapsed: false,
                        properties: [
                            {
                                key: 'offsetBars',
                                label: 'Offset Bars',
                                type: 'number',
                                default: 0,
                                min: -512,
                                max: 512,
                                step: 1,
                            },
                            { key: 'showProgress', label: 'Show Progress Bars', type: 'boolean', default: true },
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
                            { key: 'color', label: 'Primary Text Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            {
                                key: 'textSecondaryColor',
                                label: 'Secondary Text Color',
                                type: 'colorAlpha',
                                default: '#FFFFFFE6',
                            },
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            { key: 'fontFamily', label: 'Font', type: 'font', default: 'Inter|400' },
                            { key: 'fontSize', label: 'Font Size', type: 'number', default: 24 },
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
    capabilities: { required: [], optional: ['timeline.read', 'timing.conversion'] },
    render(props, _state, time, context) {
        const metadata = context.timeline?.getMetadata();
        const bpm = metadata?.ok ? metadata.value.tempoBpm : 120;
        const beatsPerBar = metadata?.ok ? metadata.value.timeSignature.numerator : 4;
        const secondsPerBeat = 60 / bpm;
        const displaySeconds = time.seconds + props.offsetBars * beatsPerBar * secondsPerBeat;
        const totalBeats = displaySeconds / secondsPerBeat;
        const bar = Math.floor(totalBeats / beatsPerBar);
        const beat = Math.floor(((totalBeats % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1;
        const tick = Math.floor((totalBeats - Math.floor(totalBeats)) * 480);
        const totalMs = displaySeconds * 1000;
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = Math.floor(((totalMs % 1000) + 1000) % 1000);
        const pad = (value: number, width: number) => String(value).padStart(width, '0');
        const size = props.fontSize;
        const { family, weight = '400' } = parseFontSelection(String(props.fontFamily));
        const font = `${weight} ${size}px ${family}, sans-serif`;
        const labelFont = `${weight} ${size * 0.8}px ${family}, sans-serif`;
        const beatY = size * 1.8;
        const primary = props.color;
        const secondary = props.textSecondaryColor;
        const values = [
            pad(minutes, 3),
            pad(seconds, 2),
            pad(milliseconds, 3),
            pad(bar, 3),
            pad(beat, 2),
            pad(tick, 3),
        ];
        const objects: RenderObject[] = [
            new Text(size * 2, 0, values[0], font, { color: primary, align: 'right', baseline: 'bottom' }),
            new Text(size * 3.8, 0, values[1], font, { color: primary, align: 'right', baseline: 'bottom' }),
            new Text(size * 6, 0, values[2], font, { color: primary, align: 'right', baseline: 'bottom' }),
            new Text(size * 2, beatY, values[3], font, { color: primary, align: 'right', baseline: 'bottom' }),
            new Text(size * 3.8, beatY, values[4], font, { color: primary, align: 'right', baseline: 'bottom' }),
            new Text(size * 6, beatY, values[5], font, { color: primary, align: 'right', baseline: 'bottom' }),
            new Text(size * 6, -size, 'time', labelFont, { color: secondary, align: 'right', baseline: 'bottom' }),
            new Text(size * 6, beatY - size, 'beat', labelFont, {
                color: secondary,
                align: 'right',
                baseline: 'bottom',
            }),
        ];
        if (props.showProgress) {
            objects.push(
                new Rectangle(size * 4, beatY + size * 0.1, size * 2, 4, { fillColor: withOpacity(secondary, 0.2) })
            );
            objects.push(
                new Rectangle(size * 4, beatY + size * 0.1, size * 2 * Math.max(0, Math.min(1, tick / 480)), 4, {
                    fillColor: withOpacity(secondary, 0.6),
                })
            );
            objects.push(
                new Rectangle(size * 2.8, beatY + size * 0.1, size, 4, { fillColor: withOpacity(secondary, 0.2) })
            );
            objects.push(
                new Rectangle(
                    size * 2.8,
                    beatY + size * 0.1,
                    size * Math.max(0, Math.min(1, (beat - 1) / beatsPerBar)),
                    4,
                    { fillColor: withOpacity(secondary, 0.6) }
                )
            );
        }
        if (props.showBackground) {
            const top = -size * 1.8;
            const bottom = props.showProgress ? beatY + size * 0.6 : beatY + size * 0.3;
            const bg = new Rectangle(
                -props.backgroundPaddingX,
                top - props.backgroundPaddingY,
                size * 6 + props.backgroundPaddingX * 2,
                bottom - top + props.backgroundPaddingY * 2,
                { fillColor: applyOpacity(props.backgroundColor, props.backgroundOpacity) }
            );
            bg.cornerRadius = props.backgroundCornerRadius;
            objects.unshift(bg);
        }
        return objects;
    },
});
export const TimeDisplayElement = createBuiltInDefinitionElementClass(timeDisplay);

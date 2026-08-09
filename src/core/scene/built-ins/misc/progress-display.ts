import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { defineBuiltInElement } from '@core/scene/built-ins/define-built-in';
import { parseFontSelection } from '@fonts/font-loader';

interface Props extends Readonly<Record<string, any>> {}
const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')}`;
export const progressDisplay = defineBuiltInElement<Props, undefined>({
    type: 'progressDisplay',
    metadata: { name: 'Progress Display', description: 'Playback progress bar and statistics', category: 'Misc' },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'progressBasics',
                        label: 'Progress & Stats',
                        collapsed: false,
                        properties: [
                            { key: 'showBar', label: 'Show Progress Bar', type: 'boolean', default: true },
                            { key: 'showStats', label: 'Show Statistics', type: 'boolean', default: true },
                            { key: 'countDown', label: 'Count Down', type: 'boolean', default: false },
                            {
                                key: 'barWidth',
                                label: 'Bar Width (px)',
                                type: 'number',
                                default: 400,
                                min: 100,
                                max: 1200,
                                step: 5,
                            },
                            {
                                key: 'height',
                                label: 'Bar Height (px)',
                                type: 'number',
                                default: 20,
                                min: 10,
                                max: 80,
                                step: 5,
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
                        collapsed: true,
                        properties: [
                            { key: 'barColor', label: 'Bar Color', type: 'colorAlpha', default: '#CCCCCCFF' },
                            {
                                key: 'barOpacity',
                                label: 'Bar Opacity',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                            { key: 'barBgColor', label: 'Background Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            {
                                key: 'barBgOpacity',
                                label: 'Background Opacity',
                                type: 'number',
                                default: 0.1,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                            { key: 'borderColor', label: 'Border Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            {
                                key: 'borderOpacity',
                                label: 'Border Opacity',
                                type: 'number',
                                default: 0.3,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                            { key: 'statsTextColor', label: 'Stats Text', type: 'colorAlpha', default: '#CCCCCCFF' },
                            {
                                key: 'statsTextOpacity',
                                label: 'Text Opacity',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'barOpacity' } },
                            { kind: 'property', propertyKey: 'barOpacity' },
                            { kind: 'control', control: 'slider', bindings: { value: 'barBgOpacity' } },
                            { kind: 'property', propertyKey: 'barBgOpacity' },
                            { kind: 'control', control: 'slider', bindings: { value: 'borderOpacity' } },
                            { kind: 'property', propertyKey: 'borderOpacity' },
                            { kind: 'control', control: 'slider', bindings: { value: 'statsTextOpacity' } },
                            { kind: 'property', propertyKey: 'statsTextOpacity' },
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            { key: 'fontFamily', label: 'Font', type: 'font', default: 'BuiltIn:inter|400' },
                            { key: 'fontSize', label: 'Font Size', type: 'number', default: 12 },
                            {
                                key: 'textAlign',
                                label: 'Alignment',
                                type: 'select',
                                default: 'left',
                                options: [
                                    { value: 'left', label: 'Left' },
                                    { value: 'center', label: 'Center' },
                                    { value: 'right', label: 'Right' },
                                ],
                            },
                            { key: 'letterSpacing', label: 'Letter Spacing', type: 'number', default: 0 },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props, _state, time) {
        const objects: RenderObject[] = [];
        const start = time.playbackStartSeconds ?? 0;
        const duration =
            time.playbackEndSeconds != null
                ? Math.max(0, time.playbackEndSeconds - start)
                : (time.durationSeconds ?? 0);
        const relative = time.seconds - start;
        const progress = duration > 0 ? Math.max(0, Math.min(1, relative / duration)) : 0;
        const width = Math.max(0, props.barWidth);
        const height = Math.max(0, props.height);
        if (props.showBar) {
            objects.push(
                new Rectangle(0, 0, width, height, { fillColor: applyOpacity(props.barBgColor, props.barBgOpacity) })
            );
            objects.push(
                new Rectangle(0, 0, width * progress, height, {
                    fillColor: applyOpacity(props.barColor, props.barOpacity),
                })
            );
            const border = applyOpacity(props.borderColor, props.borderOpacity);
            objects.push(
                new Rectangle(0, 0, width, 1, { fillColor: border }),
                new Rectangle(0, height - 1, width, 1, { fillColor: border }),
                new Rectangle(0, 0, 1, height, { fillColor: border }),
                new Rectangle(width - 1, 0, 1, height, { fillColor: border })
            );
        }
        if (props.showStats) {
            const { family, weight = '400' } = parseFontSelection(String(props.fontFamily));
            const x = props.textAlign === 'right' ? width : props.textAlign === 'center' ? width / 2 : 0;
            const text = props.countDown
                ? formatTime(Math.max(0, duration - relative))
                : `${formatTime(Math.max(0, relative))} / ${formatTime(duration)}`;
            const label = new Text(x, height + 5, text, `${weight} ${props.fontSize}px ${family}, sans-serif`, {
                color: applyOpacity(props.statsTextColor, props.statsTextOpacity),
                align: props.textAlign,
                baseline: 'top',
            });
            label.letterSpacing = props.letterSpacing;
            objects.push(label);
        }
        return objects;
    },
});

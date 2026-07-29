import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Arc, Line, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';
import { parseFontSelection } from '@fonts/font-loader';

const NAMES: Record<number, string> = {
    1: 'Mod',
    2: 'Breath',
    7: 'Volume',
    10: 'Pan',
    11: 'Expr',
    64: 'Sustain',
    65: 'Portamento',
    66: 'Sostenuto',
    67: 'Soft Pdl',
    71: 'Resonance',
    72: 'Release',
    73: 'Attack',
    74: 'Cutoff',
    91: 'Reverb',
    93: 'Chorus',
};
const label = (controller: number) => (NAMES[controller] ? `${NAMES[controller]} (${controller})` : `CC ${controller}`);
interface Props extends Readonly<Record<string, any>> {}
export const ccMonitor = definePluginElement<Props, undefined>({
    type: 'ccMonitor',
    metadata: {
        name: 'CC Monitor',
        description: 'Monitor MIDI CC messages and sustain state',
        category: 'MIDI Displays',
    },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'ccSource',
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
                                key: 'mode',
                                label: 'Monitor Mode',
                                type: 'select',
                                default: 'fullMonitor',
                                options: [
                                    { value: 'fullMonitor', label: 'Full Monitor' },
                                    { value: 'singleCC', label: 'Single CC' },
                                    { value: 'sustainPedal', label: 'Sustain Pedal' },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'fullMonitorSettings',
                        label: 'Full Monitor Settings',
                        collapsed: false,
                        properties: [
                            { key: 'maxMessages', label: 'Max Messages', type: 'number', default: 8, min: 1, max: 20 },
                            {
                                key: 'fadeDuration',
                                label: 'Fade Duration',
                                type: 'number',
                                default: 3,
                                min: 0.5,
                                max: 10,
                            },
                        ],
                    },
                    {
                        id: 'singleCCSettings',
                        label: 'Single CC Settings',
                        collapsed: false,
                        properties: [
                            {
                                key: 'ccController',
                                label: 'Controller (0–127)',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 127,
                            },
                            {
                                key: 'singleCCDisplayMode',
                                label: 'Display Mode',
                                type: 'select',
                                default: 'text',
                                options: [
                                    { value: 'text', label: 'Text' },
                                    { value: 'knob', label: 'Knob' },
                                    { value: 'opacity', label: 'Opacity' },
                                ],
                            },
                            { key: 'knobRadius', label: 'Knob Radius', type: 'number', default: 50 },
                            { key: 'knobTrackWidth', label: 'Track Width', type: 'number', default: 6 },
                            { key: 'knobTrackColor', label: 'Track Color', type: 'colorAlpha', default: '#444444FF' },
                            { key: 'knobValueColor', label: 'Value Color', type: 'colorAlpha', default: '#00AAFFFF' },
                            { key: 'opacityRectWidth', label: 'Rect Width', type: 'number', default: 120 },
                            { key: 'opacityRectHeight', label: 'Rect Height', type: 'number', default: 120 },
                            { key: 'opacityRectColor', label: 'Rect Color', type: 'colorAlpha', default: '#FFFFFFFF' },
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
                            { key: 'fontSize', label: 'Font Size', type: 'number', default: 24 },
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
                            { key: 'lineSpacing', label: 'Line Spacing', type: 'number', default: 6 },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: ['timeline.read'], optional: [] },
    render(props, _state, time, context) {
        const { family, weight = '400' } = parseFontSelection(String(props.fontFamily));
        const font = `${weight} ${props.fontSize}px ${family}, sans-serif`;
        const color = applyOpacity(props.color, props.opacity);
        const trackIds = props.midiTrackId ? [props.midiTrackId] : [];
        let width = 320;
        let height = props.fontSize + props.lineSpacing + 4;
        const content: RenderObject[] = [];
        if (props.mode === 'fullMonitor') {
            height = props.maxMessages * (props.fontSize + props.lineSpacing);
            const start = Math.max(0, time.seconds - Math.max(0.5, props.fadeDuration));
            const result = context.timeline!.selectCC({
                trackIds,
                startSeconds: start,
                endSeconds: Math.max(start, time.seconds),
            });
            const events = result.ok
                ? [...result.value].sort((a, b) => b.timeSeconds - a.timeSeconds).slice(0, props.maxMessages)
                : [];
            if (!events.length)
                content.push(
                    new Text(0, 0, 'CC Monitor — no recent events', font, { color: applyOpacity(color, 0.4) })
                );
            events.forEach((event, index) =>
                content.push(
                    new Text(
                        0,
                        index * (props.fontSize + props.lineSpacing),
                        `${label(event.controller)}: ${event.value}`,
                        font,
                        {
                            color: applyOpacity(
                                color,
                                Math.max(0, 1 - (time.seconds - event.timeSeconds) / props.fadeDuration)
                            ),
                        }
                    )
                )
            );
        } else if (props.mode === 'singleCC') {
            const controller = Math.max(0, Math.min(127, Math.round(props.ccController)));
            const result = context.timeline!.selectCC({
                trackIds,
                controller,
                startSeconds: 0,
                endSeconds: Math.max(0, time.seconds),
            });
            const events = result.ok ? result.value : [];
            const value = events.reduce((latest, event) => (event.timeSeconds > latest.timeSeconds ? event : latest), {
                timeSeconds: -1,
                value: 0,
            } as any).value;
            if (props.singleCCDisplayMode === 'text')
                content.push(new Text(0, 0, `${label(controller)}: ${value}`, font, { color }));
            else if (props.singleCCDisplayMode === 'opacity') {
                width = props.opacityRectWidth;
                height = props.opacityRectHeight;
                const rect = new Rectangle(0, 0, width, height, { fillColor: props.opacityRectColor });
                rect.setOpacity(value / 127);
                content.push(rect);
            } else {
                const radius = props.knobRadius;
                const trackWidth = props.knobTrackWidth;
                width = height = radius * 2 + trackWidth * 2;
                const start = Math.PI * 0.75;
                const sweep = Math.PI * 1.5;
                const angle = start + (value / 127) * sweep;
                const track = new Arc(0, 0, radius, {
                    startAngle: start,
                    endAngle: start + sweep,
                    fillColor: null,
                    strokeColor: props.knobTrackColor,
                    strokeWidth: trackWidth,
                });
                track.setLineCap('round');
                content.push(track);
                if (value > 0) {
                    const arc = new Arc(0, 0, radius, {
                        startAngle: start,
                        endAngle: angle,
                        fillColor: null,
                        strokeColor: props.knobValueColor,
                        strokeWidth: trackWidth,
                    });
                    arc.setLineCap('round');
                    content.push(arc);
                }
                const pointer = new Line(0, 0, Math.cos(angle) * radius * 0.65, Math.sin(angle) * radius * 0.65, {
                    color: props.knobValueColor,
                    lineWidth: Math.max(1, trackWidth * 0.75),
                });
                pointer.lineCap = 'round';
                content.push(pointer);
                content.push(
                    new Arc(0, 0, trackWidth * 0.75, {
                        startAngle: 0,
                        endAngle: Math.PI * 2,
                        fillColor: color,
                        strokeColor: null,
                    })
                );
            }
        } else {
            const result = context.timeline!.getSustain({ trackIds, timeSeconds: Math.max(0, time.seconds) });
            const sustained = result.ok && result.value;
            content.push(
                new Text(0, 0, sustained ? 'SUSTAIN  ON' : 'SUSTAIN  OFF', font, {
                    color: sustained ? '#FFFFFFFF' : applyOpacity(color, 0.4),
                })
            );
        }
        const bounds = new Rectangle(0, 0, width, height, { fillColor: null });
        content.forEach((object) => object.setLayoutParticipation('exclude'));
        return [bounds, ...content];
    },
});
export const CCMonitorElement = createBuiltInDefinitionElementClass(ccMonitor);

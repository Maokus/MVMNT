import { SceneElement } from '../base';
import type { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text, Arc, Rectangle, Line } from '@core/render/render-objects';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { getPluginHostApi, PLUGIN_CAPABILITIES, type PluginHostApi } from '@mvmnt/plugin-sdk';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { applyOpacity } from '@utils/color';
import type { TimelineCCEvent } from '@core/timing/types';

// Common CC controller names for compact display
const CC_NAMES: Record<number, string> = {
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

function ccLabel(controller: number): string {
    const name = CC_NAMES[controller];
    return name ? `${name} (${controller})` : `CC ${controller}`;
}

function applyAlpha(hexColor: string, alpha: number): string {
    const baseHex = hexColor.replace(/^#/, '');
    const rgb = baseHex.length === 8 ? baseHex.slice(0, 6) : baseHex.length === 6 ? baseHex : 'cccccc';
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${rgb}${a}`;
}

// Knob geometry: 270° sweep, gap centred at the bottom
// MIN position = 7:30 on a clock face = 135° from the canvas x-axis (0 = 3 o'clock)
const KNOB_START = (3 / 4) * Math.PI; // 135° = 2.356 rad
const KNOB_SWEEP = (3 / 2) * Math.PI; // 270°

export class CCMonitorElement extends SceneElement {
    constructor(id = 'ccMonitor', config: Record<string, unknown> = {}) {
        super('ccMonitor', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const whenMode = (mode: string) => [{ key: 'mode', equals: mode }];
        const whenSingleCC = [{ key: 'mode', equals: 'singleCC' }];
        const whenKnob = [
            { key: 'mode', equals: 'singleCC' },
            { key: 'singleCCDisplayMode', equals: 'knob' },
        ];
        const whenOpacity = [
            { key: 'mode', equals: 'singleCC' },
            { key: 'singleCCDisplayMode', equals: 'opacity' },
        ];

        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'CC Monitor',
                description:
                    'Monitor MIDI CC messages — full event log, single controller value, or sustain pedal state.',
                category: 'MIDI Displays',
            },
            [
                tab.content([
                    {
                        id: 'ccSource',
                        label: 'Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track'),
                            prop.select('mode', 'Monitor Mode', 'fullMonitor', [
                                { value: 'fullMonitor', label: 'Full Monitor' },
                                { value: 'singleCC', label: 'Single CC' },
                                { value: 'sustainPedal', label: 'Sustain Pedal' },
                            ]),
                        ],
                    },
                    {
                        id: 'fullMonitorSettings',
                        label: 'Full Monitor Settings',
                        collapsed: false,
                        description: 'Recent CC events scroll up and fade out over time.',
                        properties: [
                            prop.number('maxMessages', 'Max Messages', 8, {
                                min: 1,
                                max: 20,
                                step: 1,
                                visibleWhen: whenMode('fullMonitor'),
                            }),
                            prop.number('fadeDuration', 'Fade Duration (sec)', 3, {
                                min: 0.5,
                                max: 10,
                                step: 0.1,
                                visibleWhen: whenMode('fullMonitor'),
                            }),
                        ],
                    },
                    {
                        id: 'singleCCSettings',
                        label: 'Single CC Settings',
                        collapsed: false,
                        description: 'Display the current value of one CC controller.',
                        properties: [
                            prop.number('ccController', 'Controller (0–127)', 1, {
                                min: 0,
                                max: 127,
                                step: 1,
                                visibleWhen: whenSingleCC,
                            }),
                            prop.select(
                                'singleCCDisplayMode',
                                'Display Mode',
                                'text',
                                [
                                    { value: 'text', label: 'Text' },
                                    { value: 'knob', label: 'Knob' },
                                    { value: 'opacity', label: 'Opacity' },
                                ],
                                { visibleWhen: whenSingleCC }
                            ),
                            // Knob options
                            prop.number('knobRadius', 'Knob Radius (px)', 50, {
                                min: 10,
                                max: 200,
                                step: 1,
                                visibleWhen: whenKnob,
                            }),
                            prop.number('knobTrackWidth', 'Track Stroke Width (px)', 6, {
                                min: 1,
                                max: 30,
                                step: 1,
                                visibleWhen: whenKnob,
                            }),
                            prop.color('knobTrackColor', 'Track Color', '#444444', { visibleWhen: whenKnob }),
                            prop.color('knobValueColor', 'Value Color', '#00aaff', { visibleWhen: whenKnob }),
                            // Opacity rect options
                            prop.number('opacityRectWidth', 'Rect Width (px)', 120, {
                                min: 1,
                                max: 1920,
                                step: 1,
                                visibleWhen: whenOpacity,
                            }),
                            prop.number('opacityRectHeight', 'Rect Height (px)', 120, {
                                min: 1,
                                max: 1080,
                                step: 1,
                                visibleWhen: whenOpacity,
                            }),
                            prop.color('opacityRectColor', 'Rect Color', '#ffffff', { visibleWhen: whenOpacity }),
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance(),
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            prop.font('fontFamily', 'Font Family', 'Inter'),
                            prop.number('fontSize', 'Font Size (px)', 24, { min: 6, max: 72, step: 1 }),
                            prop.select('textAlign', 'Alignment', 'left', [
                                { value: 'left', label: 'Left' },
                                { value: 'center', label: 'Center' },
                                { value: 'right', label: 'Right' },
                            ]),
                            prop.number('lineSpacing', 'Line Spacing (px)', 6, { min: 0, max: 40, step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const mode = (props.mode as string) ?? 'fullMonitor';
        const fontSize = (props.fontSize as number) ?? 24;
        const lineSpacing = (props.lineSpacing as number) ?? 6;

        // Compute layout bounds from mode and content settings
        let layoutWidth: number;
        let layoutHeight: number;
        if (mode === 'singleCC') {
            const displayMode = (props.singleCCDisplayMode as string) ?? 'text';
            if (displayMode === 'knob') {
                const knobRadius = (props.knobRadius as number) ?? 50;
                const trackWidth = (props.knobTrackWidth as number) ?? 6;
                const size = knobRadius * 2 + trackWidth * 2;
                layoutWidth = size;
                layoutHeight = size;
            } else if (displayMode === 'opacity') {
                layoutWidth = (props.opacityRectWidth as number) ?? 120;
                layoutHeight = (props.opacityRectHeight as number) ?? 120;
            } else {
                layoutWidth = 320;
                layoutHeight = fontSize + lineSpacing + 4;
            }
        } else if (mode === 'fullMonitor') {
            const maxMessages = Math.max(1, (props.maxMessages as number) ?? 8);
            layoutWidth = 320;
            layoutHeight = maxMessages * (fontSize + lineSpacing);
        } else {
            // sustainPedal
            layoutWidth = 320;
            layoutHeight = fontSize + lineSpacing + 4;
        }

        const layoutRect = new Rectangle(0, 0, layoutWidth, layoutHeight, null, null, 0);
        layoutRect.setIncludeInLayoutBounds(true);

        const trackId = (props.midiTrackId as string | null) ?? null;
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        const fontSelection = (props.fontFamily as string) ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const textColor = applyOpacity(
            (props.color as string) ?? (props.textColor as string) ?? '#cccccc',
            (props.opacity as number) ?? 1
        );
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        let contentObjects: RenderObject[] = [];
        if (mode === 'fullMonitor') {
            contentObjects = this._buildFullMonitor({
                props,
                targetTime,
                api,
                status,
                trackId,
                font,
                textColor,
                fontSize,
                lineSpacing,
            });
        } else if (mode === 'singleCC') {
            contentObjects = this._buildSingleCC({
                props,
                targetTime,
                api,
                status,
                trackId,
                font,
                textColor,
                fontSize,
            });
        } else if (mode === 'sustainPedal') {
            contentObjects = this._buildSustainPedal({ props, targetTime, api, status, trackId, font, textColor });
        }

        for (const obj of contentObjects) {
            obj.setIncludeInLayoutBounds(false);
        }

        return [layoutRect, ...contentObjects];
    }

    private _buildFullMonitor(ctx: {
        props: Record<string, unknown>;
        targetTime: number;
        api: PluginHostApi | null;
        status: string;
        trackId: string | null;
        font: string;
        textColor: string;
        fontSize: number;
        lineSpacing: number;
    }): RenderObject[] {
        const { props, targetTime, api, status, trackId, font, textColor, fontSize, lineSpacing } = ctx;
        const fadeDuration = Math.max(0.5, (props.fadeDuration as number) ?? 3);
        const maxMessages = Math.max(1, (props.maxMessages as number) ?? 8);

        let events: TimelineCCEvent[] = [];
        if (trackId && api && status === 'ok') {
            events = api.timeline.selectCCInWindow({
                trackIds: [trackId],
                startSec: Math.max(0, targetTime - fadeDuration),
                endSec: targetTime,
            });
        }

        if (events.length === 0) {
            return [new Text(0, 0, 'CC Monitor — no recent events', font, applyAlpha(textColor, 0.4), 'left', 'top')];
        }

        // Newest first, capped at maxMessages
        const visible = events
            .slice()
            .sort((a, b) => b.timeSec - a.timeSec)
            .slice(0, maxMessages);

        return visible.map((event, i) => {
            const age = targetTime - event.timeSec;
            const alpha = Math.max(0, 1 - age / fadeDuration);
            const color = applyAlpha(textColor, alpha);
            const label = `${ccLabel(event.controller)}: ${event.value}`;
            return new Text(0, i * (fontSize + lineSpacing), label, font, color, 'left', 'top');
        });
    }

    private _buildSingleCC(ctx: {
        props: Record<string, unknown>;
        targetTime: number;
        api: PluginHostApi | null;
        status: string;
        trackId: string | null;
        font: string;
        textColor: string;
        fontSize: number;
    }): RenderObject[] {
        const { props, targetTime, api, status, trackId, font, textColor } = ctx;
        const controller = Math.max(0, Math.min(127, Math.round((props.ccController as number) ?? 1)));
        const displayMode = (props.singleCCDisplayMode as string) ?? 'text';

        // Find the most recent value at or before targetTime
        let ccValue = 0;
        if (trackId && api && status === 'ok') {
            const events = api.timeline.selectCCInWindow({
                trackIds: [trackId],
                controller,
                startSec: 0,
                endSec: Math.max(0, targetTime),
            });
            if (events.length > 0) {
                ccValue = events.reduce((latest: TimelineCCEvent, e: TimelineCCEvent) =>
                    e.timeSec > latest.timeSec ? e : latest
                ).value;
            }
        }

        if (displayMode === 'text') {
            const label = `${ccLabel(controller)}: ${ccValue}`;
            return [new Text(0, 0, label, font, textColor, 'left', 'top')];
        }

        if (displayMode === 'knob') {
            return this._buildKnob({
                value: ccValue,
                maxValue: 127,
                textColor,
                knobRadius: (props.knobRadius as number) ?? 50,
                trackWidth: (props.knobTrackWidth as number) ?? 6,
                trackColor: (props.knobTrackColor as string) ?? '#444444',
                valueColor: (props.knobValueColor as string) ?? '#00aaff',
            });
        }

        if (displayMode === 'opacity') {
            const w = (props.opacityRectWidth as number) ?? 120;
            const h = (props.opacityRectHeight as number) ?? 120;
            const color = (props.opacityRectColor as string) ?? '#ffffff';
            const rect = new Rectangle(0, 0, w, h, color, null, 0);
            rect.setOpacity(ccValue / 127);
            return [rect];
        }

        return [];
    }

    private _buildKnob(ctx: {
        value: number;
        maxValue: number;
        textColor: string;
        knobRadius: number;
        trackWidth: number;
        trackColor: string;
        valueColor: string;
    }): RenderObject[] {
        const { value, maxValue, textColor, knobRadius, trackWidth, trackColor, valueColor } = ctx;
        const t = Math.max(0, Math.min(1, value / maxValue));
        const indicatorAngle = KNOB_START + t * KNOB_SWEEP;

        const results: RenderObject[] = [];

        // Background track (full 270° sweep)
        const track = new Arc(0, 0, knobRadius, KNOB_START, KNOB_START + KNOB_SWEEP, false, {
            fillColor: null,
            strokeColor: trackColor,
            strokeWidth: trackWidth,
        });
        track.setLineCap('round');
        results.push(track);

        // Value fill arc (min to current)
        if (t > 0) {
            const valueArc = new Arc(0, 0, knobRadius, KNOB_START, indicatorAngle, false, {
                fillColor: null,
                strokeColor: valueColor,
                strokeWidth: trackWidth,
            });
            valueArc.setLineCap('round');
            results.push(valueArc);
        }

        // Pointer line from centre outward
        const pointerLen = knobRadius * 0.65;
        const px = Math.cos(indicatorAngle) * pointerLen;
        const py = Math.sin(indicatorAngle) * pointerLen;
        const pointer = new Line(0, 0, px, py, valueColor, Math.max(1, trackWidth * 0.75));
        pointer.lineCap = 'round';
        results.push(pointer);

        // Centre dot
        const dot = new Arc(0, 0, trackWidth * 0.75, 0, Math.PI * 2, false, {
            fillColor: textColor,
            strokeColor: null,
        });
        results.push(dot);

        return results;
    }

    private _buildSustainPedal(ctx: {
        props: Record<string, unknown>;
        targetTime: number;
        api: PluginHostApi | null;
        status: string;
        trackId: string | null;
        font: string;
        textColor: string;
    }): RenderObject[] {
        const { targetTime, api, status, trackId, font, textColor } = ctx;

        let sustained = false;
        if (trackId && api && status === 'ok') {
            sustained = api.timeline.getSustainStateAtTime({
                trackIds: [trackId],
                timeSec: Math.max(0, targetTime),
            });
        }

        const label = sustained ? 'SUSTAIN  ON' : 'SUSTAIN  OFF';
        const color = sustained ? '#ffffff' : applyAlpha(textColor, 0.4);
        return [new Text(0, 0, label, font, color, 'left', 'top')];
    }

    override dispose(): void {
        super.dispose();
    }
}

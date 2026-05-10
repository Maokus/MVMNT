// Notes Played Tracker element: shows counts of played notes and events from a MIDI file
import { SceneElement } from '../base';
import type { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text, Rectangle } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { applyOpacity } from '@utils/color';

export class NotesPlayedTrackerElement extends SceneElement {
    // Phase 3 reference pattern: intentionally consume timeline data through the public plugin API.
    constructor(id: string = 'notesPlayedTracker', config: { [key: string]: any } = {}) {
        super('notesPlayedTracker', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Notes Played Tracker',
                description: 'Displays how many notes/events have played so far (timeline-backed)',
                category: 'MIDI Displays',
            },
            [
                tab.content([
                    propGroup.midiSource(),
                    {
                        id: 'formatting',
                        label: 'Formatting',
                        collapsed: false,
                        description: 'Customize the display string using tokens like #playedNotes.',
                        properties: [
                            prop.longString(
                                'formatString',
                                'Format String',
                                'Num played notes: #playedNotes/#totalNotes (#percentNotes%)\nNum played events: #playedEvents/#totalEvents (#percentEvents%)'
                            ),
                        ],
                        presets: [
                            {
                                id: 'resetDefault',
                                label: 'Reset to Default',
                                values: {
                                    formatString:
                                        'Num played notes: #playedNotes/#totalNotes (#percentNotes%)\nNum played events: #playedEvents/#totalEvents (#percentEvents%)',
                                },
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance(),
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        description: 'Adjust alignment and styling for the counters.',
                        properties: [
                            prop.font('fontFamily', 'Font Family', 'Inter'),
                            prop.number('fontSize', 'Font Size (px)', 30, { min: 6, max: 72, step: 1 }),
                            prop.select('textAlign', 'Text Alignment', 'left', [
                                { value: 'left', label: 'Left' },
                                { value: 'center', label: 'Center' },
                                { value: 'right', label: 'Right' },
                            ]),
                            prop.number('lineSpacing', 'Line Spacing (px)', 4, { min: 0, max: 40, step: 1 }),
                        ],
                    },
                    propGroup.container(),
                ]),
            ]
        );
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const renderObjects: RenderObject[] = [];

        const effectiveTime = Math.max(0, targetTime);
        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        // Compute counts from notes via timeline
        const trackId = props.midiTrackId;
        // To compute totals, we need all notes; if service doesn't expose a direct getter, approximate using a large window
        let totalNotes = 0;
        let playedNotes = 0;
        let playedEvents = 0;
        if (trackId && (!api || status !== 'ok')) {
            const message =
                status === 'unsupported-version'
                    ? 'Plugin API version unsupported'
                    : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
                      ? 'Timeline API unavailable (requires timeline.read)'
                      : 'Plugin host API unavailable';
            renderObjects.push(new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return renderObjects;
        }
        if (trackId) {
            const all =
                api?.timeline.selectNotesInWindow({
                    trackIds: [trackId],
                    startSec: 0,
                    endSec: Number.POSITIVE_INFINITY,
                }) ?? [];
            totalNotes = all.length;
            if (targetTime >= 0) {
                for (const note of all) {
                    if ((note.startTime ?? 0) <= effectiveTime) {
                        playedNotes += 1;
                        playedEvents += 1;
                    }
                    if ((note.endTime ?? 0) <= effectiveTime) {
                        playedEvents += 1;
                    }
                }
            }
        }
        const totalEvents = totalNotes * 2;

        const pctNotes = totalNotes > 0 ? (playedNotes / totalNotes) * 100 : 0;
        const pctEvents = totalEvents > 0 ? (playedEvents / totalEvents) * 100 : 0;

        // Appearance
        const fontSelection = props.fontFamily ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 30;
        const color = applyOpacity(props.color ?? '#cccccc', props.opacity ?? 1);
        const lineSpacing = props.lineSpacing ?? 4;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        const formatTemplate = (template: string, values: Record<string, string>) =>
            template.replace(
                /#(playedNotes|totalNotes|percentNotes|playedEvents|totalEvents|percentEvents)/g,
                (_, token) => values[token] ?? ''
            );

        const displayValues = {
            playedNotes: playedNotes.toString(),
            totalNotes: totalNotes.toString(),
            percentNotes: pctNotes.toFixed(2),
            playedEvents: playedEvents.toString(),
            totalEvents: totalEvents.toString(),
            percentEvents: pctEvents.toFixed(2),
        };
        const layoutValues = {
            playedNotes: totalNotes.toString(),
            totalNotes: totalNotes.toString(),
            percentNotes: '100.00',
            playedEvents: totalEvents.toString(),
            totalEvents: totalEvents.toString(),
            percentEvents: '100.00',
        };
        const template =
            (props.formatString as string) ??
            'Num played notes: #playedNotes/#totalNotes (#percentNotes%)\nNum played events: #playedEvents/#totalEvents (#percentEvents%)';
        const displayText = formatTemplate(template, displayValues);
        const layoutText = formatTemplate(template, layoutValues);

        const measureWidth = (text: string, fontStr: string): number => {
            try {
                if (typeof OffscreenCanvas !== 'undefined') {
                    const c = new OffscreenCanvas(1, 1);
                    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
                    if (ctx) {
                        ctx.font = fontStr;
                        return ctx.measureText(text).width || 0;
                    }
                }
                if (typeof document !== 'undefined') {
                    const c = document.createElement('canvas');
                    const ctx = c.getContext('2d');
                    if (ctx) {
                        ctx.font = fontStr;
                        return ctx.measureText(text).width || 0;
                    }
                }
            } catch {}
            const m = fontStr.match(/(\d*\.?\d+)px/);
            const fs = m ? parseFloat(m[1]) : 16;
            return text.length * fs * 0.6;
        };

        const displayLines = displayText.split(/\r?\n/);
        const layoutLines = layoutText.split(/\r?\n/);
        const layoutWidth = Math.max(1, ...layoutLines.map((line) => measureWidth(line, font)));
        const layoutHeight =
            layoutLines.length > 0
                ? layoutLines.length * fontSize + Math.max(0, layoutLines.length - 1) * lineSpacing
                : fontSize;
        const justification = (props.textAlign ?? props.textJustification ?? 'left') as CanvasTextAlign;
        const layoutX = justification === 'center' ? -layoutWidth / 2 : justification === 'right' ? -layoutWidth : 0;

        const layoutRect = new Rectangle(layoutX, 0, layoutWidth, layoutHeight, null, null, 0);
        layoutRect.setIncludeInLayoutBounds(true);
        renderObjects.push(layoutRect);

        displayLines.forEach((line, index) => {
            const y = index * (fontSize + lineSpacing);
            const textObj = new Text(0, y, line, font, color, justification, 'top', {
                includeInLayoutBounds: false,
            });
            renderObjects.push(textObj);
        });

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bgWidth = layoutWidth + paddingX * 2;
            const bgHeight = layoutHeight + paddingY * 2;
            const bg = new Rectangle(layoutX - paddingX, -paddingY, bgWidth, bgHeight, bgColor);
            if (props.backgroundCornerRadius) bg.cornerRadius = props.backgroundCornerRadius;
            bg.setIncludeInLayoutBounds?.(false);
            renderObjects.unshift(bg);
        }

        return renderObjects;
    }

    dispose(): void {
        super.dispose();
    }
}

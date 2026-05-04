// Notes Playing Display: show currently playing notes per channel/track
import { SceneElement } from '../base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text, Rectangle } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { applyOpacity } from '@utils/color';

export class NotesPlayingDisplayElement extends SceneElement {
    constructor(id: string = 'notesPlayingDisplay', config: { [key: string]: any } = {}) {
        super('notesPlayingDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Notes Playing Display',
                description: 'Displays active notes and velocities per track/channel (timeline-backed)',
                category: 'MIDI Displays',
            },
            [
                {
                    id: 'midiSource',
                    label: 'Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Select which MIDI track(s) feed the live note readout.',
                    properties: [
                        prop.midiTrack('midiTrackId', 'MIDI Track'),
                        prop.boolean('showAllAvailableTracks', 'Show All Tracks When Idle', false),
                    ],
                    presets: [
                        { id: 'singleTrack', label: 'Single Track', values: { showAllAvailableTracks: false } },
                        { id: 'multiTrack', label: 'Multi-Track Overview', values: { showAllAvailableTracks: true } },
                    ],
                },
                propGroup.appearance(),
                {
                    id: 'typography',
                    label: 'Typography',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Tweak alignment and spacing for the note list.',
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
                    presets: [
                        {
                            id: 'compact',
                            label: 'Compact List',
                            values: { fontSize: 24, lineSpacing: 2, color: '#cbd5f5' },
                        },
                        {
                            id: 'stageReadout',
                            label: 'Stage Readout',
                            values: { fontSize: 36, lineSpacing: 6, color: '#f8fafc' },
                        },
                        {
                            id: 'monitor',
                            label: 'Monitor Overlay',
                            values: { fontSize: 28, lineSpacing: 4, color: '#22d3ee' },
                        },
                    ],
                },
                propGroup.container(),
            ]
        );
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const renderObjects: RenderObject[] = [];

        const effectiveTime = Math.max(0, targetTime);

        // Determine active notes at effectiveTime via plugin host API
        const trackId = props.midiTrackId;
        const active: { note: number; vel: number; channel: number }[] = [];
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        if (trackId && api && status === 'ok') {
            const EPS = 1e-3;
            const notes = api.timeline.selectNotesInWindow({
                trackIds: [trackId],
                startSec: effectiveTime - EPS,
                endSec: effectiveTime + EPS,
            });
            for (const n of notes) active.push({ note: n.note, vel: n.velocity || 0, channel: n.channel });
        }

        // Group by channel to represent tracks succinctly (Track N ~= Channel N+1)
        const byChannel = new Map<number, { note: number; vel: number }[]>();
        for (const n of active as any[]) {
            const arr = byChannel.get(n.channel) || [];
            arr.push({ note: n.note, vel: n.vel });
            byChannel.set(n.channel, arr);
        }

        // Compute all channels present in the loaded MIDI file
        const allChannelsSet = new Set<number>(); // unknown without full file; leave empty unless showAll forces placeholder
        const showAll = props.showAllAvailableTracks ?? false;

        // Appearance
        const fontSelection = props.fontFamily ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 30;
        const color = applyOpacity(props.color ?? '#cccccc', props.opacity ?? 1);
        const lineSpacing = props.lineSpacing ?? 4;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        // Build lines following the requested format
        // Example: "Note: Bb1 (Vel: 78) Note: A2 (Vel: 60) < Track 1"
        const noteName = (midiNote: number): string => {
            const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const octave = Math.floor(midiNote / 12) - 1;
            const name = names[midiNote % 12];
            return `${name}${octave}`;
        };

        // Helper to measure text width robustly
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
            // Fallback approximate: characters * fontSize * average factor
            const m = fontStr.match(/(\d*\.?\d+)px/);
            const fs = m ? parseFloat(m[1]) : 16;
            return text.length * fs * 0.6;
        };

        let y = 0;
        if ((byChannel.size === 0 || targetTime < 0) && !showAll) {
            const justification = (props.textAlign ?? props.textJustification ?? 'left') as CanvasTextAlign;
            const placeholderLeft = justification === 'left';
            const staticPrefix = placeholderLeft ? 'Track 1 > ' : ' < Track 1';
            const dynamicText = 'Note: ';
            if (placeholderLeft) {
                // Left: Track > Note
                const staticObj = new Text(0, 0, staticPrefix, font, color, 'left', 'top');
                const dynamicObj = new Text(0, 0, dynamicText, font, color, 'left', 'top', {
                    includeInLayoutBounds: false,
                });
                // Measure static to place dynamic right after
                dynamicObj.x = measureWidth(staticPrefix, font); // place to the right of static
                renderObjects.push(staticObj, dynamicObj);
            } else {
                // Right: Note < Track
                const staticObj = new Text(0, 0, staticPrefix, font, color, 'right', 'top');
                const dynamicObj = new Text(0, 0, dynamicText, font, color, 'right', 'top', {
                    includeInLayoutBounds: false,
                });
                // Measure static to place dynamic left of it
                dynamicObj.x = -measureWidth(staticPrefix, font); // place to the left of static (since align right)
                renderObjects.push(dynamicObj, staticObj);
            }
            if (props.showBackground) {
                const paddingX = props.backgroundPaddingX ?? 8;
                const paddingY = props.backgroundPaddingY ?? 4;
                const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
                const bg = new Rectangle(-paddingX, -paddingY, 400 + paddingX * 2, 120 + paddingY * 2, bgColor);
                if (props.backgroundCornerRadius) bg.cornerRadius = props.backgroundCornerRadius;
                renderObjects.unshift(bg);
            }
            return renderObjects;
        }

        const justification = (props.textAlign ?? props.textJustification ?? 'left') as CanvasTextAlign;
        const sortedChannels = Array.from(byChannel.keys()).sort((a, b) => a - b);
        for (const ch of sortedChannels) {
            const list = byChannel.get(ch) || [];
            list.sort((a, b) => a.note - b.note || a.vel - b.vel);
            const parts = list.map((n) => `Note: ${noteName(n.note)} (Vel: ${Math.max(0, Math.min(127, n.vel))})`);

            if (justification === 'left') {
                // Left-justified: Track > Note
                const staticPrefix = `Track ${ch + 1} > `;
                const staticObj = new Text(0, y, staticPrefix, font, color, 'left', 'top');
                renderObjects.push(staticObj);
                if (parts.length > 0) {
                    const dynamicObj = new Text(0, y, parts.join(' '), font, color, 'left', 'top', {
                        includeInLayoutBounds: false,
                    });
                    // place dynamic after static by measuring static width
                    dynamicObj.x = measureWidth(staticPrefix, font);
                    renderObjects.push(dynamicObj);
                }
            } else {
                // Right-justified: Note < Track
                const staticSuffix = ` < Track ${ch + 1}`;
                const staticObj = new Text(0, y, staticSuffix, font, color, 'right', 'top');
                if (parts.length > 0) {
                    const dynamicObj = new Text(0, y, parts.join(' '), font, color, 'right', 'top', {
                        includeInLayoutBounds: false,
                    });
                    // place dynamic to the left of static by measuring static width
                    dynamicObj.x = -measureWidth(staticSuffix, font);
                    // draw dynamic then static so the visual order matches anchor
                    renderObjects.push(dynamicObj);
                }
                renderObjects.push(staticObj);
            }
            y += fontSize + lineSpacing;
        }

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bgWidth = 400 + paddingX * 2;
            const bgHeight = 120 + paddingY * 2;
            const bg = new Rectangle(-paddingX, -paddingY, bgWidth, bgHeight, bgColor);
            if (props.backgroundCornerRadius) bg.cornerRadius = props.backgroundCornerRadius;
            renderObjects.unshift(bg);
        }

        return renderObjects;
    }

    dispose(): void {
        super.dispose();
    }
}

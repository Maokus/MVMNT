// Notes Playing Display: show currently playing notes per channel/track
import { SceneElement } from '../base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text, Rectangle } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
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
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'Source',
                        collapsed: false,
                        description: 'Select which MIDI track(s) feed the live note readout.',
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track'),
                            prop.boolean('showAllAvailableTracks', 'Show All Tracks When Idle', false),
                        ],
                    },
                    {
                        id: 'display',
                        label: 'Display',
                        collapsed: false,
                        description: 'Choose how active notes are visualized.',
                        properties: [
                            prop.select('displayMode', 'Display Mode', 'letters', [
                                { value: 'letters', label: 'Letters' },
                                { value: 'grid', label: 'Grid' },
                            ]),
                            prop.number('lettersSpacing', 'Letters Spacing (px)', 32, {
                                min: 4,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'letters' }],
                            }),
                            prop.number('gridColumns', 'Columns', 12, {
                                min: 1,
                                max: 128,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.number('gridRows', 'Rows', 12, {
                                min: 1,
                                max: 32,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.number('gridRowNoteOffset', 'Row Note Offset', 12, {
                                min: 1,
                                max: 127,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                                description: 'MIDI note offset between rows. E.g. 12 = octave, 5 = perfect fourth.',
                            }),
                            prop.number('gridStartNote', 'Start Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                                description:
                                    'MIDI note at grid position [0,0]. Set to -1 to auto-detect from the MIDI file.',
                            }),
                            prop.number('gridCellWidth', 'Grid Cell Width (px)', 65, {
                                min: 6,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.number('gridCellHeight', 'Grid Cell Height (px)', 65, {
                                min: 6,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.number('gridCellGap', 'Grid Cell Gap (px)', 4, {
                                min: 0,
                                max: 60,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.number('gridCornerRadius', 'Grid Corner Radius (px)', 4, {
                                min: 0,
                                max: 80,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.color('gridFillColor', 'Grid Fill Color', '#EFEFEF', {
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.range('gridFillOpacity', 'Grid Fill Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.color('gridTextColor', 'Grid Text Color', '#0f172a', {
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.number('gridStrokeWidth', 'Grid Stroke Width (px)', 0, {
                                min: 0,
                                max: 12,
                                step: 1,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.color('gridStrokeColor', 'Grid Stroke Color', '#0f172a', {
                                visibleWhen: [
                                    { key: 'displayMode', equals: 'grid' },
                                    { key: 'gridStrokeWidth', truthy: true },
                                ],
                            }),
                            prop.range('gridTextOpacity', 'Grid Text Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance(),
                    {
                        id: 'typography',
                        label: 'Typography',
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

        // Appearance
        const fontSelection = props.fontFamily ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 30;
        const color = applyOpacity(props.color ?? '#cccccc', props.opacity ?? 1);
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteLabel = (midiNote: number): string => {
            const octave = Math.floor(midiNote / 12) - 1;
            return `${noteNames[midiNote % 12]}${octave}`;
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
        const displayMode = (props.displayMode as string) ?? 'letters';
        const showAll = props.showAllAvailableTracks ?? false;

        // Determine active notes at effectiveTime via plugin host API
        const trackId = props.midiTrackId;
        const activeNotes = new Set<number>();
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        if (trackId && api && status === 'ok') {
            const EPS = 1e-3;
            const notes = api.timeline.selectNotesInWindow({
                trackIds: [trackId],
                startSec: effectiveTime - EPS,
                endSec: effectiveTime + EPS,
            });
            for (const n of notes) {
                if (typeof n.note === 'number') activeNotes.add(n.note);
            }
        }

        let layoutWidth = 1;
        let layoutHeight = fontSize;
        if (displayMode === 'grid') {
            const columns = Math.max(1, Math.floor((props.gridColumns as number) ?? 12));
            const rows = Math.max(1, Math.floor((props.gridRows as number) ?? 8));
            const cellWidth = Math.max(1, (props.gridCellWidth as number) ?? 42);
            const cellHeight = Math.max(1, (props.gridCellHeight as number) ?? 28);
            const cellGap = Math.max(0, (props.gridCellGap as number) ?? 4);
            layoutWidth = columns * cellWidth + (columns - 1) * cellGap;
            layoutHeight = rows * cellHeight + (rows - 1) * cellGap;
        } else {
            const spacing = Math.max(1, (props.lettersSpacing as number) ?? 32);
            const letterWidth = Math.max(1, measureWidth('C#', font));
            layoutWidth = 11 * spacing + letterWidth;
            layoutHeight = fontSize;
        }

        const justification = (props.textAlign ?? props.textJustification ?? 'left') as CanvasTextAlign;
        const layoutX = justification === 'center' ? -layoutWidth / 2 : justification === 'right' ? -layoutWidth : 0;
        const layoutRect = new Rectangle(layoutX, 0, layoutWidth, layoutHeight, null, null, 0);
        layoutRect.setIncludeInLayoutBounds(true);
        renderObjects.push(layoutRect);

        if (displayMode === 'grid') {
            const columns = Math.max(1, Math.floor((props.gridColumns as number) ?? 12));
            const rows = Math.max(1, Math.floor((props.gridRows as number) ?? 8));
            const rowNoteOffset = Math.max(1, Math.floor((props.gridRowNoteOffset as number) ?? 12));
            const cellWidth = Math.max(1, (props.gridCellWidth as number) ?? 42);
            const cellHeight = Math.max(1, (props.gridCellHeight as number) ?? 28);
            const cellGap = Math.max(0, (props.gridCellGap as number) ?? 4);
            const cornerRadius = Math.max(0, (props.gridCornerRadius as number) ?? 4);
            const fillColor = applyOpacity(
                (props.gridFillColor as string) ?? '#22d3ee',
                (props.gridFillOpacity as number) ?? 1
            );
            const textColor = (props.gridTextColor as string) ?? '#0f172a';
            const textOpacity = (props.gridTextOpacity as number) ?? 1;
            const textColorWithOpacity = applyOpacity(textColor, textOpacity);
            const strokeWidth = Math.max(0, (props.gridStrokeWidth as number) ?? 0);
            const strokeColor = strokeWidth > 0 ? ((props.gridStrokeColor as string) ?? '#0f172a') : null;

            // Determine start note: auto-detect lowest note in MIDI file when -1
            let startNote = Math.floor((props.gridStartNote as number) ?? -1);
            if (startNote === -1) {
                if (trackId && api && status === 'ok') {
                    const allNotes = api.timeline.selectNotesInWindow({
                        trackIds: [trackId],
                        startSec: -99999,
                        endSec: 99999,
                    });
                    startNote = allNotes.length > 0 ? Math.min(...allNotes.map((n) => n.note)) : 0;
                } else {
                    startNote = 0;
                }
            }

            if (activeNotes.size === 0 && showAll) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < columns; c++) {
                        activeNotes.add(startNote + c + r * rowNoteOffset);
                    }
                }
            }

            // Render cells: iterate all grid positions and light up matching active notes
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < columns; c++) {
                    const cellNote = startNote + c + r * rowNoteOffset;
                    if (!activeNotes.has(cellNote)) continue;
                    // Higher rows = higher notes, rendered bottom-to-top
                    const x = layoutX + c * (cellWidth + cellGap);
                    const y = (rows - 1 - r) * (cellHeight + cellGap);
                    const cell = new Rectangle(x, y, cellWidth, cellHeight, fillColor, strokeColor, strokeWidth);
                    cell.cornerRadius = cornerRadius;
                    cell.setIncludeInLayoutBounds?.(false);
                    renderObjects.push(cell);

                    const label = noteLabel(cellNote);
                    const text = new Text(
                        x + cellWidth / 2,
                        y + cellHeight / 2,
                        label,
                        font,
                        textColorWithOpacity,
                        'center',
                        'middle',
                        { includeInLayoutBounds: false }
                    );
                    renderObjects.push(text);
                }
            }
        } else {
            const spacing = Math.max(1, (props.lettersSpacing as number) ?? 32);
            const activePitchClasses = new Set<number>();
            if (activeNotes.size === 0 && showAll) {
                for (let i = 0; i < 12; i += 1) activePitchClasses.add(i);
            } else {
                for (const note of activeNotes) activePitchClasses.add(note % 12);
            }
            for (let i = 0; i < 12; i += 1) {
                if (!activePitchClasses.has(i)) continue;
                const x = layoutX + i * spacing;
                const text = new Text(x, 0, noteNames[i], font, color, 'left', 'top', {
                    includeInLayoutBounds: false,
                });
                renderObjects.push(text);
            }
        }

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bg = new Rectangle(
                layoutX - paddingX,
                -paddingY,
                layoutWidth + paddingX * 2,
                layoutHeight + paddingY * 2,
                bgColor
            );
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

// Notes Playing Display: show currently playing notes per channel/track
import { SceneElement } from '../base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text, Rectangle } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { applyOpacity } from '@utils/color';

export class NotesPlayingDisplayElement extends SceneElement {
    constructor(id: string = 'notesPlayingDisplay', config: { [key: string]: any } = {}) {
        super('notesPlayingDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
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
                            prop.number('fadeOutDuration', 'Fade Out (s)', 0, {
                                min: 0,
                                max: 5,
                                step: 0.05,
                                description: 'How long a note takes to fade out after being released.',
                            }),
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
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        description: 'Animate notes at the moment they start playing.',
                        properties: [
                            prop.select('animationType', 'Animation', 'none', [
                                { value: 'none', label: 'None' },
                                { value: 'bump', label: 'Bump' },
                                { value: 'scale', label: 'Scale' },
                            ]),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'colors',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.color('textColor', 'Text Color', '#cccccc'),
                            prop.range('textOpacity', 'Text Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.color('gridFillColor', 'Grid Fill Color', '#EFEFEF', {
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                            prop.range('gridFillOpacity', 'Grid Fill Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'displayMode', equals: 'grid' }],
                            }),
                        ],
                    },
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
        const textColor = applyOpacity((props.textColor as string) ?? '#cccccc', (props.textOpacity as number) ?? 1);
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
        const fadeOutDuration = Math.max(0, (props.fadeOutDuration as number) ?? 0);
        const animationType = (props.animationType as string) ?? 'none';

        const trackId = props.midiTrackId;
        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);

        // Determine note state at effectiveTime purely from the timeline.
        // Active notes: started before effectiveTime, end after it.
        // Fading notes: ended within the fadeOutDuration window before effectiveTime.
        // Both are derived from note events — no frame-to-frame state is stored.
        const activeNotes = new Set<number>();
        // note → latest startTime among notes active at effectiveTime
        const noteOnTimes = new Map<number, number>();
        // note → latest endTime among notes that ended within the fade window
        const noteOffTimes = new Map<number, number>();

        if (trackId && host.ok) {
            const lookbackSec = Math.max(fadeOutDuration + 0.5, 10);
            const recent = host.api.timeline.selectNotesInWindow({
                trackIds: [trackId],
                startSec: effectiveTime - lookbackSec,
                endSec: effectiveTime + 0.1,
            });

            for (const n of recent) {
                if (n.startTime <= effectiveTime && effectiveTime < n.endTime) {
                    activeNotes.add(n.note);
                    const prev = noteOnTimes.get(n.note);
                    if (prev === undefined || n.startTime > prev) noteOnTimes.set(n.note, n.startTime);
                } else if (
                    fadeOutDuration > 0 &&
                    n.endTime <= effectiveTime &&
                    n.endTime >= effectiveTime - fadeOutDuration
                ) {
                    const prev = noteOffTimes.get(n.note);
                    if (prev === undefined || n.endTime > prev) noteOffTimes.set(n.note, n.endTime);
                }
            }

            // Active notes take precedence: remove from fading set.
            for (const note of activeNotes) noteOffTimes.delete(note);
        }

        // The set of notes that should appear this frame (active + still fading).
        const renderNotes = new Set<number>(activeNotes);
        if (fadeOutDuration > 0) {
            for (const [note] of noteOffTimes) renderNotes.add(note);
        }

        // Per-note helpers for fade opacity and animation scale — derived from event times only.
        const getNoteOpacity = (note: number): number => {
            if (activeNotes.has(note)) return 1;
            if (fadeOutDuration <= 0) return 0;
            const offTime = noteOffTimes.get(note);
            if (offTime === undefined) return 0;
            return Math.max(0, 1 - (effectiveTime - offTime) / fadeOutDuration);
        };

        const getNoteScale = (note: number): number => {
            if (animationType === 'none') return 1;
            const onTime = noteOnTimes.get(note);
            if (onTime === undefined) return 1;
            const elapsed = effectiveTime - onTime;
            if (animationType === 'bump') {
                // Quick overshoot: 1.3 → 1.0 over 150 ms (ease out)
                const duration = 0.15;
                if (elapsed >= duration) return 1;
                const t = elapsed / duration;
                return 1 + 0.3 * (1 - t * t);
            }
            if (animationType === 'scale') {
                // Smooth grow: 0 → 1 over 200 ms (ease in)
                const duration = 0.2;
                if (elapsed >= duration) return 1;
                const t = elapsed / duration;
                return t * t;
            }
            return 1;
        };

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
        const layoutRect = new Rectangle(layoutX, 0, layoutWidth, layoutHeight, { fillColor: null });
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
                (props.gridFillColor as string) ?? '#EFEFEF',
                (props.gridFillOpacity as number) ?? 1
            );
            const strokeWidth = Math.max(0, (props.gridStrokeWidth as number) ?? 0);
            const strokeColor = strokeWidth > 0 ? ((props.gridStrokeColor as string) ?? '#0f172a') : null;

            // Determine start note: auto-detect lowest note via SDK when -1
            let startNote = Math.floor((props.gridStartNote as number) ?? -1);
            if (startNote === -1) {
                const range = trackId && host.ok ? host.api.timeline.getNoteRange({ trackIds: [trackId] }) : null;
                startNote = range ? range.min : 0;
            }

            const renderNotesForGrid = new Set<number>(renderNotes);
            if (activeNotes.size === 0 && showAll) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < columns; c++) {
                        renderNotesForGrid.add(startNote + c + r * rowNoteOffset);
                    }
                }
            }

            // Render cells: iterate all grid positions and light up matching notes
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < columns; c++) {
                    const cellNote = startNote + c + r * rowNoteOffset;
                    if (!renderNotesForGrid.has(cellNote)) continue;
                    // Higher rows = higher notes, rendered bottom-to-top
                    const x = layoutX + c * (cellWidth + cellGap);
                    const y = (rows - 1 - r) * (cellHeight + cellGap);

                    const noteOpacity = getNoteOpacity(cellNote);
                    const noteScale = getNoteScale(cellNote);
                    const cx = x + cellWidth / 2;
                    const cy = y + cellHeight / 2;

                    const cell = new Rectangle(cx, cy, cellWidth, cellHeight, { fillColor, strokeColor, strokeWidth });
                    cell.cornerRadius = cornerRadius;
                    cell.setIncludeInLayoutBounds?.(false);
                    cell.opacity = noteOpacity;
                    cell.scaleX = noteScale;
                    cell.scaleY = noteScale;
                    // Pivot at centre so scale/opacity animate from the cell's centre
                    cell.setOrigin(cellWidth / 2, cellHeight / 2);
                    renderObjects.push(cell);

                    const label = noteLabel(cellNote);
                    const text = new Text(cx, cy, label, font, {
                        color: textColor,
                        align: 'center',
                        baseline: 'middle',
                        layoutParticipation: 'exclude',
                    });
                    text.setOpacity(noteOpacity).setScale(noteScale, noteScale).setOrigin(0, 0);
                    renderObjects.push(text);
                }
            }
        } else {
            const spacing = Math.max(1, (props.lettersSpacing as number) ?? 32);
            const activePitchClasses = new Set<number>();
            const fadingPitchClasses = new Map<number, { opacity: number; scale: number }>();

            for (const note of activeNotes) activePitchClasses.add(note % 12);
            // Collect fading pitch classes (keep highest opacity/scale per pitch class)
            for (const note of renderNotes) {
                const pc = note % 12;
                if (activePitchClasses.has(pc)) continue;
                const op = getNoteOpacity(note);
                const sc = getNoteScale(note);
                const existing = fadingPitchClasses.get(pc);
                if (!existing || op > existing.opacity) fadingPitchClasses.set(pc, { opacity: op, scale: sc });
            }

            for (let i = 0; i < 12; i += 1) {
                const isActive = activePitchClasses.has(i);
                const fading = fadingPitchClasses.get(i);
                if (!isActive && !fading) continue;

                const x = layoutX + i * spacing;
                const text = new Text(x, 0, noteNames[i], font, { color: textColor, layoutParticipation: 'exclude' });
                if (!isActive && fading) {
                    text.opacity = fading.opacity;
                    text.scaleX = fading.scale;
                    text.scaleY = fading.scale;
                } else if (isActive) {
                    const firstActiveNote = [...activeNotes].find((n) => n % 12 === i);
                    if (firstActiveNote !== undefined) {
                        text.scaleX = getNoteScale(firstActiveNote);
                        text.scaleY = getNoteScale(firstActiveNote);
                    }
                }
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
                { fillColor: bgColor }
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

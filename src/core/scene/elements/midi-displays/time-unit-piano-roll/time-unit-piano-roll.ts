// TimeUnitPianoRoll scene element with Property Binding System
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema, type PropertyDefinition } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { Line, Text, RenderObject, Rectangle, GlowLayer } from '@core/render/render-objects';
import { AnimationController } from './animation-controller';
import { getAnimationSelectOptions } from '@core/scene/elements/midi-displays/note-animations';
import { NoteBlock } from './note-block';
import { TimingManager } from '@core/timing/timing-manager';
import { getPluginHostApi, PLUGIN_CAPABILITIES, noteName } from '@mvmnt/plugin-sdk';
import { debugLog } from '@utils/debug-log';
import { normalizeColorAlphaValue, applyOpacity } from '@utils/color';
import { insertElementGroups, prop } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

const DEFAULT_ROLL_WIDTH = 800;
const DEFAULT_NOTE_COLOR = '#FF6B6B';

export class TimeUnitPianoRollElement extends SceneElement {
    public timingManager: TimingManager;
    public animationController: AnimationController;
    constructor(id: string = 'timeUnitPianoRoll', config: { [key: string]: any } = {}) {
        super('timeUnitPianoRoll', id, config);

        // Initialize per-element TimingManager for beat grid / window calculations
        this.timingManager = new TimingManager(this.id);

        // Initialize animation controller
        this.animationController = new AnimationController(this);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const channelColorDefaults = [
            '#ff6b6b',
            '#4ecdc4',
            '#45b7d1',
            '#96ceb4',
            '#feca57',
            '#ff9ff3',
            '#54a0ff',
            '#5f27cd',
            '#00d2d3',
            '#ff9f43',
            '#10ac84',
            '#ee5a24',
            '#0984e3',
            '#a29bfe',
            '#fd79a8',
            '#e17055',
        ];
        const createChannelPreset = (colors: string[]) =>
            colors.reduce<Record<string, string>>((acc, color, index) => {
                acc[`channel${index}Color`] = color;
                return acc;
            }, {});
        const channelColorProperties: PropertyDefinition[] = Array.from({ length: 16 }, (_, i) =>
            prop.color(`channel${i}Color`, `Channel ${i + 1}`, channelColorDefaults[i], {
                visibleWhen: [
                    { key: 'showNotes', truthy: true },
                    { key: 'useChannelColors', truthy: true },
                ],
            })
        );

        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Time Unit Piano Roll',
                description: 'Piano roll visualization split into time-aligned windows.',
                category: 'MIDI Displays',
            },
            [
                tab.content([
                    propGroup.midiSource(),
                    {
                        id: 'dimensions',
                        label: 'Layout & Range',
                        collapsed: false,
                        description: 'Configure viewport width, time window, and pitch range.',
                        properties: [
                            prop.number('rollWidth', 'Roll Width (px)', DEFAULT_ROLL_WIDTH, {
                                step: 50,
                                description: 'Width of the scrolling window in pixels.',
                            }),
                            prop.number('rollHeight', 'Roll Height (px)', 400, {
                                min: 20,
                                max: 4000,
                                step: 10,
                                description: 'Total height of the piano roll.',
                            }),
                            prop.number('timeUnitBars', 'Time Unit (bars)', 1, { min: 1, max: 8, step: 1 }),
                            prop.number('minNote', 'Minimum MIDI Note', -1, { min: -1, max: 127, step: 1, description: 'Lowest MIDI note shown. Set to -1 to automatically use the lowest note in the track.' }),
                            prop.number('maxNote', 'Maximum MIDI Note', -1, { min: -1, max: 127, step: 1, description: 'Highest MIDI note shown. Set to -1 to automatically use the highest note in the track.' }),
                        ],
                    },
                    {
                        id: 'notes',
                        label: 'Notes',
                        collapsed: false,
                        description: 'Control how note blocks render within the window.',
                        properties: [
                            prop.boolean('showNotes', 'Show Notes', true),
                            prop.boolean('useChannelColors', 'Use Per-Channel Colors', false, {
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.number('noteCornerRadius', 'Note Corner Radius (px)', 2, {
                                step: 1,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.color('noteStrokeColor', 'Note Stroke Color', '#ffffff', {
                                visibleWhen: [
                                    { key: 'showNotes', truthy: true },
                                    { key: 'noteStrokeWidth', truthy: true },
                                ],
                            }),
                            prop.number('noteStrokeWidth', 'Note Stroke Width (px)', 0, {
                                step: 1,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.number('noteGlowBlur', 'Note Glow Blur (px)', 0, {
                                step: 1,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.number('noteGlowOpacity', 'Note Glow Opacity', 0.5, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            ...channelColorProperties,
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        description: 'Choose how notes animate when they enter or exit the window.',
                        properties: [
                            prop.select('animationType', 'Animation Type', 'expand', [
                                ...getAnimationSelectOptions(),
                                { value: 'none', label: 'No Animation' },
                            ]),
                            prop.number('attackDuration', 'Attack Duration (s)', 0.3, { step: 0.05 }),
                            prop.number('decayDuration', 'Decay Duration (s)', 0.3, { step: 0.05 }),
                            prop.number('releaseDuration', 'Release Duration (s)', 0.3, { step: 0.05 }),
                        ],
                    },
                    {
                        id: 'playhead',
                        label: 'Playhead',
                        collapsed: false,
                        description: 'Style the static playhead indicator.',
                        properties: [
                            prop.boolean('showPlayhead', 'Show Playhead', true),
                            prop.color('playheadColor', 'Playhead Color', '#ff6b6b', {
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                            prop.range('playheadOpacity', 'Playhead Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                            prop.number('playheadLineWidth', 'Playhead Line Width (px)', 2, {
                                min: 1,
                                max: 10,
                                step: 1,
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                        ],
                    },
                ]),
                tab.custom('annotation', 'Annotation', [
                    {
                        id: 'piano',
                        label: 'Piano',
                        collapsed: false,
                        description: 'Optional static keyboard rendered alongside the roll.',
                        properties: [
                            prop.boolean('showPiano', 'Show Piano', false),
                            prop.number('pianoWidth', 'Piano Width (px)', 100, {
                                min: 80,
                                max: 300,
                                step: 10,
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.color('whiteKeyColor', 'White Key Color', '#f0f0f0', {
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.color('blackKeyColor', 'Black Key Color', '#555555', {
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.number('pianoOpacity', 'Piano Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.color('pianoRightBorderColor', 'Piano Right Border', '#333333', {
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.number('pianoRightBorderWidth', 'Piano Right Border Width (px)', 2, {
                                min: 0,
                                max: 10,
                                step: 1,
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                        ],
                    },
                    {
                        id: 'noteGrid',
                        label: 'Note Grid',
                        collapsed: true,
                        description: 'Horizontal grid lines for pitch reference.',
                        properties: [
                            prop.boolean('showNoteGrid', 'Show Note Grid', false),
                            prop.color('noteGridColor', 'Grid Line Color', '#333333', {
                                visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                            }),
                            prop.number('noteGridLineWidth', 'Grid Line Width (px)', 1, {
                                min: 0.5,
                                max: 10,
                                step: 0.5,
                                visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                            }),
                            prop.number('noteGridOpacity', 'Grid Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                            }),
                        ],
                    },
                    {
                        id: 'beatGrid',
                        label: 'Beat Grid',
                        collapsed: true,
                        description: 'Vertical grid lines for beats and bars.',
                        properties: [
                            prop.boolean('showBeatGrid', 'Show Beat Grid', false),
                            prop.color('beatGridBarColor', 'Bar Line Color', '#666666', {
                                visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                            }),
                            prop.color('beatGridBeatColor', 'Beat Line Color', '#444444', {
                                visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                            }),
                            prop.number('beatGridBarWidth', 'Bar Line Width (px)', 2, {
                                min: 0.5,
                                max: 10,
                                step: 0.5,
                                visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                            }),
                            prop.number('beatGridBeatWidth', 'Beat Line Width (px)', 1, {
                                min: 0.5,
                                max: 10,
                                step: 0.5,
                                visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                            }),
                            prop.number('beatGridOpacity', 'Grid Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                            }),
                        ],
                    },
                    {
                        id: 'noteLabels',
                        label: 'Note Labels',
                        collapsed: true,
                        description: 'Configure note name overlays along the piano.',
                        properties: [
                            prop.boolean('showNoteLabels', 'Show Note Labels', false),
                            prop.font('noteLabelFontFamily', 'Font Family', 'Inter', {
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.number('noteLabelFontSize', 'Font Size (px)', 10, {
                                min: 6,
                                max: 32,
                                step: 1,
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.color('noteLabelFontColor', 'Font Color', '#ffffff', {
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.number('noteLabelInterval', 'Label Interval', 1, {
                                min: 1,
                                max: 24,
                                step: 1,
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.number('noteLabelStartNote', 'Label Start Note', 0, {
                                min: 0,
                                max: 127,
                                step: 1,
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.number('noteLabelOffsetX', 'Offset X (px)', -10, {
                                min: -200,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.number('noteLabelOffsetY', 'Offset Y (px)', 0, {
                                min: -200,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                            prop.number('noteLabelOpacity', 'Label Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                            }),
                        ],
                    },
                    {
                        id: 'beatLabels',
                        label: 'Beat & Bar Labels',
                        collapsed: true,
                        description: 'Configure beat/bar text above the grid.',
                        properties: [
                            prop.boolean('showBeatLabels', 'Show Beat Labels', false),
                            prop.font('beatLabelFontFamily', 'Font Family', 'Inter', {
                                visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                            }),
                            prop.number('beatLabelFontSize', 'Font Size (px)', 12, {
                                min: 6,
                                max: 48,
                                step: 1,
                                visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                            }),
                            prop.color('beatLabelFontColor', 'Font Color', '#ffffff', {
                                visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                            }),
                            prop.number('beatLabelOffsetY', 'Offset Y (px)', -5, {
                                min: -200,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                            }),
                            prop.number('beatLabelOffsetX', 'Offset X (px)', 5, {
                                min: -200,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                            }),
                            prop.number('beatLabelOpacity', 'Label Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                            }),
                        ],
                    },
                ]),
                tab.appearance([propGroup.appearance()]),
            ]
        );
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const renderObjects: RenderObject[] = [];

        const effectiveTime = targetTime;
        const timeUnitBars = props.timeUnitBars as number;
        const showPiano = props.showPiano as boolean;
        const pianoWidth = showPiano ? (props.pianoWidth as number) : 0;
        const rollWidth = props.rollWidth as number;
        const rollHeight = props.rollHeight as number;
        const effectiveRollWidth = rollWidth;
        const showNoteGrid = props.showNoteGrid as boolean;
        const showNoteLabels = props.showNoteLabels as boolean;
        const showNotes = props.showNotes as boolean;
        const showBeatGrid = props.showBeatGrid as boolean;
        const showBeatLabels = props.showBeatLabels as boolean;
        const showPlayhead = props.showPlayhead as boolean;
        const playheadLineWidth = props.playheadLineWidth as number;
        const playheadColor = applyOpacity(props.playheadColor as string, props.playheadOpacity as number);
        const whiteKeyColor = props.whiteKeyColor as string;
        const blackKeyColor = props.blackKeyColor as string;
        const pianoOpacity = props.pianoOpacity as number;
        const pianoRightBorderColor = props.pianoRightBorderColor as string;
        const pianoRightBorderWidth = props.pianoRightBorderWidth as number;
        const noteGridColor = props.noteGridColor as string;
        const noteGridLineWidth = props.noteGridLineWidth as number;
        const noteGridOpacity = props.noteGridOpacity as number;
        const beatGridBarColor = props.beatGridBarColor as string;
        const beatGridBeatColor = props.beatGridBeatColor as string;
        const beatGridBarWidth = props.beatGridBarWidth as number;
        const beatGridBeatWidth = props.beatGridBeatWidth as number;
        const beatGridOpacity = props.beatGridOpacity as number;
        const noteLabelFontSelection = props.noteLabelFontFamily as string;
        const { family: noteLabelFontFamily, weight: noteLabelFontWeightPart } =
            parseFontSelection(noteLabelFontSelection);
        const noteLabelFontSize = props.noteLabelFontSize as number;
        const noteLabelFontColor = props.noteLabelFontColor as string;
        const noteLabelFontWeight = (noteLabelFontWeightPart || '400').toString();
        const noteLabelInterval = props.noteLabelInterval as number;
        const noteLabelStartNote = props.noteLabelStartNote as number;
        const noteLabelOffsetX = props.noteLabelOffsetX as number;
        const noteLabelOffsetY = props.noteLabelOffsetY as number;
        const noteLabelOpacity = props.noteLabelOpacity as number;
        const beatLabelFontSelection = props.beatLabelFontFamily as string;
        const { family: beatLabelFontFamily, weight: beatLabelFontWeightPart } =
            parseFontSelection(beatLabelFontSelection);
        const beatLabelFontSize = props.beatLabelFontSize as number;
        const beatLabelFontColor = props.beatLabelFontColor as string;
        const beatLabelFontWeight = (beatLabelFontWeightPart || '400').toString();
        const beatLabelOffsetY = props.beatLabelOffsetY as number;
        const beatLabelOffsetX = props.beatLabelOffsetX as number;
        const beatLabelOpacity = props.beatLabelOpacity as number;
        const attackDuration = props.attackDuration as number;
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        const timelineState = status === 'ok' ? api?.timeline.getStateSnapshot() : null;
        if (noteLabelFontFamily) ensureFontLoaded(noteLabelFontFamily, noteLabelFontWeight);
        if (beatLabelFontFamily) ensureFontLoaded(beatLabelFontFamily, beatLabelFontWeight);

        const rawMinNote = props.minNote as number;
        const rawMaxNote = props.maxNote as number;
        let minNote: number;
        let maxNote: number;
        if (rawMinNote === -1 || rawMaxNote === -1) {
            const trackId = props.midiTrackId as string | undefined;
            let autoMinNote = 0;
            let autoMaxNote = 127;
            if (trackId && status === 'ok' && api && timelineState) {
                const track = timelineState.tracks[trackId];
                const midiSourceId = (track as { midiSourceId?: string })?.midiSourceId;
                const bounds = midiSourceId ? timelineState.midiCache[midiSourceId]?.bounds : undefined;
                if (bounds) {
                    autoMinNote = bounds.minNote;
                    autoMaxNote = bounds.maxNote;
                }
            }
            minNote = rawMinNote === -1 ? autoMinNote : rawMinNote;
            maxNote = rawMaxNote === -1 ? autoMaxNote : rawMaxNote;
        } else {
            minNote = rawMinNote;
            maxNote = rawMaxNote;
        }
        const numNotes = Math.max(1, maxNote - minNote + 1);
        const noteHeight = rollHeight / numNotes;

        // Update timing from global timeline snapshot
        try {
            const bpm = timelineState?.timeline.globalBpm || 120;
            const beatsPerBar = timelineState?.timeline.beatsPerBar || 4;
            this.timingManager.setBPM(bpm);
            this.timingManager.setBeatsPerBar(beatsPerBar);
            if (timelineState?.timeline.masterTempoMap && timelineState.timeline.masterTempoMap.length > 0) {
                this.timingManager.setTempoMap(timelineState.timeline.masterTempoMap, 'seconds');
            } else {
                this.timingManager.setTempoMap(null);
            }
        } catch {}

        // Compute overall content extents (for layout bounds and optional backgrounds)
        const totalHeight = rollHeight;
        const totalWidth = pianoWidth + effectiveRollWidth;

        // Add an invisible rectangle that establishes the layout bounds to roughly cover the content area
        // This prevents jitter when other decorative elements toggle or animations change.
        const layoutBoundsRect = new Rectangle(0, 0, totalWidth, totalHeight, null, null, 0);
        (layoutBoundsRect as any).setIncludeInLayoutBounds?.(true);
        // No fill/stroke, so it's not drawn, but it contributes to layout bounds via getBounds().
        renderObjects.push(layoutBoundsRect);

        // Optionally draw the piano strip background first so notes/grids render on top
        if (showPiano) {
            for (let n = maxNote, i = 0; n >= minNote; n--, i++) {
                const y = i * noteHeight;
                const pc = n % 12;
                const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
                const col = isBlack ? blackKeyColor : whiteKeyColor;
                const key = new Rectangle(0, y, pianoWidth, noteHeight, col, null, 0);
                key.opacity = pianoOpacity;
                renderObjects.push(key);
            }
            if ((pianoRightBorderWidth || 0) > 0) {
                renderObjects.push(
                    new Line(
                        pianoWidth,
                        0,
                        pianoWidth,
                        (maxNote - minNote + 1) * noteHeight,
                        pianoRightBorderColor,
                        pianoRightBorderWidth
                    )
                );
            }
        }

        // Build source notes from timeline tracks only
        let sourceNotes: Array<{
            note: number;
            channel: number;
            velocity: number;
            startTime: number;
            endTime: number;
            startBeat?: number;
            endBeat?: number;
        }> = [];
        try {
            const trackId = props.midiTrackId;
            const effectiveTrackIds = trackId ? [trackId as string] : [];
            if (effectiveTrackIds.length > 0) {
                // Query two-window span (prev + current) so release animation frames still have note segments
                const currentWin = this.timingManager.getTimeUnitWindow(effectiveTime, timeUnitBars);
                // Derive previous window start without accessing private TimingManager internals.
                const beatsPerBar = this.timingManager.beatsPerBar || 4;
                const bpm = this.timingManager.bpm || 120;
                const secondsPerBeat = 60 / bpm;
                const windowBeats = timeUnitBars * beatsPerBar;
                const windowDurationApprox = windowBeats * secondsPerBeat; // acceptable for release span query
                const prevStart = currentWin.start - windowDurationApprox;
                const queryStart = prevStart;
                const queryEnd = currentWin.end + attackDuration;
                const events =
                    status === 'ok' && api
                        ? api.timeline.selectNotesInWindow({
                              trackIds: effectiveTrackIds,
                              startSec: queryStart,
                              endSec: queryEnd,
                          })
                        : [];
                sourceNotes = events.map((e) => ({
                    note: e.note,
                    channel: e.channel,
                    velocity: e.velocity || 0,
                    startTime: e.startTime,
                    endTime: e.endTime,
                    startBeat: undefined,
                    endBeat: undefined,
                }));
            }
        } catch {}

        // Build clamped segments across prev/current/next windows for lifecycle-based rendering
        const windowedNoteBlocks: NoteBlock[] = NoteBlock.buildWindowedSegments(
            sourceNotes,
            this.timingManager,
            effectiveTime,
            timeUnitBars
        );

        // Create render objects for the piano roll
        debugLog(
            `[_buildRenderObjects] ${
                showNotes ? 'Rendering notes' : 'Skipping notes'
            } for target time ${targetTime} with ${windowedNoteBlocks.length} windowed note segments`
        );
        if (showNotes && windowedNoteBlocks.length > 0) {
            const noteBlocks = windowedNoteBlocks; // already NoteBlock instances with window metadata
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                { noteHeight, minNote, maxNote, pianoWidth, rollWidth: effectiveRollWidth },
                noteBlocks,
                effectiveTime
            );
            // Apply note style customizations
            const noteCornerRadius = props.noteCornerRadius as number;
            const noteStrokeColor = props.noteStrokeColor as string;
            const noteStrokeWidth = props.noteStrokeWidth as number;
            const noteGlowBlur = props.noteGlowBlur as number;
            const noteGlowOpacity = props.noteGlowOpacity as number;
            (animatedRenderObjects as any[]).forEach((obj) => {
                if (!obj) return;
                // Animation-generated objects should not affect layout bounds
                (obj as any).setIncludeInLayoutBounds?.(false);
                if (typeof obj.setCornerRadius === 'function' && noteCornerRadius > 0) {
                    obj.setCornerRadius(noteCornerRadius);
                }
                if (noteStrokeWidth > 0 && typeof obj.setStroke === 'function') {
                    obj.setStroke(noteStrokeColor, noteStrokeWidth);
                }
            });
            debugLog(`[_buildRenderObjects] Created ${animatedRenderObjects.length} animated note blocks`);
            if (noteGlowBlur > 0) {
                // GlowLayer renders notes twice: once normally, once blurred+screened.
                // The halo colour derives from each note's own fill colour — on dark
                // backgrounds, screen blending creates a natural per-note radiance effect.
                const glowLayer = new GlowLayer({ glowBlur: noteGlowBlur, glowOpacity: noteGlowOpacity });
                glowLayer.addChildren(animatedRenderObjects);
                renderObjects.push(glowLayer);
            } else {
                renderObjects.push(...animatedRenderObjects);
            }
        }

        // Add grid lines
        if (showNoteGrid) {
            const noteLines = this._createNoteGridLines(minNote, maxNote, pianoWidth, effectiveRollWidth, noteHeight);
            noteLines.forEach((l: any) => {
                if (noteGridColor) l.setColor?.(noteGridColor);
                if (noteGridLineWidth) l.setLineWidth?.(noteGridLineWidth);
                l.opacity = noteGridOpacity;
            });
            renderObjects.push(...noteLines);
        }

        // Add beat grid (tempo-aware)
        if (showBeatGrid) {
            const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const beatsPerBarForGrid = this.timingManager.beatsPerBar || 4;
            const beatLines = this._createBeatGridLines(
                windowStart,
                windowEnd,
                beatsPerBarForGrid,
                pianoWidth,
                effectiveRollWidth,
                (maxNote - minNote + 1) * noteHeight
            );
            beatLines.forEach((l: any) => {
                const isBar = (l.lineWidth || 1) > 1; // heuristic from default creation
                const color = isBar ? beatGridBarColor : beatGridBeatColor;
                const width = isBar ? beatGridBarWidth : beatGridBeatWidth;
                l.setColor?.(color);
                l.setLineWidth?.(width);
                l.opacity = beatGridOpacity;
            });
            renderObjects.push(...beatLines);
        }

        // Add note labels
        if (showNoteLabels) {
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const labels = this._createNoteLabels(minNote, maxNote, effectivePianoWidth, noteHeight);
            let visibleIndex = 0;
            for (const lbl of labels as any[]) {
                // interval logic based solely on visibleIndex
                if ((visibleIndex - noteLabelStartNote) % noteLabelInterval !== 0) {
                    lbl.setOpacity?.(0); // hide
                } else {
                    lbl.text && (lbl.font = `${noteLabelFontWeight} ${noteLabelFontSize}px ${noteLabelFontFamily}`);
                    lbl.color = noteLabelFontColor;
                    lbl.setOpacity?.(noteLabelOpacity);
                    lbl.x = effectivePianoWidth + noteLabelOffsetX; // adjust relative to piano edge
                    lbl.y += noteLabelOffsetY;
                }
                visibleIndex++;
            }
            renderObjects.push(...labels);
        }

        // Add beat labels (tempo-aware)
        if (showBeatLabels) {
            const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const beatsPerBarForGrid = this.timingManager.beatsPerBar || 4;
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const labels = this._createBeatLabels(
                windowStart,
                windowEnd,
                beatsPerBarForGrid,
                pianoWidth,
                effectiveRollWidth
            );
            (labels as any[]).forEach((lbl) => {
                lbl.font = `${beatLabelFontWeight} ${beatLabelFontSize}px ${beatLabelFontFamily}`;
                lbl.color = beatLabelFontColor;
                lbl.x += beatLabelOffsetX;
                lbl.y += beatLabelOffsetY;
                lbl.setOpacity?.(beatLabelOpacity);
            });
            renderObjects.push(...labels);
        }

        // Add playhead
        if (showPlayhead) {
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const ph = this._createPlayhead(
                effectiveTime,
                pianoWidth,
                effectiveRollWidth,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor as string
            );
            (ph as any[]).forEach((l) => {
                (l as any).setIncludeInLayoutBounds?.(false);
            });
            renderObjects.push(...ph);
        }

        return renderObjects;
    }

    /**
     * Create horizontal note grid lines across the roll area
     */
    private _createNoteGridLines(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        rollWidth: number,
        noteHeight: number
    ): RenderObject[] {
        const lines: RenderObject[] = [];
        const x1 = pianoWidth;
        const x2 = pianoWidth + rollWidth;
        // draw line at each note boundary
        for (let i = 0; i <= maxNote - minNote; i++) {
            const y = i * noteHeight;
            const ln = new Line(x1, y, x2, y, '#333333', 1);
            (ln as any).setIncludeInLayoutBounds?.(false);
            lines.push(ln);
        }
        return lines;
    }

    /**
     * Create vertical beat and bar grid lines across the roll area
     */
    private _createBeatGridLines(
        windowStart: number,
        windowEnd: number,
        beatsPerBar: number,
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number
    ): RenderObject[] {
        const lines: RenderObject[] = [];
        const beats = this.timingManager.getBeatGridInWindow(windowStart, windowEnd);
        const duration = Math.max(1e-9, windowEnd - windowStart);
        for (const b of beats) {
            const rel = (b.time - windowStart) / duration;
            const x = pianoWidth + rel * rollWidth;
            const isBar = !!b.isBarStart;
            const ln = new Line(x, 0, x, totalHeight, isBar ? '#666666' : '#444444', isBar ? 2 : 1);
            (ln as any).setIncludeInLayoutBounds?.(false);
            lines.push(ln);
        }
        return lines;
    }

    /**
     * Create note labels for each visible note row in the piano area
     */
    private _createNoteLabels(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        noteHeight: number
    ): RenderObject[] {
        const labels: RenderObject[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;
        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - (note - minNote + 0.5) * noteHeight;
            const noteLabel = noteName(note);
            const label = new Text(pianoWidth - 10, y, noteLabel, '10px Arial', '#ffffff', 'right', 'middle');
            (label as any).setIncludeInLayoutBounds?.(false);
            labels.push(label);
        }
        return labels;
    }

    /**
     * Create beat and bar labels
     */
    private _createBeatLabels(
        windowStart: number,
        windowEnd: number,
        beatsPerBar: number,
        pianoWidth: number,
        rollWidth: number
    ): RenderObject[] {
        const labels: RenderObject[] = [];
        const beats = this.timingManager.getBeatGridInWindow(windowStart, windowEnd);
        const duration = Math.max(1e-9, windowEnd - windowStart);
        for (const b of beats) {
            if (!b.isBarStart) continue;
            const rel = (b.time - windowStart) / duration;
            const x = pianoWidth + rel * rollWidth;
            const bar = b.barNumber;
            const label = new Text(x + 5, -5, `Bar ${bar}`, '12px Arial', '#ffffff', 'left', 'bottom');
            (label as any).setIncludeInLayoutBounds?.(false);
            labels.push(label);
        }

        return labels;
    }

    /**
     * Create playhead line
     */
    private _createPlayhead(
        targetTime: number,
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number,
        lineWidth: number,
        playheadColor: string
    ): RenderObject[] {
        const playheadObjects: RenderObject[] = [];

        // Calculate playhead position
        const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(
            targetTime,
            this.getTimeUnitBars()
        );
        const timeUnitInSeconds = Math.max(1e-9, windowEnd - windowStart);
        const playheadPosition = ((targetTime - windowStart) / timeUnitInSeconds) * rollWidth;
        const playheadX = pianoWidth + playheadPosition;

        // Create playhead line using Line.createPlayhead if available, otherwise use regular Line
        if (Line.createPlayhead) {
            const playhead = Line.createPlayhead(playheadX, 0, totalHeight, playheadColor, lineWidth);
            playheadObjects.push(playhead);
        } else {
            // Fallback to regular line
            const playhead = new Line(playheadX, 0, playheadX, totalHeight, playheadColor, lineWidth);
            playheadObjects.push(playhead);
        }

        return playheadObjects;
    }

    /**
     * Dispatch a change event to trigger re-renders
     */
    private _dispatchChangeEvent(): void {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(
                new CustomEvent('sceneElementChanged', {
                    detail: { elementId: this.id },
                })
            );
        }
    }

    dispose(): void {
        super.dispose();
    }

    getAnimationType(): string {
        return (this.getSchemaProps().animationType as string | undefined) ?? 'expand';
    }

    getAttackDuration(): number {
        return Math.max(0, (this.getSchemaProps().attackDuration as number | undefined) ?? 0.3);
    }

    getDecayDuration(): number {
        return Math.max(0, (this.getSchemaProps().decayDuration as number | undefined) ?? 0.3);
    }

    getReleaseDuration(): number {
        return Math.max(0, (this.getSchemaProps().releaseDuration as number | undefined) ?? 0.3);
    }

    getTimeUnitBars(): number {
        return Math.max(1, Math.round((this.getSchemaProps().timeUnitBars as number | undefined) ?? 1));
    }

    setTimeUnitBars(bars: number): this {
        this.setProperty('timeUnitBars', bars);
        return this;
    }

    getTimeUnit(): number {
        return this.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
    }

    /**
     * Get channel colors for MIDI channels
     */
    getChannelColors(): string[] {
        const props = this.getSchemaProps();
        const baseColor = applyOpacity(
            (props.color ?? props.noteColor ?? props.channel0Color ?? DEFAULT_NOTE_COLOR) as string,
            (props.opacity ?? props.noteOpacity ?? 0.8) as number
        );
        if (!props.useChannelColors) {
            return Array.from({ length: 16 }, () => baseColor);
        }

        return Array.from({ length: 16 }, (_, index) => {
            const rawChannelColor = props[`channel${index}Color`] as string | undefined;
            return rawChannelColor ? normalizeColorAlphaValue(rawChannelColor, baseColor) : baseColor;
        });
    }
}

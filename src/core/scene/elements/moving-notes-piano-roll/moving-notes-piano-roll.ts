// MovingNotesPianoRoll scene element: static playhead, notes move across.
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema } from '@core/types.js';
import { Line, EmptyRenderObject, RenderObject, Rectangle } from '@core/render/render-objects';
import { getAnimationSelectOptions } from '@animation/note-animations';
// Timeline-backed migration: remove per-element MidiManager usage
import { MovingNotesAnimationController } from './animation-controller';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';
import { TimingManager } from '@core/timing';

export class MovingNotesPianoRollElement extends SceneElement {
    public animationController: MovingNotesAnimationController;
    private timingManager: TimingManager;
    // TimelineService removed; use store selectors for MIDI retrieval

    constructor(id: string = 'movingNotesPianoRoll', config: { [key: string]: any } = {}) {
        super('movingNotesPianoRoll', id, config);
        this.animationController = new MovingNotesAnimationController(this);
        this.timingManager = new TimingManager(this.id);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Moving Notes Piano Roll',
            description: 'Notes move past a static playhead',
            category: 'complete',
            groups: [
                ...base.groups,
                // timing offset removed
                {
                    id: 'noteColors',
                    label: 'Note Colors (per MIDI channel)',
                    collapsed: true,
                    properties: Array.from({ length: 16 }).map((_, i) => ({
                        key: `channel${i}Color`,
                        type: 'color',
                        label: `Channel ${i + 1}`,
                        default: [
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
                        ][i],
                    })),
                },
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    collapsed: true,
                    properties: [
                        {
                            key: 'midiTrackId',
                            type: 'midiTrackRef',
                            label: 'MIDI Track',
                            default: null,
                        },
                    ],
                },
                {
                    id: 'dimensions',
                    label: 'Dimensions',
                    collapsed: true,
                    properties: [
                        {
                            key: 'pianoWidth',
                            type: 'number',
                            label: 'Piano Width',
                            default: 0,
                            min: 80,
                            max: 300,
                            step: 10,
                        },
                        {
                            key: 'rollWidth',
                            type: 'number',
                            label: 'Roll Width',
                            default: 800,
                            min: 200,
                            max: 2000,
                            step: 50,
                            description: 'Deprecated for this element. Use Element Width; this value is ignored.',
                        },
                        {
                            key: 'elementWidth',
                            type: 'number',
                            label: 'Element Width',
                            default: 800,
                            min: 100,
                            max: 4000,
                            step: 10,
                            description: 'Total width (px) for the moving-notes viewport (used for clamping and bbox).',
                        },
                        {
                            key: 'timeUnitBars',
                            type: 'number',
                            label: 'Time Unit (Bars)',
                            default: 1,
                            min: 1,
                            max: 8,
                            step: 1,
                            description:
                                'Used only as a duration scale for the moving window around the playhead (no segmentation).',
                        },
                        {
                            key: 'minNote',
                            type: 'number',
                            label: 'Minimum Note',
                            default: 30,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                        {
                            key: 'maxNote',
                            type: 'number',
                            label: 'Maximum Note',
                            default: 72,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                    ],
                },
                {
                    id: 'piano',
                    label: 'Piano',
                    collapsed: true,
                    properties: [
                        { key: 'showPiano', type: 'boolean', label: 'Show Piano', default: false },
                        { key: 'whiteKeyColor', type: 'color', label: 'White Key Color', default: '#f0f0f0' },
                        { key: 'blackKeyColor', type: 'color', label: 'Black Key Color', default: '#555555' },
                        {
                            key: 'pianoOpacity',
                            type: 'number',
                            label: 'Piano Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                        {
                            key: 'pianoRightBorderColor',
                            type: 'color',
                            label: 'Piano Right Border',
                            default: '#333333',
                        },
                        {
                            key: 'pianoRightBorderWidth',
                            type: 'number',
                            label: 'Piano Right Border Width',
                            default: 2,
                            min: 0,
                            max: 10,
                            step: 1,
                        },
                    ],
                },
                {
                    id: 'notes',
                    label: 'Notes',
                    collapsed: true,
                    properties: [
                        { key: 'showNotes', type: 'boolean', label: 'Show Notes', default: true },
                        {
                            key: 'noteHeight',
                            type: 'number',
                            label: 'Note Height',
                            default: 20,
                            min: 4,
                            max: 40,
                            step: 1,
                        },
                        {
                            key: 'noteOpacity',
                            type: 'number',
                            label: 'Note Opacity',
                            default: 0.8,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                        {
                            key: 'noteCornerRadius',
                            type: 'number',
                            label: 'Note Corner Radius',
                            default: 2,
                            min: 0,
                            max: 20,
                            step: 1,
                        },
                        { key: 'noteStrokeColor', type: 'color', label: 'Note Stroke Color', default: '#ffffff' },
                        {
                            key: 'noteStrokeWidth',
                            type: 'number',
                            label: 'Note Stroke Width',
                            default: 0,
                            min: 0,
                            max: 10,
                            step: 1,
                        },
                        {
                            key: 'noteGlowColor',
                            type: 'color',
                            label: 'Note Glow Color',
                            default: 'rgba(255,255,255,0.5)',
                        },
                        {
                            key: 'noteGlowBlur',
                            type: 'number',
                            label: 'Note Glow Blur',
                            default: 0,
                            min: 0,
                            max: 50,
                            step: 1,
                        },
                        {
                            key: 'noteGlowOpacity',
                            type: 'number',
                            label: 'Note Glow Opacity',
                            default: 0.5,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
                {
                    id: 'animation',
                    label: 'Animation',
                    collapsed: true,
                    properties: [
                        {
                            key: 'animationType',
                            type: 'select',
                            label: 'Animation Type',
                            default: 'expand',
                            options: [...getAnimationSelectOptions(), { value: 'none', label: 'No Animation' }],
                        },
                        {
                            key: 'attackDuration',
                            type: 'number',
                            label: 'Attack Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                        },
                        {
                            key: 'decayDuration',
                            type: 'number',
                            label: 'Decay Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                        },
                        {
                            key: 'releaseDuration',
                            type: 'number',
                            label: 'Release Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                        },
                        {
                            key: 'playheadPosition',
                            type: 'number',
                            label: 'Playhead Position (0..1)',
                            default: 0.5,
                            min: 0,
                            max: 1,
                            step: 0.01,
                        },
                        {
                            key: 'playheadOffset',
                            type: 'number',
                            label: 'Playhead Offset (px)',
                            default: 0,
                            min: -4000,
                            max: 4000,
                            step: 1,
                            description: 'Pixel offset added to playhead position within the element width.',
                        },
                    ],
                },
                // (Removed legacy min-bbox group)
                {
                    id: 'playhead',
                    label: 'Playhead',
                    collapsed: true,
                    properties: [
                        { key: 'showPlayhead', type: 'boolean', label: 'Show Playhead', default: true },
                        { key: 'playheadColor', type: 'color', label: 'Playhead Color', default: '#ff6b6b' },
                        {
                            key: 'playheadLineWidth',
                            type: 'number',
                            label: 'Playhead Line Width',
                            default: 2,
                            min: 1,
                            max: 10,
                            step: 1,
                        },
                        {
                            key: 'playheadOpacity',
                            type: 'number',
                            label: 'Playhead Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const renderObjects: RenderObject[] = [];
        // Use global timeline tempo and meter
        // timeOffset removed; use targetTime directly
        const effectiveTime = targetTime;
        const timeUnitBars = this.getProperty<number>('timeUnitBars');
        const pianoWidth = this.getProperty<number>('pianoWidth');
        const rollWidth = this.getProperty<number>('rollWidth') || 800;
        const elementWidth = this.getProperty<number>('elementWidth') || rollWidth;
        const showNotes = this.getProperty<boolean>('showNotes');
        const minNote = this.getProperty<number>('minNote');
        const maxNote = this.getProperty<number>('maxNote');
        const noteHeight = this.getProperty<number>('noteHeight');
        const showPlayhead = this.getProperty<boolean>('showPlayhead');
        const playheadLineWidth = this.getProperty<number>('playheadLineWidth');
        const playheadColor = this.getProperty<string>('playheadColor') || '#ff6b6b';
        const playheadOpacity = this.getProperty<number>('playheadOpacity') ?? 1;
        const playheadPosition = Math.max(0, Math.min(1, this.getProperty<number>('playheadPosition') ?? 0.25));
        const playheadOffset = this.getProperty<number>('playheadOffset') || 0;
        const showPiano = this.getProperty<boolean>('showPiano');
        const whiteKeyColor = this.getProperty<string>('whiteKeyColor') || '#f0f0f0';
        const blackKeyColor = this.getProperty<string>('blackKeyColor') || '#555555';
        const pianoOpacity = this.getProperty<number>('pianoOpacity') ?? 1;
        const pianoRightBorderColor = this.getProperty<string>('pianoRightBorderColor') || '#333333';
        const pianoRightBorderWidth = this.getProperty<number>('pianoRightBorderWidth') || 2;

        // Update local timing manager from global store for view window duration calculations
        try {
            const state = useTimelineStore.getState();
            const bpm = state.timeline.globalBpm || 120;
            const beatsPerBar = state.timeline.beatsPerBar || 4;
            this.timingManager.setBPM(bpm);
            this.timingManager.setBeatsPerBar(beatsPerBar);
            // If a master tempo map exists, apply to timing manager for accurate windows
            if (state.timeline.masterTempoMap && state.timeline.masterTempoMap.length > 0) {
                this.timingManager.setTempoMap(state.timeline.masterTempoMap, 'seconds');
            } else {
                this.timingManager.setTempoMap(null);
            }
        } catch {}

        // Draw piano strip (left) so pianoWidth visually applies
        if (showPiano) {
            const totalHeight = (maxNote - minNote + 1) * noteHeight;
            // Draw keys from top (maxNote) to bottom (minNote)
            for (let n = maxNote, i = 0; n >= minNote; n--, i++) {
                const y = i * noteHeight;
                const pitchClass = n % 12;
                const isBlack =
                    pitchClass === 1 || pitchClass === 3 || pitchClass === 6 || pitchClass === 8 || pitchClass === 10;
                const col = isBlack ? blackKeyColor : whiteKeyColor;
                const key = new Rectangle(0, y, pianoWidth, noteHeight, col, null, 0);
                key.setOpacity?.(pianoOpacity);
                renderObjects.push(key);
            }
            // Right border to separate piano from roll area
            if ((pianoRightBorderWidth || 0) > 0) {
                const border = new Line(
                    pianoWidth,
                    0,
                    pianoWidth,
                    (maxNote - minNote + 1) * noteHeight,
                    pianoRightBorderColor,
                    pianoRightBorderWidth
                );
                renderObjects.push(border);
            }
        }

        // Determine window around current time
        const duration = this.timingManager.getTimeUnitDuration(timeUnitBars);
        const windowStart = effectiveTime - duration * playheadPosition;
        const windowEnd = windowStart + duration;

        // Fetch notes for this window from timeline store
        const trackIds = (this.getProperty('midiTrackIds') as string[] | undefined) || [];
        const trackId = (this.getProperty('midiTrackId') as string) || null;
        const effectiveTrackIds = Array.isArray(trackIds) && trackIds.length > 0 ? trackIds : trackId ? [trackId] : [];
        const state = useTimelineStore.getState();
        const rawNotes =
            effectiveTrackIds.length > 0
                ? selectNotesInWindow(state, {
                      trackIds: effectiveTrackIds,
                      startSec: windowStart,
                      endSec: windowEnd,
                  }).map((n) => ({
                      note: n.note,
                      channel: n.channel,
                      velocity: n.velocity || 0,
                      startTime: n.startTime,
                      endTime: n.endTime,
                  }))
                : [];

        // Notes moving past static playhead
        if (showNotes && rawNotes && (rawNotes as any[]).length > 0) {
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                {
                    noteHeight,
                    minNote,
                    maxNote,
                    pianoWidth,
                    rollWidth: elementWidth,
                    playheadPosition,
                    playheadOffset,
                    windowStart,
                    windowEnd,
                    currentTime: effectiveTime,
                },
                rawNotes as any
            );

            // Style customizations
            const noteOpacity = this.getProperty<number>('noteOpacity') ?? 0.8;
            const noteCornerRadius = this.getProperty<number>('noteCornerRadius') || 0;
            const noteStrokeColor = this.getProperty<string>('noteStrokeColor') || undefined;
            const noteStrokeWidth = this.getProperty<number>('noteStrokeWidth') || 0;
            const noteGlowColor = this.getProperty<string>('noteGlowColor') || 'rgba(255,255,255,0.5)';
            const noteGlowBlur = this.getProperty<number>('noteGlowBlur') || 0;
            const noteGlowOpacity = this.getProperty<number>('noteGlowOpacity') ?? 0.5;
            (animatedRenderObjects as any[]).forEach((obj) => {
                if (!obj) return;
                if (typeof obj.setCornerRadius === 'function' && noteCornerRadius > 0)
                    obj.setCornerRadius(noteCornerRadius);
                if (noteStrokeWidth > 0 && typeof obj.setStroke === 'function')
                    obj.setStroke(noteStrokeColor, noteStrokeWidth);
                if (typeof obj.setGlobalAlpha === 'function') obj.setGlobalAlpha(noteOpacity);
                else if (typeof obj.setOpacity === 'function') obj.setOpacity(noteOpacity);
                if (noteGlowBlur > 0 && typeof obj.setShadow === 'function') {
                    let glowColorOut = noteGlowColor;
                    if (noteGlowColor.startsWith('#') && noteGlowOpacity < 1) {
                        const r = parseInt(noteGlowColor.substr(1, 2), 16);
                        const g = parseInt(noteGlowColor.substr(3, 2), 16);
                        const b = parseInt(noteGlowColor.substr(5, 2), 16);
                        glowColorOut = `rgba(${r},${g},${b},${noteGlowOpacity})`;
                    }
                    obj.setShadow(glowColorOut, noteGlowBlur, 0, 0);
                }
            });
            renderObjects.push(...animatedRenderObjects);
        }

        // Add a non-drawing rectangle to establish layout bounds for the content area
        {
            const totalHeight = (maxNote - minNote + 1) * noteHeight;
            const layoutRect = new Rectangle(0, 0, pianoWidth + elementWidth, totalHeight, null, null, 0);
            (layoutRect as any).setIncludeInLayoutBounds?.(true);
            renderObjects.push(layoutRect);
        }

        if (showPlayhead) {
            const ph = this._createStaticPlayhead(
                pianoWidth,
                elementWidth,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor,
                playheadPosition,
                playheadOffset
            );
            (ph as any[]).forEach((l) => {
                l.setOpacity?.(playheadOpacity);
                (l as any).setIncludeInLayoutBounds?.(false);
            });
            renderObjects.push(...ph);
        }

        return renderObjects;
    }

    private _createStaticPlayhead(
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number,
        lineWidth: number,
        playheadColor: string,
        playheadPosition: number,
        playheadOffset: number
    ): RenderObject[] {
        const minX = pianoWidth;
        const maxX = pianoWidth + rollWidth;
        const unclamped = pianoWidth + rollWidth * playheadPosition + playheadOffset;
        const x = Math.max(minX, Math.min(maxX, unclamped));
        const playhead = Line.createPlayhead
            ? Line.createPlayhead(x, 0, totalHeight, playheadColor, lineWidth)
            : new Line(x, 0, x, totalHeight, playheadColor, lineWidth);
        return [playhead];
    }

    // Convenience getters/setters removed: element uses global tempo/meter from store
    getAnimationType(): string {
        return this.getProperty<string>('animationType');
    }
    getAttackDuration(): number {
        return Math.max(0, this.getProperty<number>('attackDuration') ?? 0.3);
    }
    getDecayDuration(): number {
        return Math.max(0, this.getProperty<number>('decayDuration') ?? 0.3);
    }
    getReleaseDuration(): number {
        return Math.max(0, this.getProperty<number>('releaseDuration') ?? 0.3);
    }
    getTimeUnitBars(): number {
        return this.getProperty<number>('timeUnitBars');
    }
    setTimeUnitBars(bars: number): this {
        this.setProperty('timeUnitBars', bars);
        return this;
    }
    getTimeUnit(): number {
        return this.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
    }
    // Legacy macro bindings for bpm/beat removed
    getChannelColors(): string[] {
        const colors: string[] = [];
        for (let i = 0; i < 16; i++) {
            colors.push(this.getProperty<string>(`channel${i}Color`) || '#ffffff');
        }
        return colors;
    }
}

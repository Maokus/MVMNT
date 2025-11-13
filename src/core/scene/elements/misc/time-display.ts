// Time display element for showing current time with property bindings
import { SceneElement, asBoolean, asNumber, asTrimmedString } from '../base';
import { Text, Rectangle, RenderObject } from '@core/render/render-objects';
import { TimingManager } from '@core/timing';
import { EnhancedConfigSchema } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { useTimelineStore } from '@state/timelineStore';

interface BarBeatTick {
    bar: number;
    beat: number;
    tick: number;
    totalBars?: number;
}

interface MinSecMs {
    minutes: number;
    seconds: number;
    milliseconds: number;
}

export class TimeDisplayElement extends SceneElement {
    public timingManager: TimingManager;
    public midiManager?: any;

    constructor(id: string = 'timeDisplay', config: { [key: string]: any } = {}) {
        super('timeDisplay', id, config);

        // Use timing manager by default for independent timing control; if a MIDI-aware timing is needed in future, this can be swapped
        this.timingManager = new TimingManager('timeDisplay');
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Time Display',
            description: 'Current time and beat position display',
            category: 'Misc',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'timeDisplay',
                    label: 'Time Display',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Adjust offsets and typography for the timer.',
                    properties: [
                        {
                            key: 'offsetBars',
                            type: 'number',
                            label: 'Offset Bars',
                            default: 0,
                            description: 'Shift the displayed musical + real time by this many bars (can be negative).',
                            min: -512,
                            max: 512,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'showProgress',
                            type: 'boolean',
                            label: 'Show Progress Bars',
                            default: true,
                            runtime: { transform: asBoolean, defaultValue: true },
                        },
                        {
                            key: 'fontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Font family (Google Fonts supported).',
                            runtime: { transform: asTrimmedString, defaultValue: 'Inter' },
                        },
                        {
                            key: 'textColor',
                            type: 'color',
                            label: 'Primary Text Color',
                            default: '#FFFFFF',
                            description: 'Color for the main time and beat numbers.',
                            runtime: { transform: asTrimmedString, defaultValue: '#FFFFFF' },
                        },
                        {
                            key: 'textSecondaryColor',
                            type: 'color',
                            label: 'Secondary Text Color',
                            default: 'rgba(255, 255, 255, 0.9)',
                            description: 'Color for labels and secondary text.',
                            runtime: {
                                transform: asTrimmedString,
                                defaultValue: 'rgba(255, 255, 255, 0.9)',
                            },
                        },
                    ],
                    presets: [
                        {
                            id: 'concertTimer',
                            label: 'Concert Timer',
                            values: { fontFamily: 'Inter|600', textColor: '#f8fafc', textSecondaryColor: '#cbd5f5' },
                        },
                        {
                            id: 'techOverlay',
                            label: 'Tech Overlay',
                            values: { fontFamily: 'Inter|500', textColor: '#22d3ee', textSecondaryColor: '#94a3b8' },
                        },
                        {
                            id: 'minimalClock',
                            label: 'Minimal Clock',
                            values: { fontFamily: 'Inter|400', textColor: '#f5f5f5', textSecondaryColor: '#a3a3a3' },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const renderObjects: RenderObject[] = [];

        // Get properties from bindings
        const showProgress = props.showProgress;
        const fontSelection = props.fontFamily ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const textColor = props.textColor ?? '#FFFFFF';
        const textSecondaryColor = props.textSecondaryColor ?? 'rgba(255, 255, 255, 0.9)';

        // Update timing manager from global timeline store
        try {
            const s = useTimelineStore.getState();
            const bpm = s.timeline.globalBpm || 120;
            const beatsPerBar = s.timeline.beatsPerBar || 4;
            this.timingManager.setBPM(bpm);
            this.timingManager.setBeatsPerBar(beatsPerBar);
            if (s.timeline.masterTempoMap && s.timeline.masterTempoMap.length > 0)
                this.timingManager.setTempoMap(s.timeline.masterTempoMap, 'seconds');
            else this.timingManager.setTempoMap(null);
        } catch {}
        // Don't force a specific PPQ; respect MIDI data when available

        // Debug logging for timing calculations
        // const secondsPerBeat = this.timingManager.getSecondsPerBeat();
        // console.log(`TimeDisplay [${this.id}]: BPM=${bpm}, SecondsPerBeat=${secondsPerBeat.toFixed(4)}, Tempo=${this.timingManager.tempo}`);

        // Apply offsetBars (display only). We convert the bar offset to seconds using current tempo context.
        // This keeps internal timing intact while shifting only what is shown.
        let displayTime = targetTime;
        const offsetBars = props.offsetBars ?? 0;
        if (offsetBars !== 0) {
            try {
                // For tempo-mapped timelines, approximate by converting bars->beats->seconds via timing manager.
                const beatsPerBar = this.timingManager.beatsPerBar;
                const offsetBeats = offsetBars * beatsPerBar;
                const offsetSeconds = this.timingManager.beatsToSeconds(offsetBeats);
                displayTime = targetTime + offsetSeconds;
            } catch {
                /* fail-safe: ignore offset if conversion fails */
            }
        }

        // Get bar:beat:tick info (using displayTime)
        const barBeatTick: BarBeatTick = this.timingManager.timeToBarBeatTick(displayTime);

        // Get minutes:seconds:milliseconds info
        const totalMs = displayTime * 1000;
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = Math.floor(totalMs % 1000);

        const minSecMs: MinSecMs = { minutes, seconds, milliseconds };

        const baseFontSize = 24; // Fixed size, scaling handled by transform system

        // Format display text with zero-padding
        const barText = String(barBeatTick.bar).padStart(3, '0');
        const beatText = String(barBeatTick.beat).padStart(2, '0');
        const tickText = String(barBeatTick.tick).padStart(3, '0');
        const minText = String(minSecMs.minutes).padStart(3, '0');
        const secText = String(minSecMs.seconds).padStart(2, '0');
        const msText = String(minSecMs.milliseconds).padStart(3, '0');

        // Layout elements at origin (positioning handled by transform system)
        const x = 0;
        const timeY = 0;
        const beatY = baseFontSize * 1.8;

        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${baseFontSize}px ${fontFamily}, sans-serif`;
        const labelFont = `${fontWeight} ${baseFontSize * 0.8}px ${fontFamily}, sans-serif`;

        // Time display (minutes:seconds:milliseconds)
        const minLabel = new Text(x + baseFontSize * 2, timeY, minText, font, textColor, 'right', 'bottom');
        const secLabel = new Text(x + baseFontSize * 3.8, timeY, secText, font, textColor, 'right', 'bottom');
        const msLabel = new Text(x + baseFontSize * 6, timeY, msText, font, textColor, 'right', 'bottom');

        // Bar:beat:tick display
        const barLabel = new Text(x + baseFontSize * 2, beatY, barText, font, textColor, 'right', 'bottom');
        const beatLabel = new Text(x + baseFontSize * 3.8, beatY, beatText, font, textColor, 'right', 'bottom');
        const tickLabel = new Text(x + baseFontSize * 6, beatY, tickText, font, textColor, 'right', 'bottom');

        // Labels
        const timeLabel = new Text(
            x + baseFontSize * 6,
            timeY - baseFontSize,
            'time',
            labelFont,
            textSecondaryColor,
            'right',
            'bottom'
        );
        const beatLabelText = new Text(
            x + baseFontSize * 6,
            beatY - baseFontSize,
            'beat',
            labelFont,
            textSecondaryColor,
            'right',
            'bottom'
        );

        renderObjects.push(minLabel, secLabel, msLabel, barLabel, beatLabel, tickLabel, timeLabel, beatLabelText);

        // Progress bars if enabled
        if (showProgress) {
            // Ensure progress values are between 0 and 1 to prevent negative dimensions
            const tickProgress = Math.max(0, Math.min(1, barBeatTick.tick / this.timingManager.ticksPerQuarter));
            const tickBarWidth = baseFontSize * 2;
            const tickBarX = x + baseFontSize * 6 - tickBarWidth;
            const tickBarY = beatY + baseFontSize * 0.1;

            const tickBarBg = new Rectangle(
                tickBarX,
                tickBarY,
                tickBarWidth,
                4,
                this.getColorWithOpacity(textSecondaryColor, 0.2)
            );
            const tickBar = new Rectangle(
                tickBarX,
                tickBarY,
                tickBarWidth * tickProgress,
                4,
                this.getColorWithOpacity(textSecondaryColor, 0.6)
            );

            const beatProgress = Math.max(0, Math.min(1, (barBeatTick.beat - 1) / this.timingManager.beatsPerBar));
            const beatBarWidth = baseFontSize * 1;
            const beatBarX = x + baseFontSize * 3.8 - beatBarWidth;
            const beatBarY = beatY + baseFontSize * 0.1;

            const beatBarBg = new Rectangle(
                beatBarX,
                beatBarY,
                beatBarWidth,
                4,
                this.getColorWithOpacity(textSecondaryColor, 0.2)
            );
            const beatBar = new Rectangle(
                beatBarX,
                beatBarY,
                beatBarWidth * beatProgress,
                4,
                this.getColorWithOpacity(textSecondaryColor, 0.6)
            );

            renderObjects.push(tickBarBg, tickBar, beatBarBg, beatBar);
        }

        return renderObjects;
    }

    private getColorWithOpacity(color: string, opacity: number): string {
        // Handle hex colors
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }

        // Handle rgba colors
        if (color.startsWith('rgba')) {
            return color.replace(/rgba?\(([^,]+,[^,]+,[^,]+),[^)]+\)/, `rgba($1, ${opacity})`);
        }

        // Handle rgb colors
        if (color.startsWith('rgb')) {
            return color.replace(/rgb\(([^)]+)\)/, `rgba($1, ${opacity})`);
        }

        // Default fallback
        return `rgba(255, 255, 255, ${opacity})`;
    }
}

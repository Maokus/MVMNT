// Time display element for showing current time with property bindings
import { SceneElement } from './base';
import { Text, Rectangle } from '../render-objects';
import { TimingManager } from '../timing-manager.js';
import { MidiManager } from '../midi-manager';
import { EnhancedConfigSchema, RenderObjectInterface } from '../types.js';
import { ensureFontLoaded, parseFontSelection } from '../../utils/font-loader';

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
    public midiManager?: MidiManager;

    constructor(id: string = 'timeDisplay', config: { [key: string]: any } = {}) {
        super('timeDisplay', id, config);

        // Use timing manager by default for independent timing control; if a MIDI-aware timing is needed in future, this can be swapped
        this.timingManager = new TimingManager(null);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Time Display',
            description: 'Current time and beat position display',
            category: 'info',
            groups: [
                ...base.groups,
                {
                    id: 'timing',
                    label: 'Timing',
                    collapsed: false,
                    properties: [
                        {
                            key: 'bpm',
                            type: 'number',
                            label: 'BPM (Tempo)',
                            default: 120,
                            min: 20,
                            max: 300,
                            step: 0.1,
                            description: 'Beats per minute for this time display',
                        },
                        {
                            key: 'beatsPerBar',
                            type: 'number',
                            label: 'Beats per Bar',
                            default: 4,
                            min: 1,
                            max: 16,
                            step: 1,
                            description: 'Number of beats in each bar for this display',
                        },
                    ],
                },
                {
                    id: 'display',
                    label: 'Display',
                    collapsed: false,
                    properties: [
                        {
                            key: 'showProgress',
                            type: 'boolean',
                            label: 'Show Progress Bars',
                            default: true,
                            description: 'Display tick and beat progress bars',
                        },
                        {
                            key: 'fontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Font family (Google Fonts supported)',
                        },
                        // weight now selected via combined font input (family|weight)
                        {
                            key: 'textColor',
                            type: 'color',
                            label: 'Primary Text Color',
                            default: '#FFFFFF',
                            description: 'Color for the main time and beat numbers',
                        },
                        {
                            key: 'textSecondaryColor',
                            type: 'color',
                            label: 'Secondary Text Color',
                            default: 'rgba(255, 255, 255, 0.9)',
                            description: 'Color for labels and secondary text',
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObjectInterface[] = [];

        // Get properties from bindings
        const showProgress = this.getProperty('showProgress') as boolean;
        const fontSelection = this.getProperty('fontFamily') as string;
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const legacyWeight = (this as any).getProperty?.('fontWeight');
        const fontWeight = (weightPart || legacyWeight || '400').toString();
        const textColor = this.getProperty('textColor') as string;
        const textSecondaryColor = this.getProperty('textSecondaryColor') as string;

        // Update timing manager with bound properties
        const bpm = this.getProperty('bpm') as number;
        const beatsPerBar = this.getProperty('beatsPerBar') as number;

        // Force update the timing manager on every frame to ensure property bindings take precedence
        this.timingManager.setBPM(bpm);
        this.timingManager.setBeatsPerBar(beatsPerBar);
        // Don't force a specific PPQ; respect MIDI data when available

        // Debug logging for timing calculations
        // const secondsPerBeat = this.timingManager.getSecondsPerBeat();
        // console.log(`TimeDisplay [${this.id}]: BPM=${bpm}, SecondsPerBeat=${secondsPerBeat.toFixed(4)}, Tempo=${this.timingManager.tempo}`);

        // Get bar:beat:tick info
        const barBeatTick: BarBeatTick = this.timingManager.timeToBarBeatTick(targetTime);

        // Get minutes:seconds:milliseconds info
        const totalMs = targetTime * 1000;
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

        if (fontFamily) ensureFontLoaded(fontFamily);
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

// Time display element for showing current time
import { SceneElement } from './base';
import { Text, Rectangle } from '../render-objects/index.js';
import { LocalTimingManager } from '../local-timing-manager.js';
import { ConfigSchema, TimeDisplayConfig, RenderObjectInterface } from '../types.js';
import { render } from '@testing-library/react';

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
    public position: 'bottomLeft' | 'topLeft' | 'topRight' | 'bottomRight' = 'bottomLeft';
    public showProgress: boolean = true;
    public fontFamily: string = 'Arial';
    public fontWeight: string = '400';
    public textColor: string = '#FFFFFF';
    public textSecondaryColor: string = 'rgba(255, 255, 255, 0.9)';
    public timingManager: LocalTimingManager;

    constructor(
        id: string = 'timeDisplay', 
        position: 'bottomLeft' | 'topLeft' | 'topRight' | 'bottomRight' = 'bottomLeft', 
        showProgress: boolean = true, 
        config: TimeDisplayConfig = {}, 
        timingManager: any = null
    ) {
        super('timeDisplay', id, { position, showProgress, ...config });
        this.position = position;
        this.showProgress = showProgress;

        // Use local timing manager by default for independent timing control
        this.timingManager = new LocalTimingManager(null);

        // Legacy support - if a timing manager is provided, copy its configuration
        if (timingManager) {
            this.timingManager.applyConfig(timingManager.getConfig ? timingManager.getConfig() : {
                bpm: timingManager.bpm,
                beatsPerBar: timingManager.beatsPerBar,
                timeSignature: timingManager.timeSignature,
                ticksPerQuarter: timingManager.ticksPerQuarter,
                tempo: timingManager.tempo
            });
        }

        this._applyConfig();
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Time Display',
            description: 'Current time and beat position display',
            category: 'info',
            properties: {
                ...super.getConfigSchema().properties,

                // Local timing properties
                bpm: {
                    type: 'number',
                    label: 'BPM (Tempo)',
                    default: 120,
                    min: 20,
                    max: 300,
                    step: 0.1,
                    description: 'Beats per minute for this time display'
                },
                beatsPerBar: {
                    type: 'number',
                    label: 'Beats per Bar',
                    default: 4,
                    min: 1,
                    max: 16,
                    step: 1,
                    description: 'Number of beats in each bar for this display'
                },

                position: {
                    type: 'select',
                    label: 'Position',
                    default: 'bottomLeft',
                    options: [
                        { value: 'topLeft', label: 'Top Left' },
                        { value: 'topRight', label: 'Top Right' },
                        { value: 'bottomLeft', label: 'Bottom Left' },
                        { value: 'bottomRight', label: 'Bottom Right' }
                    ],
                    description: 'Position of the time display on screen'
                },
                showProgress: {
                    type: 'boolean',
                    label: 'Show Progress Bars',
                    default: true,
                    description: 'Display progress bars for beat and tick'
                },
                fontFamily: {
                    type: 'select',
                    label: 'Font Family',
                    default: 'Arial',
                    options: [
                        { value: 'Arial', label: 'Arial' },
                        { value: 'Helvetica', label: 'Helvetica' },
                        { value: 'Times New Roman', label: 'Times New Roman' },
                        { value: 'Georgia', label: 'Georgia' },
                        { value: 'Verdana', label: 'Verdana' },
                        { value: 'Trebuchet MS', label: 'Trebuchet MS' },
                        { value: 'Impact', label: 'Impact' },
                        { value: 'Courier New', label: 'Courier New' }
                    ],
                    description: 'Font family for the time display'
                },
                fontWeight: {
                    type: 'select',
                    label: 'Font Weight',
                    default: '400',
                    options: [
                        { value: 'normal', label: 'Normal' },
                        { value: 'bold', label: 'Bold' },
                        { value: '100', label: 'Thin' },
                        { value: '300', label: 'Light' },
                        { value: '400', label: 'Regular' },
                        { value: '500', label: 'Medium' },
                        { value: '700', label: 'Bold' },
                        { value: '900', label: 'Black' }
                    ],
                    description: 'Font weight for the time display'
                },
                textColor: {
                    type: 'color',
                    label: 'Text Color',
                    default: '#FFFFFF',
                    description: 'Main text color for the time display'
                },
                textSecondaryColor: {
                    type: 'color',
                    label: 'Secondary Text Color',
                    default: 'rgba(255, 255, 255, 0.9)',
                    description: 'Secondary text color for the time display labels and progress bars'
                }
            }
        };
    }

    protected _applyConfig(): void {
        super._applyConfig();

        // Local timing settings
        if (this.config.bpm !== undefined) {
            this.timingManager.setBPM(this.config.bpm);
        }
        if (this.config.beatsPerBar !== undefined) {
            this.timingManager.setBeatsPerBar(this.config.beatsPerBar);
        }

        if (this.config.position !== undefined) {
            this.position = this.config.position;
        }
        if (this.config.showProgress !== undefined) {
            this.showProgress = this.config.showProgress;
        }
        if (this.config.fontFamily !== undefined) {
            this.fontFamily = this.config.fontFamily;
        }
        if (this.config.fontWeight !== undefined) {
            this.fontWeight = this.config.fontWeight;
        }
        if (this.config.textColor !== undefined) {
            this.textColor = this.config.textColor;
        }
        if (this.config.textSecondaryColor !== undefined) {
            this.textSecondaryColor = this.config.textSecondaryColor;
        }
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        const renderObjects: RenderObjectInterface[] = [];
        const { canvas, duration } = config;
        const { width, height } = canvas;

        // Use TimingManager for all timing calculations
        const barBeatTick: BarBeatTick = this.timingManager.timeToBarBeatTick(targetTime);
        const secondsPerBar = this.timingManager.getSecondsPerBar();

        // Add total bars calculation
        barBeatTick.totalBars = Math.ceil(duration / secondsPerBar);

        // Calculate current time in minutes:seconds:milliseconds
        const totalMs = Math.max(0, targetTime * 1000);
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = Math.floor(totalMs % 1000);

        const minSecMs: MinSecMs = { minutes, seconds, milliseconds };

        const margin = width * 0.03;
        const bottomMargin = height * 0.08;
        const baseFontSize = Math.max(height * 0.035, 16);

        // Format display text with zero-padding
        const barText = String(barBeatTick.bar).padStart(3, '0');
        const beatText = String(barBeatTick.beat).padStart(2, '0');
        const tickText = String(barBeatTick.tick).padStart(3, '0');
        const minText = String(minSecMs.minutes).padStart(3, '0');
        const secText = String(minSecMs.seconds).padStart(2, '0');
        const msText = String(minSecMs.milliseconds).padStart(3, '0');

        // Calculate position based on position setting
        let x: number, timeY: number, beatY: number;
        switch (this.position) {
            case 'topLeft':
                x = margin;
                timeY = margin + baseFontSize;
                beatY = timeY + baseFontSize * 1.8;
                break;
            case 'topRight':
                x = width - margin - baseFontSize * 6;
                timeY = margin + baseFontSize;
                beatY = timeY + baseFontSize * 1.8;
                break;
            case 'bottomRight':
                x = width - margin - baseFontSize * 6;
                beatY = height - bottomMargin;
                timeY = beatY - baseFontSize * 1.8;
                break;
            default: // bottomLeft
                x = margin;
                beatY = height - bottomMargin;
                timeY = beatY - baseFontSize * 1.8;
        }

        const font = `${this.fontWeight} ${baseFontSize}px ${this.fontFamily}, sans-serif`;
        const labelFont = `${this.fontWeight} ${baseFontSize * 0.8}px ${this.fontFamily}, sans-serif`;

        // Time display (minutes:seconds:milliseconds)
        const minLabel = new Text(x + baseFontSize * 2, timeY, minText, font, this.textColor, 'right', 'bottom');
        const secLabel = new Text(x + baseFontSize * 3.8, timeY, secText, font, this.textColor, 'right', 'bottom');
        const msLabel = new Text(x + baseFontSize * 6, timeY, msText, font, this.textColor, 'right', 'bottom');

        // Bar:beat:tick display
        const barLabel = new Text(x + baseFontSize * 2, beatY, barText, font, this.textColor, 'right', 'bottom');
        const beatLabel = new Text(x + baseFontSize * 3.8, beatY, beatText, font, this.textColor, 'right', 'bottom');
        const tickLabel = new Text(x + baseFontSize * 6, beatY, tickText, font, this.textColor, 'right', 'bottom');

        // Labels
        const timeLabel = new Text(x + baseFontSize * 6, timeY - baseFontSize, "time", labelFont, this.textSecondaryColor, 'right', 'bottom');
        const beatLabelText = new Text(x + baseFontSize * 6, beatY - baseFontSize, "beat", labelFont, this.textSecondaryColor, 'right', 'bottom');

        renderObjects.push(minLabel, secLabel, msLabel, barLabel, beatLabel, tickLabel, timeLabel, beatLabelText);

        // Progress bars if enabled
        if (this.showProgress) {
            // Ensure progress values are between 0 and 1 to prevent negative dimensions
            const tickProgress = Math.max(0, Math.min(1, barBeatTick.tick / 960));
            const tickBarWidth = baseFontSize * 2;
            const tickBarX = x + baseFontSize * 6 - tickBarWidth;
            const tickBarY = beatY + baseFontSize * 0.1;

            const tickBarBg = new Rectangle(tickBarX, tickBarY, tickBarWidth, 4,
                this.getColorWithOpacity(this.textSecondaryColor, 0.2));
            const tickBar = new Rectangle(tickBarX, tickBarY, tickBarWidth * tickProgress, 4,
                this.getColorWithOpacity(this.textSecondaryColor, 0.6));

            const beatProgress = Math.max(0, Math.min(1, (barBeatTick.beat - 1) / this.timingManager.beatsPerBar));
            const beatBarWidth = baseFontSize * 1;
            const beatBarX = x + baseFontSize * 3.8 - beatBarWidth;
            const beatBarY = beatY + baseFontSize * 0.1;

            const beatBarBg = new Rectangle(beatBarX, beatBarY, beatBarWidth, 4,
                this.getColorWithOpacity(this.textSecondaryColor, 0.2));
            const beatBar = new Rectangle(beatBarX, beatBarY, beatBarWidth * beatProgress, 4,
                this.getColorWithOpacity(this.textSecondaryColor, 0.6));

            renderObjects.push(tickBarBg, tickBar, beatBarBg, beatBar);
        }

        return renderObjects;
    }

    setPosition(position: 'bottomLeft' | 'topLeft' | 'topRight' | 'bottomRight'): this {
        this.position = position;
        return this;
    }

    setShowProgress(show: boolean): this {
        this.showProgress = show;
        return this;
    }

    setFontFamily(fontFamily: string): this {
        this.fontFamily = fontFamily;
        return this;
    }

    setFontWeight(fontWeight: string): this {
        this.fontWeight = fontWeight;
        return this;
    }

    setTextColor(color: string): this {
        this.textColor = color;
        return this;
    }

    setTextSecondaryColor(color: string): this {
        this.textSecondaryColor = color;
        return this;
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

// Progress display element for showing playback progress
import { SceneElement } from './base';
import { Rectangle, Text } from '../render-objects/index.js';
import { ConfigSchema, ProgressDisplayConfig, RenderObjectInterface } from '../types';

export class ProgressDisplayElement extends SceneElement {
    public showBar: boolean = true;
    public showStats: boolean = true;
    public position: 'top' | 'bottom' = 'bottom';
    public height: number = 20;
    public margin: number = 10;

    constructor(
        id: string = 'progressDisplay', 
        showBar: boolean = true, 
        showStats: boolean = true, 
        position: 'top' | 'bottom' = 'bottom', 
        config: ProgressDisplayConfig = {}
    ) {
        super('progressDisplay', id, { showBar, showStats, position, ...config });
        this.showBar = showBar;
        this.showStats = showStats;
        this.position = position;
        this._applyConfig();
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Progress Display',
            description: 'Playback progress bar and statistics',
            category: 'info',
            properties: {
                ...super.getConfigSchema().properties,
                showBar: {
                    type: 'boolean',
                    label: 'Show Progress Bar',
                    default: true,
                    description: 'Display the progress bar'
                },
                showStats: {
                    type: 'boolean',
                    label: 'Show Statistics',
                    default: true,
                    description: 'Display time and note count statistics'
                },
                position: {
                    type: 'select',
                    label: 'Position',
                    default: 'bottom',
                    options: [
                        { value: 'top', label: 'Top' },
                        { value: 'bottom', label: 'Bottom' }
                    ],
                    description: 'Position on screen'
                },
                height: {
                    type: 'number',
                    label: 'Height',
                    default: 20,
                    min: 10,
                    max: 50,
                    step: 5,
                    description: 'Height of the progress bar in pixels'
                },
                margin: {
                    type: 'number',
                    label: 'Margin',
                    default: 10,
                    min: 0,
                    max: 50,
                    step: 5,
                    description: 'Margin from screen edge in pixels'
                }
            }
        };
    }

    protected _applyConfig(): void {
        super._applyConfig();
        if (this.config.showBar !== undefined) {
            this.showBar = this.config.showBar;
        }
        if (this.config.showStats !== undefined) {
            this.showStats = this.config.showStats;
        }
        if (this.config.position !== undefined) {
            this.position = this.config.position;
        }
        if (this.config.height !== undefined) {
            this.height = this.config.height;
        }
        if (this.config.margin !== undefined) {
            this.margin = this.config.margin;
        }
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        const renderObjects: RenderObjectInterface[] = [];
        const { canvas, duration, sceneDuration, playedNoteEvents, totalNoteEvents } = config;
        const { width, height } = canvas;

        // Use sceneDuration if available (total scene length), fallback to duration
        const totalDuration = sceneDuration || duration;

        // Calculate progress based on the total scene duration
        const progress = totalDuration > 0 ? Math.max(0, Math.min(1, targetTime / totalDuration)) : 0;

        // Position calculation
        const y = this.position === 'top' ? this.margin : height - this.height - this.margin;
        const barY = y;
        const textY = y + this.height + 5;

        // Progress bar background
        if (this.showBar) {
            const progressBg = new Rectangle(
                this.margin,
                barY,
                width - 2 * this.margin,
                this.height,
                'rgba(255, 255, 255, 0.1)'
            );
            renderObjects.push(progressBg);

            // Progress bar fill
            const progressFill = new Rectangle(
                this.margin,
                barY,
                (width - 2 * this.margin) * progress,
                this.height,
                config.textSecondaryColor
            );
            renderObjects.push(progressFill);

            // Border (create as a thin rectangle outline)
            const borderWidth = 1;
            const borderColor = 'rgba(255, 255, 255, 0.3)';
            
            // Top border
            const topBorder = new Rectangle(this.margin, barY, width - 2 * this.margin, borderWidth, borderColor);
            // Bottom border  
            const bottomBorder = new Rectangle(this.margin, barY + this.height - borderWidth, width - 2 * this.margin, borderWidth, borderColor);
            // Left border
            const leftBorder = new Rectangle(this.margin, barY, borderWidth, this.height, borderColor);
            // Right border
            const rightBorder = new Rectangle(this.margin + width - 2 * this.margin - borderWidth, barY, borderWidth, this.height, borderColor);
            
            renderObjects.push(topBorder, bottomBorder, leftBorder, rightBorder);
        }

        // Statistics text
        if (this.showStats) {
            const fontSize = 12;
            const font = `${config.fontWeight} ${fontSize}px ${config.fontFamily}, sans-serif`;

            // Time progress
            const currentTimeText = this._formatTime(targetTime);
            const durationText = this._formatTime(totalDuration);
            const timeText = `${currentTimeText} / ${durationText}`;

            const timeLabel = new Text(
                this.margin,
                this.position === 'top' ? textY : barY - 5,
                timeText,
                font,
                config.textTertiaryColor,
                'left',
                this.position === 'top' ? 'top' : 'bottom'
            );
            renderObjects.push(timeLabel);

            // Notes progress
            const notesText = `${playedNoteEvents} / ${totalNoteEvents} notes`;
            const notesLabel = new Text(
                width - this.margin,
                this.position === 'top' ? textY : barY - 5,
                notesText,
                font,
                config.textTertiaryColor,
                'right',
                this.position === 'top' ? 'top' : 'bottom'
            );
            renderObjects.push(notesLabel);
        }

        return renderObjects;
    }

    private _formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setShowBar(show: boolean): this {
        this.showBar = show;
        return this;
    }

    setShowStats(show: boolean): this {
        this.showStats = show;
        return this;
    }

    setPosition(position: 'top' | 'bottom'): this {
        this.position = position;
        return this;
    }

    setHeight(height: number): this {
        this.height = height;
        return this;
    }

    setMargin(margin: number): this {
        this.margin = margin;
        return this;
    }
}

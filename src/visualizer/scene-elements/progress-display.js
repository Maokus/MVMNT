// Progress display element for showing playback progress
import { SceneElement } from './base.js';
import { Rectangle, Text } from '../render-objects/index.js';

export class ProgressDisplayElement extends SceneElement {
    constructor(id = 'progressDisplay', showBar = true, showStats = true, position = 'bottom', config = {}) {
        super('progressDisplay', id, { showBar, showStats, position, ...config });
        this.showBar = showBar;
        this.showStats = showStats;
        this.position = position; // 'top', 'bottom'
        this.height = 20;
        this.margin = 10;
        this._applyConfig();
    }

    static getConfigSchema() {
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

    _applyConfig() {
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

    buildRenderObjects(config, targetTime) {
        if (!this.visible) return [];

        const renderObjects = [];
        const { canvas, duration, playedNoteEvents, totalNoteEvents } = config;
        const { width, height } = canvas;

        // Calculate progress
        const progress = Math.max(0, Math.min(1, targetTime / duration));
        const notesProgress = totalNoteEvents > 0 ? playedNoteEvents / totalNoteEvents : 0;

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

            // Border
            const progressBorder = new Rectangle(
                this.margin,
                barY,
                width - 2 * this.margin,
                this.height,
                null,
                'rgba(255, 255, 255, 0.3)',
                1
            );
            renderObjects.push(progressBorder);
        }

        // Statistics text
        if (this.showStats) {
            const fontSize = 12;
            const font = `${config.fontWeight} ${fontSize}px ${config.fontFamily}, sans-serif`;

            // Time progress
            const currentTimeText = this._formatTime(targetTime);
            const durationText = this._formatTime(duration);
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

    _formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setShowBar(show) {
        this.showBar = show;
        return this;
    }

    setShowStats(show) {
        this.showStats = show;
        return this;
    }

    setPosition(position) {
        this.position = position;
        return this;
    }

    setHeight(height) {
        this.height = height;
        return this;
    }

    setMargin(margin) {
        this.margin = margin;
        return this;
    }
}

// Progress display element for showing playback progress with property bindings
import { SceneElement } from './base';
import { Rectangle, Text } from '../render-objects/index.js';
import { ConfigSchema, RenderObjectInterface } from '../types';

export class ProgressDisplayElement extends SceneElement {

    constructor(id: string = 'progressDisplay', config: { [key: string]: any } = {}) {
        super('progressDisplay', id, config);
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

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObjectInterface[] = [];
        const { canvas, duration, sceneDuration, playedNoteEvents, totalNoteEvents } = config;
        const { width, height } = canvas;

        // Get properties from bindings
        const showBar = this.getProperty('showBar') as boolean;
        const showStats = this.getProperty('showStats') as boolean;
        const position = this.getProperty('position') as 'top' | 'bottom';
        const barHeight = this.getProperty('height') as number;
        const margin = this.getProperty('margin') as number;

        // Use sceneDuration if available (total scene length), fallback to duration
        const totalDuration = sceneDuration || duration;

        // Calculate progress based on the total scene duration
        const progress = totalDuration > 0 ? Math.max(0, Math.min(1, targetTime / totalDuration)) : 0;

        // Position calculation
        const y = position === 'top' ? margin : height - barHeight - margin;
        const barY = y;
        const textY = y + barHeight + 5;

        // Progress bar background
        if (showBar) {
            const progressBg = new Rectangle(
                margin,
                barY,
                width - 2 * margin,
                barHeight,
                'rgba(255, 255, 255, 0.1)'
            );
            renderObjects.push(progressBg);

            // Progress bar fill
            const progressFill = new Rectangle(
                margin,
                barY,
                (width - 2 * margin) * progress,
                barHeight,
                config.textSecondaryColor
            );
            renderObjects.push(progressFill);

            // Border (create as a thin rectangle outline)
            const borderWidth = 1;
            const borderColor = 'rgba(255, 255, 255, 0.3)';
            
            // Top border
            const topBorder = new Rectangle(margin, barY, width - 2 * margin, borderWidth, borderColor);
            // Bottom border  
            const bottomBorder = new Rectangle(margin, barY + barHeight - borderWidth, width - 2 * margin, borderWidth, borderColor);
            // Left border
            const leftBorder = new Rectangle(margin, barY, borderWidth, barHeight, borderColor);
            // Right border
            const rightBorder = new Rectangle(margin + width - 2 * margin - borderWidth, barY, borderWidth, barHeight, borderColor);
            
            renderObjects.push(topBorder, bottomBorder, leftBorder, rightBorder);
        }

        // Statistics text
        if (showStats) {
            const fontSize = 12;
            const font = `${config.fontWeight} ${fontSize}px ${config.fontFamily}, sans-serif`;

            // Time progress
            const currentTimeText = this._formatTime(targetTime);
            const durationText = this._formatTime(totalDuration);
            const timeText = `${currentTimeText} / ${durationText}`;

            const timeLabel = new Text(
                margin,
                position === 'top' ? textY : barY - 5,
                timeText,
                font,
                config.textTertiaryColor,
                'left',
                position === 'top' ? 'top' : 'bottom'
            );
            renderObjects.push(timeLabel);

            // Notes progress
            const notesText = `${playedNoteEvents} / ${totalNoteEvents} notes`;
            const notesLabel = new Text(
                width - margin,
                position === 'top' ? textY : barY - 5,
                notesText,
                font,
                config.textTertiaryColor,
                'right',
                position === 'top' ? 'top' : 'bottom'
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
}

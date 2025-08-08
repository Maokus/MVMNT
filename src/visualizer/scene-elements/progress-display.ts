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
                height: {
                    type: 'number',
                    label: 'Height',
                    default: 20,
                    min: 10,
                    max: 50,
                    step: 5,
                    description: 'Height of the progress bar in pixels'
                }
            }
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObjectInterface[] = [];
        const { duration, sceneDuration, playedNoteEvents, totalNoteEvents } = config;

        // Get properties from bindings
        const showBar = this.getProperty('showBar') as boolean;
        const showStats = this.getProperty('showStats') as boolean;
        const barHeight = this.getProperty('height') as number;

        // Use sceneDuration if available (total scene length), fallback to duration
        const totalDuration = sceneDuration || duration;

        // Calculate progress based on the total scene duration
        const progress = totalDuration > 0 ? Math.max(0, Math.min(1, targetTime / totalDuration)) : 0;

        // Fixed width for progress bar (positioning handled by transform system)
        const barWidth = 400;
        const margin = 0;
        const barY = 0;
        const textY = barHeight + 5;

        // Progress bar background
        if (showBar) {
            const progressBg = new Rectangle(
                margin,
                barY,
                barWidth,
                barHeight,
                'rgba(255, 255, 255, 0.1)'
            );
            renderObjects.push(progressBg);

            // Progress bar fill
            const progressFill = new Rectangle(
                margin,
                barY,
                barWidth * progress,
                barHeight,
                config.textSecondaryColor || '#cccccc'
            );
            renderObjects.push(progressFill);

            // Border (create as a thin rectangle outline)
            const borderWidth = 1;
            const borderColor = 'rgba(255, 255, 255, 0.3)';
            
            // Top border
            const topBorder = new Rectangle(margin, barY, barWidth, borderWidth, borderColor);
            // Bottom border  
            const bottomBorder = new Rectangle(margin, barY + barHeight - borderWidth, barWidth, borderWidth, borderColor);
            // Left border
            const leftBorder = new Rectangle(margin, barY, borderWidth, barHeight, borderColor);
            // Right border
            const rightBorder = new Rectangle(margin + barWidth - borderWidth, barY, borderWidth, barHeight, borderColor);
            
            renderObjects.push(topBorder, bottomBorder, leftBorder, rightBorder);
        }

        // Statistics text
        if (showStats) {
            const fontSize = 12;
            const font = `${config.fontWeight || 'normal'} ${fontSize}px ${config.fontFamily || 'Arial'}, sans-serif`;

            // Time progress
            const currentTimeText = this._formatTime(targetTime);
            const durationText = this._formatTime(totalDuration);
            const timeText = `${currentTimeText} / ${durationText}`;

            const timeLabel = new Text(
                margin,
                textY,
                timeText,
                font,
                config.textTertiaryColor || '#cccccc',
                'left',
                'top'
            );
            renderObjects.push(timeLabel);

            // Notes progress
            const notesText = `${playedNoteEvents || 0} / ${totalNoteEvents || 0} notes`;
            const notesLabel = new Text(
                barWidth,
                textY,
                notesText,
                font,
                config.textTertiaryColor || '#cccccc',
                'right',
                'top'
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

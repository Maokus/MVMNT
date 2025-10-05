// Progress display element for showing playback progress with property bindings
import { SceneElement } from './base';
import { Rectangle, RenderObject, Text } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types';
import { parseFontSelection, ensureFontLoaded } from '@fonts/font-loader';

export class ProgressDisplayElement extends SceneElement {
    // Helper to convert hex color to rgba string
    private _hexToRgba(hex: string, opacity: number): string {
        hex = hex.replace('#', '');
        let r = 255,
            g = 255,
            b = 255;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    constructor(id: string = 'progressDisplay', config: { [key: string]: any } = {}) {
        super('progressDisplay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Progress Display',
            description: 'Playback progress bar and statistics',
            category: 'Time',
            groups: [
                ...base.groups,
                {
                    id: 'display',
                    label: 'Display',
                    collapsed: false,
                    properties: [
                        {
                            key: 'showBar',
                            type: 'boolean',
                            label: 'Show Progress Bar',
                            default: true,
                            description: 'Display the progress bar',
                        },
                        {
                            key: 'showStats',
                            type: 'boolean',
                            label: 'Show Statistics',
                            default: true,
                            description: 'Display time and note count statistics',
                        },
                        {
                            key: 'barWidth',
                            type: 'number',
                            label: 'Bar Width',
                            default: 400,
                            min: 100,
                            max: 800,
                            step: 5,
                            description: 'Width of the progress bar in pixels',
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height',
                            default: 20,
                            min: 10,
                            max: 50,
                            step: 5,
                            description: 'Height of the progress bar in pixels',
                        },
                        // Color and opacity configs
                        {
                            key: 'barColor',
                            type: 'color',
                            label: 'Bar Color',
                            default: '#cccccc',
                            description: 'Color of the progress bar fill',
                        },
                        {
                            key: 'barOpacity',
                            type: 'number',
                            label: 'Bar Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of the progress bar fill',
                        },
                        {
                            key: 'barBgColor',
                            type: 'color',
                            label: 'Bar Background Color',
                            default: '#ffffff',
                            description: 'Color of the progress bar background',
                        },
                        {
                            key: 'barBgOpacity',
                            type: 'number',
                            label: 'Bar Background Opacity',
                            default: 0.1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of the progress bar background',
                        },
                        {
                            key: 'borderColor',
                            type: 'color',
                            label: 'Border Color',
                            default: '#ffffff',
                            description: 'Color of the progress bar border',
                        },
                        {
                            key: 'borderOpacity',
                            type: 'number',
                            label: 'Border Opacity',
                            default: 0.3,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of the progress bar border',
                        },
                        {
                            key: 'statsTextColor',
                            type: 'color',
                            label: 'Stats Text Color',
                            default: '#cccccc',
                            description: 'Color of the statistics text',
                        },
                        {
                            key: 'statsTextOpacity',
                            type: 'number',
                            label: 'Stats Text Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of the statistics text',
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObject[] = [];
        const { duration, playRangeStartSec, playRangeEndSec } = config as any;
        const effectiveTime = targetTime;

        // Get properties from bindings
        const showBar = this.getProperty('showBar') as boolean;
        const showStats = this.getProperty('showStats') as boolean;
        const barHeight = this.getProperty('height') as number;

        // Use explicit playback window when provided (user-defined), fallback to full duration
        const totalDuration =
            isFinite(playRangeEndSec) && isFinite(playRangeStartSec)
                ? Math.max(0, (playRangeEndSec as number) - (playRangeStartSec as number))
                : duration;

        // Calculate progress based on the total scene duration relative to playRangeStart
        const relTime = isFinite(playRangeStartSec) ? effectiveTime - (playRangeStartSec as number) : effectiveTime;
        const progress = totalDuration > 0 ? Math.max(0, Math.min(1, relTime / totalDuration)) : 0;

        // Fixed width for progress bar (positioning handled by transform system)
        const margin = 0;
        const barY = 0;
        const textY = barHeight + 5;

        // Progress bar background
        if (showBar) {
            // Get config values or defaults
            const barColor = this.getProperty<string>('barColor') || '#cccccc';
            const barOpacity = this.getProperty<number>('barOpacity');
            const barBgColor = this.getProperty<string>('barBgColor') || '#ffffff';
            const barBgOpacity = this.getProperty<number>('barBgOpacity');
            const borderColorRaw = this.getProperty<string>('borderColor') || '#ffffff';
            const borderOpacity = this.getProperty<number>('borderOpacity');
            const barWidth = this.getProperty<number>('barWidth') || 400;

            // Progress bar background
            const progressBg = new Rectangle(
                margin,
                barY,
                barWidth,
                barHeight,
                this._hexToRgba(barBgColor, barBgOpacity)
            );
            renderObjects.push(progressBg);

            // Progress bar fill
            const progressFill = new Rectangle(
                margin,
                barY,
                barWidth * progress,
                barHeight,
                this._hexToRgba(barColor, barOpacity)
            );
            renderObjects.push(progressFill);

            // Border (create as a thin rectangle outline)
            const borderWidth = 1;
            const borderColor = this._hexToRgba(borderColorRaw, borderOpacity);

            // Top border
            const topBorder = new Rectangle(margin, barY, barWidth, borderWidth, borderColor);
            // Bottom border
            const bottomBorder = new Rectangle(
                margin,
                barY + barHeight - borderWidth,
                barWidth,
                borderWidth,
                borderColor
            );
            // Left border
            const leftBorder = new Rectangle(margin, barY, borderWidth, barHeight, borderColor);
            // Right border
            const rightBorder = new Rectangle(
                margin + barWidth - borderWidth,
                barY,
                borderWidth,
                barHeight,
                borderColor
            );

            renderObjects.push(topBorder, bottomBorder, leftBorder, rightBorder);
        }

        // Statistics text
        if (showStats) {
            const fontSize = 12;
            let fontFamily = config.fontFamily || 'Arial';
            let fontWeight = '400';
            if (fontFamily && fontFamily.includes('|')) {
                const parsed = parseFontSelection(fontFamily);
                fontFamily = parsed.family || fontFamily;
                fontWeight = parsed.weight || fontWeight;
            }
            // Ensure chosen weight is available (especially for thin weights like 100)
            if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
            const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
            const statsTextColorRaw = config.statsTextColor || '#cccccc';
            const statsTextOpacity = typeof config.statsTextOpacity === 'number' ? config.statsTextOpacity : 1;

            // Time progress
            const currentTimeText = this._formatTime(Math.max(0, relTime));
            const durationText = this._formatTime(totalDuration);
            const timeText = `${currentTimeText} / ${durationText}`;

            const timeLabel = new Text(
                margin,
                textY,
                timeText,
                font,
                this._hexToRgba(statsTextColorRaw, statsTextOpacity),
                'left',
                'top'
            );
            renderObjects.push(timeLabel);
        }

        return renderObjects;
    }

    private _formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

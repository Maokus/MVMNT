// Progress display element for showing playback progress with property bindings
import { SceneElement, asBoolean, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { Rectangle, RenderObject, Text } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { parseFontSelection, ensureFontLoaded } from '@fonts/font-loader';

const clampUnit: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) return undefined;
    return Math.max(0, Math.min(1, numeric));
};

const clampNonNegative: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) return undefined;
    return Math.max(0, numeric);
};

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
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Progress Display',
            description: 'Playback progress bar and statistics',
            category: 'Misc',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'progressBasics',
                    label: 'Progress & Stats',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Decide which UI elements to show and size the progress bar.',
                    properties: [
                        {
                            key: 'showBar',
                            type: 'boolean',
                            label: 'Show Progress Bar',
                            default: true,
                            runtime: { transform: asBoolean, defaultValue: true },
                        },
                        {
                            key: 'showStats',
                            type: 'boolean',
                            label: 'Show Statistics',
                            default: true,
                            runtime: { transform: asBoolean, defaultValue: true },
                        },
                        {
                            key: 'barWidth',
                            type: 'number',
                            label: 'Bar Width (px)',
                            default: 400,
                            min: 100,
                            max: 1200,
                            step: 5,
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: clampNonNegative, defaultValue: 400 },
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Bar Height (px)',
                            default: 20,
                            min: 10,
                            max: 80,
                            step: 5,
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: clampNonNegative, defaultValue: 20 },
                        },
                    ],
                    presets: [
                        {
                            id: 'fullPanel',
                            label: 'Full Panel',
                            values: { showBar: true, showStats: true, barWidth: 480, height: 24 },
                        },
                        {
                            id: 'barOnly',
                            label: 'Bar Only',
                            values: { showBar: true, showStats: false, barWidth: 560, height: 18 },
                        },
                        {
                            id: 'statsOverlay',
                            label: 'Stats Overlay',
                            values: { showBar: false, showStats: true },
                        },
                    ],
                },
                {
                    id: 'progressAppearance',
                    label: 'Colors & Opacity',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Fine-tune bar and statistics styling.',
                    properties: [
                        {
                            key: 'barColor',
                            type: 'color',
                            label: 'Bar Color',
                            default: '#cccccc',
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: asTrimmedString, defaultValue: '#cccccc' },
                        },
                        {
                            key: 'barOpacity',
                            type: 'number',
                            label: 'Bar Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: clampUnit, defaultValue: 1 },
                        },
                        {
                            key: 'barBgColor',
                            type: 'color',
                            label: 'Bar Background Color',
                            default: '#ffffff',
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: asTrimmedString, defaultValue: '#ffffff' },
                        },
                        {
                            key: 'barBgOpacity',
                            type: 'number',
                            label: 'Bar Background Opacity',
                            default: 0.1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: clampUnit, defaultValue: 0.1 },
                        },
                        {
                            key: 'borderColor',
                            type: 'color',
                            label: 'Border Color',
                            default: '#ffffff',
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: asTrimmedString, defaultValue: '#ffffff' },
                        },
                        {
                            key: 'borderOpacity',
                            type: 'number',
                            label: 'Border Opacity',
                            default: 0.3,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showBar', truthy: true }],
                            runtime: { transform: clampUnit, defaultValue: 0.3 },
                        },
                        {
                            key: 'statsTextColor',
                            type: 'color',
                            label: 'Stats Text Color',
                            default: '#cccccc',
                            visibleWhen: [{ key: 'showStats', truthy: true }],
                            runtime: { transform: asTrimmedString, defaultValue: '#cccccc' },
                        },
                        {
                            key: 'statsTextOpacity',
                            type: 'number',
                            label: 'Stats Text Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showStats', truthy: true }],
                            runtime: { transform: clampUnit, defaultValue: 1 },
                        },
                    ],
                    presets: [
                        {
                            id: 'glass',
                            label: 'Glass Overlay',
                            values: {
                                barColor: '#38bdf8',
                                barOpacity: 0.8,
                                barBgColor: '#0f172a',
                                barBgOpacity: 0.35,
                                borderColor: '#38bdf8',
                                borderOpacity: 0.5,
                                statsTextColor: '#f8fafc',
                                statsTextOpacity: 0.9,
                            },
                        },
                        {
                            id: 'minimal',
                            label: 'Minimal Line',
                            values: {
                                barColor: '#e2e8f0',
                                barOpacity: 0.6,
                                barBgColor: '#ffffff',
                                barBgOpacity: 0.08,
                                borderColor: '#ffffff',
                                borderOpacity: 0.2,
                                statsTextColor: '#cbd5f5',
                                statsTextOpacity: 0.8,
                            },
                        },
                        {
                            id: 'clubNight',
                            label: 'Club Night',
                            values: {
                                barColor: '#f97316',
                                barOpacity: 0.9,
                                barBgColor: '#111827',
                                barBgOpacity: 0.4,
                                borderColor: '#f59e0b',
                                borderOpacity: 0.6,
                                statsTextColor: '#f8fafc',
                                statsTextOpacity: 1,
                            },
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
        const { duration, playRangeStartSec, playRangeEndSec } = config as any;
        const effectiveTime = targetTime;

        // Get properties from bindings
        const showBar = props.showBar;
        const showStats = props.showStats;
        const barHeight = props.height ?? 20;

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
            const barColor = props.barColor ?? '#cccccc';
            const barOpacity = props.barOpacity;
            const barBgColor = props.barBgColor ?? '#ffffff';
            const barBgOpacity = props.barBgOpacity;
            const borderColorRaw = props.borderColor ?? '#ffffff';
            const borderOpacity = props.borderOpacity;
            const barWidth = props.barWidth ?? 400;

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
            const statsTextColorRaw = props.statsTextColor ?? '#cccccc';
            const statsTextOpacity = props.statsTextOpacity ?? 1;

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

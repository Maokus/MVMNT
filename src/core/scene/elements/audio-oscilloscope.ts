import { SceneElement } from './base';
import { Line, Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import {
    coerceFeatureDescriptors,
    emitAnalysisIntent,
    resolveFeatureContext,
    resolveDescriptorChannelIndex,
    resolveTimelineTrackRefValue,
} from './audioFeatureUtils';
import {
    applyGlowToPoly,
    channelColorPalette,
    sampleFeatureHistory,
    type FeatureHistoryFrame,
    type GlowStyle,
} from '@utils/audioVisualization';

type ChannelMode = 'mono' | 'stereoOverlay' | 'split' | 'lissajous';
type TriggerMode = 'free' | 'zeroCross';
type FillMode = 'none' | 'under';
type TriggerDirection = 'rising' | 'falling';

interface SeriesTrace {
    descriptor: AudioFeatureDescriptor;
    label: string;
    color: string;
    values: number[];
    minValues?: number[];
    maxValues?: number[];
}

interface TraceResult {
    series: SeriesTrace[];
    frameTicks: number[];
    frameSeconds: number[] | null;
    windowStartTick: number;
    windowEndTick: number;
    windowStartSeconds: number;
    windowEndSeconds: number;
    hopTicks: number;
    trackStartTick: number;
    trackEndTick: number;
    sourceId: string;
    format: string;
    channels: number;
    data: number[];
}

interface SampleRangeInfo {
    hopTicks: number;
    trackStartTick: number;
    trackEndTick: number;
    windowStartTick: number;
    windowEndTick: number;
    sourceId: string;
    format: string;
    channels: number;
    data: number[];
}

const MAX_PERSISTENCE_WINDOWS = 5;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function normalizeColorAlpha(color: string, alpha: number): string {
    const trimmed = color?.trim();
    if (!trimmed) return color;
    if (trimmed.startsWith('#')) {
        const hex = trimmed.slice(1);
        if (hex.length === 3 || hex.length === 6 || hex.length === 8) {
            const normalized = hex.length === 3
                ? hex
                      .split('')
                      .map((ch) => ch + ch)
                      .join('')
                : hex.length === 6
                ? hex
                : hex.slice(0, 6);
            const base = Number.parseInt(normalized, 16);
            const r = (base >> 16) & 0xff;
            const g = (base >> 8) & 0xff;
            const b = base & 0xff;
            return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
        }
    }
    const rgba = trimmed.match(/^rgba?\(([^)]+)\)$/i);
    if (rgba) {
        const [r = 0, g = 0, b = 0] = rgba[1]
            .split(',')
            .map((component) => Number.parseFloat(component.trim()))
            .map((component) => (Number.isFinite(component) ? component : 0));
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${clamp(alpha, 0, 1).toFixed(3)})`;
    }
    return color;
}

function computeSeriesLabel(descriptor: AudioFeatureDescriptor, fallbackIndex: number): string {
    if (descriptor.channelAlias) {
        return descriptor.channelAlias;
    }
    if (descriptor.channelIndex != null) {
        return `Channel ${descriptor.channelIndex + 1}`;
    }
    return `Channel ${fallbackIndex + 1}`;
}

function findZeroCrossIndex(
    values: number[],
    threshold: number,
    direction: TriggerDirection,
): number | null {
    if (values.length < 3) {
        return null;
    }
    const searchLimit = Math.max(2, Math.min(values.length - 1, Math.ceil(values.length * 0.25)));
    const positiveThreshold = Math.max(0, threshold);
    for (let index = 0; index < searchLimit; index += 1) {
        const current = values[index] ?? 0;
        const next = values[index + 1] ?? current;
        if (direction === 'rising') {
            if (current <= 0 && next >= positiveThreshold && next > current) {
                return index;
            }
        } else if (current >= 0 && next <= -positiveThreshold && next < current) {
            return index;
        }
    }
    return null;
}

export class AudioOscilloscopeElement extends SceneElement {
    constructor(id: string = 'audioOscilloscope', config: Record<string, unknown> = {}) {
        super('audioOscilloscope', id, config);
    }

    private static readonly DEFAULT_DESCRIPTOR: AudioFeatureDescriptor = { featureKey: 'waveform', smoothing: 0 };

    private lastWindowCache:
        | {
              manager: ReturnType<typeof getSharedTimingManager>;
              targetTime: number;
              offsetSeconds: number;
              windowSeconds: number;
              windowStartSeconds: number;
              windowEndSeconds: number;
              targetTick: number;
              startTick: number;
              endTick: number;
          }
        | null = null;

    private resolveWindowMetrics(
        manager: ReturnType<typeof getSharedTimingManager>,
        targetTime: number,
        offsetSeconds: number,
        windowSeconds: number,
    ) {
        const cached = this.lastWindowCache;
        if (
            cached &&
            cached.manager === manager &&
            cached.targetTime === targetTime &&
            cached.offsetSeconds === offsetSeconds &&
            cached.windowSeconds === windowSeconds
        ) {
            return cached;
        }
        const halfWindow = windowSeconds / 2;
        const windowStartSeconds = targetTime + offsetSeconds - halfWindow;
        const windowEndSeconds = targetTime + offsetSeconds + halfWindow;
        const next = {
            manager,
            targetTime,
            offsetSeconds,
            windowSeconds,
            windowStartSeconds,
            windowEndSeconds,
            targetTick: Math.round(manager.secondsToTicks(targetTime)),
            startTick: Math.round(manager.secondsToTicks(windowStartSeconds)),
            endTick: Math.round(manager.secondsToTicks(windowEndSeconds)),
        };
        this.lastWindowCache = next;
        return next;
    }

    private resolveGlowStyle(color: string, scale = 1): GlowStyle | null {
        const baseOpacity = clamp((this.getProperty<number>('glowOpacity') ?? 0) * scale, 0, 1);
        if (baseOpacity <= 0) {
            return null;
        }
        const blur = Math.max(0, this.getProperty<number>('glowBlur') ?? 16);
        const layers = Math.max(0, Math.floor(this.getProperty<number>('glowLayers') ?? 2));
        const spread = Math.max(0, this.getProperty<number>('glowSpread') ?? 4);
        return {
            color,
            blur,
            opacity: baseOpacity,
            layerCount: layers,
            layerSpread: spread,
            opacityFalloff: 'quadratic',
        };
    }

    private buildTrace(
        trackId: string | null,
        descriptors: AudioFeatureDescriptor[],
        windowMetrics: ReturnType<typeof this.resolveWindowMetrics>,
        baseColor: string,
        zeroCross: { mode: TriggerMode; threshold: number; direction: TriggerDirection },
        tm: ReturnType<typeof getSharedTimingManager>,
        context: ReturnType<typeof resolveFeatureContext> | null,
    ): TraceResult | null {
        if (!trackId || !descriptors.length) {
            return null;
        }

        const state = useTimelineStore.getState();
        const paletteSource = context?.featureTrack?.channelAliases ?? context?.cache.channelAliases ?? descriptors.length;
        const palette = channelColorPalette(paletteSource);
        const startTick = Math.min(windowMetrics.startTick, windowMetrics.endTick);
        const endTick = Math.max(windowMetrics.startTick, windowMetrics.endTick);

        const series: SeriesTrace[] = [];
        const frameTickSets: number[][] = [];
        const frameSecondSets: (number[] | null)[] = [];
        let baseRangeInfo: SampleRangeInfo | null = null;

        descriptors.forEach((descriptor, index) => {
            if (!descriptor?.featureKey) {
                return;
            }
            const resolvedChannelIndex = resolveDescriptorChannelIndex(trackId, descriptor);
            const range = sampleAudioFeatureRange(state, trackId, descriptor.featureKey, startTick, endTick, {
                bandIndex: descriptor.bandIndex ?? undefined,
                channelIndex: resolvedChannelIndex ?? undefined,
                smoothing: descriptor.smoothing ?? undefined,
            });
            if (!range || range.frameCount < 2 || !range.data?.length) {
                return;
            }

            const frameTicks = Array.from(range.frameTicks ?? []);
            const frameSeconds = range.frameSeconds ? Array.from(range.frameSeconds) : null;
            const channels = Math.max(1, range.channels || 1);
            const values: number[] = [];
            const minValues: number[] = [];
            const maxValues: number[] = [];
            for (let frame = 0; frame < range.frameCount; frame += 1) {
                const baseIndex = frame * channels;
                if (range.format === 'waveform-minmax') {
                    const min = clamp(range.data[baseIndex] ?? 0, -1, 1);
                    const max = clamp(range.data[baseIndex + 1] ?? min, -1, 1);
                    const avg = clamp((min + max) / 2, -1, 1);
                    values.push(avg);
                    minValues.push(min);
                    maxValues.push(max);
                } else if (channels > 1) {
                    values.push(clamp(range.data[baseIndex] ?? 0, -1, 1));
                } else {
                    values.push(clamp(range.data[baseIndex] ?? 0, -1, 1));
                }
            }

            const paletteEntry = (() => {
                const alias = descriptor.channelAlias?.toLowerCase() ?? null;
                if (alias) {
                    const match = palette.find((entry) => entry.alias?.toLowerCase() === alias);
                    if (match) {
                        return match;
                    }
                }
                if (descriptor.channelIndex != null) {
                    const match = palette.find((entry) => entry.index === descriptor.channelIndex);
                    if (match) {
                        return match;
                    }
                }
                return palette[index % Math.max(1, palette.length)] ?? null;
            })();

            series.push({
                descriptor,
                label: paletteEntry?.label ?? computeSeriesLabel(descriptor, index),
                color: paletteEntry?.color ?? baseColor,
                values,
                minValues: minValues.length ? minValues : undefined,
                maxValues: maxValues.length ? maxValues : undefined,
            });
            frameTickSets.push(frameTicks);
            frameSecondSets.push(frameSeconds);

            if (!baseRangeInfo) {
                baseRangeInfo = {
                    hopTicks: range.hopTicks ?? 0,
                    trackStartTick: range.trackStartTick ?? startTick,
                    trackEndTick: range.trackEndTick ?? endTick,
                    windowStartTick: range.windowStartTick ?? startTick,
                    windowEndTick: range.windowEndTick ?? endTick,
                    sourceId: range.sourceId ?? trackId ?? 'unknown',
                    format: range.format,
                    channels: range.channels ?? 1,
                    data: Array.from(range.data ?? []),
                };
            }
        });

        if (!series.length || !frameTickSets.length) {
            return null;
        }

        let frameCount = series.reduce((min, entry) => Math.min(min, entry.values.length), Number.POSITIVE_INFINITY);
        frameCount = frameTickSets.reduce((min, entries) => Math.min(min, entries.length), frameCount);
        if (!Number.isFinite(frameCount) || frameCount < 2) {
            return null;
        }

        series.forEach((entry) => {
            if (entry.values.length > frameCount) {
                entry.values = entry.values.slice(0, frameCount);
            }
            if (entry.minValues && entry.minValues.length > frameCount) {
                entry.minValues = entry.minValues.slice(0, frameCount);
            }
            if (entry.maxValues && entry.maxValues.length > frameCount) {
                entry.maxValues = entry.maxValues.slice(0, frameCount);
            }
        });

        let frameTicks = frameTickSets[0]?.slice(0, frameCount) ?? [];
        let frameSeconds = frameSecondSets[0] ? frameSecondSets[0]!.slice(0, frameCount) : null;

        if (zeroCross.mode === 'zeroCross' && series[0]) {
            const zeroIndex = findZeroCrossIndex(series[0].values, zeroCross.threshold, zeroCross.direction);
            if (zeroIndex != null && zeroIndex > 0 && zeroIndex < frameCount - 1) {
                series.forEach((entry) => {
                    entry.values = entry.values.slice(zeroIndex);
                    if (entry.minValues) {
                        entry.minValues = entry.minValues.slice(zeroIndex);
                    }
                    if (entry.maxValues) {
                        entry.maxValues = entry.maxValues.slice(zeroIndex);
                    }
                });
                frameTicks = frameTicks.slice(zeroIndex);
                if (frameSeconds) {
                    frameSeconds = frameSeconds.slice(zeroIndex);
                }
                frameCount = series[0].values.length;
                if (frameCount < 2) {
                    return null;
                }
                if (baseRangeInfo) {
                    const info = baseRangeInfo as SampleRangeInfo;
                    const dataChannels = Math.max(1, info.channels || 1);
                    const startOffset = zeroIndex * dataChannels;
                    info.data = info.data.slice(
                        startOffset,
                        startOffset + frameCount * dataChannels,
                    );
                    info.windowStartTick = frameTicks[0] ?? info.windowStartTick;
                }
            }
        }

        const effectiveStartTick = frameTicks[0] ?? startTick;
        const effectiveEndTick = frameTicks[frameCount - 1] ?? endTick;
        const windowStartSeconds = frameSeconds?.[0] ?? tm.ticksToSeconds(effectiveStartTick);
        const windowEndSeconds = frameSeconds?.[frameSeconds.length - 1] ?? tm.ticksToSeconds(effectiveEndTick);

        if (baseRangeInfo) {
            const info = baseRangeInfo as SampleRangeInfo;
            const dataChannels = Math.max(1, info.channels || 1);
            const expectedLength = frameCount * dataChannels;
            if (info.data.length > expectedLength) {
                info.data = info.data.slice(0, expectedLength);
            }
            info.windowStartTick = effectiveStartTick;
            info.windowEndTick = effectiveEndTick;
        }

        const info = baseRangeInfo as SampleRangeInfo | null;
        return {
            series,
            frameTicks,
            frameSeconds,
            windowStartTick: effectiveStartTick,
            windowEndTick: effectiveEndTick,
            windowStartSeconds,
            windowEndSeconds,
            hopTicks: info?.hopTicks ?? 0,
            trackStartTick: info?.trackStartTick ?? startTick,
            trackEndTick: info?.trackEndTick ?? endTick,
            sourceId: info?.sourceId ?? trackId ?? 'unknown',
            format: info?.format ?? 'unknown',
            channels: info?.channels ?? 1,
            data: info?.data ?? [],
        };
    }

    private buildTraceObjects(
        trace: TraceResult,
        width: number,
        height: number,
        channelMode: ChannelMode,
        fillMode: FillMode,
        fillOpacity: number,
        lineWidth: number,
        baselineWidth: number,
        baselineColor: string,
        baseColor: string,
        options: { alphaScale?: number; skipFill?: boolean; skipBaseline?: boolean; glowScale?: number } = {},
    ): RenderObject[] {
        const alphaScale = clamp(options.alphaScale ?? 1, 0, 1);
        const renderObjects: RenderObject[] = [];
        const frameCount = trace.frameTicks.length;
        if (frameCount < 2) {
            return renderObjects;
        }
        let resolvedChannelMode = channelMode;
        if (resolvedChannelMode === 'lissajous' && trace.series.length < 2) {
            resolvedChannelMode = 'mono';
        }

        const tickStart = trace.frameTicks[0] ?? trace.windowStartTick;
        const tickEnd = trace.frameTicks[frameCount - 1] ?? trace.windowEndTick;
        const tickSpan = Math.max(1, tickEnd - tickStart);
        const fallbackSpan = frameCount > 1 ? frameCount - 1 : 1;

        if (resolvedChannelMode === 'lissajous' && trace.series.length >= 2) {
            const seriesX = trace.series[0];
            const seriesY = trace.series[1];
            const count = Math.min(seriesX.values.length, seriesY.values.length);
            if (count < 2) {
                return renderObjects;
            }
            const points: Array<{ x: number; y: number }> = [];
            for (let i = 0; i < count; i += 1) {
                const xValue = clamp(seriesX.values[i] ?? 0, -1, 1);
                const yValue = clamp(seriesY.values[i] ?? 0, -1, 1);
                points.push({
                    x: width / 2 + xValue * (width / 2),
                    y: height / 2 - yValue * (height / 2),
                });
            }
            const color = baseColor;
            const line = new Poly(points, null, color, lineWidth, { includeInLayoutBounds: false });
            line.setClosed(false);
            line.setIncludeInLayoutBounds(false);
            if (alphaScale < 1) {
                line.setGlobalAlpha(alphaScale);
            }
            const glow = this.resolveGlowStyle(color, options.glowScale ?? 1);
            const glowPolys = applyGlowToPoly(line, glow);
            glowPolys.forEach((poly) => {
                poly.setIncludeInLayoutBounds(false);
                if (alphaScale < 1) {
                    poly.setGlobalAlpha(alphaScale);
                }
                renderObjects.push(poly);
            });
            return renderObjects;
        }

        const seriesList = resolvedChannelMode === 'mono' ? trace.series.slice(0, 1) : trace.series.slice(0);
        if (!seriesList.length) {
            return renderObjects;
        }
        const channelTotal = resolvedChannelMode === 'mono' ? 1 : seriesList.length;
        const computeBaseline = (channelIndex: number) => {
            if (resolvedChannelMode === 'split') {
                const regionHeight = height / channelTotal;
                return regionHeight * (channelIndex + 0.5);
            }
            return height / 2;
        };
        const computeY = (value: number, channelIndex: number) => {
            const normalized = clamp(value, -1, 1);
            if (resolvedChannelMode === 'split') {
                const regionHeight = height / channelTotal;
                const centerY = regionHeight * (channelIndex + 0.5);
                return centerY - normalized * (regionHeight / 2);
            }
            return height / 2 - normalized * (height / 2);
        };

        const fillObjects: RenderObject[] = [];
        const lineObjects: RenderObject[] = [];

        seriesList.forEach((entry, index) => {
            const color = resolvedChannelMode === 'mono' ? baseColor : entry.color || baseColor;
            const points: Array<{ x: number; y: number }> = [];
            for (let frame = 0; frame < frameCount; frame += 1) {
                const tick = trace.frameTicks[frame] ?? tickStart;
                const ratio = tickSpan > 0 ? (tick - tickStart) / tickSpan : frame / fallbackSpan;
                const clampedRatio = clamp(ratio, 0, 1);
                const x = clampedRatio * width;
                const value = entry.values[frame] ?? 0;
                const y = computeY(value, index);
                points.push({ x, y });
            }
            if (fillMode === 'under' && !options.skipFill) {
                const baselineY = computeBaseline(index);
                const fillPoints = [
                    ...points,
                    { x: points[points.length - 1]?.x ?? width, y: baselineY },
                    { x: points[0]?.x ?? 0, y: baselineY },
                ];
                const fillColor = normalizeColorAlpha(color, fillOpacity * alphaScale);
                const fillPoly = new Poly(fillPoints, fillColor, null, 0, { includeInLayoutBounds: false });
                fillPoly.setClosed(true);
                fillPoly.setIncludeInLayoutBounds(false);
                if (alphaScale < 1) {
                    fillPoly.setGlobalAlpha(alphaScale);
                }
                fillObjects.push(fillPoly);
            }

            const line = new Poly(points, null, color, lineWidth, { includeInLayoutBounds: false });
            line.setClosed(false);
            line.setIncludeInLayoutBounds(false);
            if (alphaScale < 1) {
                line.setGlobalAlpha(alphaScale);
            }
            const glow = this.resolveGlowStyle(color, options.glowScale ?? 1);
            const glowPolys = applyGlowToPoly(line, glow);
            glowPolys.forEach((poly) => {
                poly.setIncludeInLayoutBounds(false);
                if (alphaScale < 1) {
                    poly.setGlobalAlpha(alphaScale);
                }
                lineObjects.push(poly);
            });
        });

        renderObjects.push(...fillObjects, ...lineObjects);

        if (baselineWidth > 0 && !options.skipBaseline) {
            if (resolvedChannelMode === 'split') {
                for (let index = 0; index < channelTotal; index += 1) {
                    const baselineY = computeBaseline(index);
                    const baseline = new Line(0, baselineY, width, baselineY, baselineColor, baselineWidth, {
                        includeInLayoutBounds: false,
                    });
                    renderObjects.push(baseline);
                }
            } else {
                const baseline = new Line(0, height / 2, width, height / 2, baselineColor, baselineWidth, {
                    includeInLayoutBounds: false,
                });
                renderObjects.push(baseline);
            }
        }

        return renderObjects;
    }

    private buildPersistenceTraces(
        trackId: string | null,
        descriptors: AudioFeatureDescriptor[],
        windowSeconds: number,
        offsetSeconds: number,
        targetTime: number,
        durationSeconds: number,
        baseColor: string,
        zeroCross: { mode: TriggerMode; threshold: number; direction: TriggerDirection },
        tm: ReturnType<typeof getSharedTimingManager>,
        context: ReturnType<typeof resolveFeatureContext> | null,
    ): TraceResult[] {
        if (!trackId || !descriptors.length || durationSeconds <= 0) {
            return [];
        }
        const primaryDescriptor = descriptors[0];
        if (!primaryDescriptor) {
            return [];
        }
        const windowCount = Math.min(
            MAX_PERSISTENCE_WINDOWS,
            Math.max(0, Math.floor(durationSeconds / Math.max(windowSeconds, 0.001))),
        );
        if (windowCount <= 0) {
            return [];
        }
        const historyFrames = sampleFeatureHistory(trackId, primaryDescriptor, targetTime, windowCount + 1);
        if (!historyFrames.length) {
            return [];
        }
        const frames = historyFrames
            .filter((frame) => frame.timeSeconds < targetTime - 1e-6)
            .slice(-windowCount);
        const traces: TraceResult[] = [];
        frames.forEach((frame) => {
            const metrics = this.resolveWindowMetrics(tm, frame.timeSeconds, offsetSeconds, windowSeconds);
            const trace = this.buildTrace(trackId, descriptors, metrics, baseColor, zeroCross, tm, context);
            if (trace) {
                traces.push(trace);
            }
        });
        return traces;
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Oscilloscope',
            description: 'Draws waveform samples from audio features over time.',
            category: 'audio',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'oscilloscopeBasics',
                    label: 'Oscilloscope',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Bind to a waveform feature and adjust the viewport.',
                    properties: [
                        {
                            key: 'featureTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'features',
                            type: 'audioFeatureDescriptor',
                            label: 'Audio Features',
                            default: [],
                            requiredFeatureKey: 'waveform',
                            autoFeatureLabel: 'Waveform',
                            trackPropertyKey: 'featureTrackId',
                            profilePropertyKey: 'analysisProfileId',
                            glossaryTerms: {
                                featureDescriptor: 'feature-descriptor',
                                analysisProfile: 'analysis-profile',
                            },
                        },
                        {
                            key: 'analysisProfileId',
                            type: 'audioAnalysisProfile',
                            label: 'Analysis Profile',
                            default: 'default',
                            trackPropertyKey: 'featureTrackId',
                            glossaryTerms: {
                                analysisProfile: 'analysis-profile',
                            },
                        },
                        {
                            key: 'windowSeconds',
                            type: 'number',
                            label: 'Window Length (s)',
                            default: 0.5,
                            min: 0.05,
                            max: 5,
                            step: 0.05,
                        },
                        {
                            key: 'offset',
                            type: 'number',
                            label: 'Time Offset (ms)',
                            default: 0,
                            step: 1,
                            min: -5000,
                            max: 5000,
                        },
                        {
                            key: 'channelMode',
                            type: 'select',
                            label: 'Channel Mode',
                            default: 'mono',
                            options: [
                                { label: 'Mono', value: 'mono' },
                                { label: 'Stereo Overlay', value: 'stereoOverlay' },
                                { label: 'Split Channels', value: 'split' },
                                { label: 'Lissajous', value: 'lissajous' },
                            ],
                        },
                        {
                            key: 'triggerMode',
                            type: 'select',
                            label: 'Trigger Mode',
                            default: 'free',
                            options: [
                                { label: 'Free Run', value: 'free' },
                                { label: 'Zero Crossing', value: 'zeroCross' },
                            ],
                        },
                        {
                            key: 'triggerThreshold',
                            type: 'number',
                            label: 'Trigger Threshold',
                            default: 0.05,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            visibleWhen: [{ key: 'triggerMode', equals: 'zeroCross' }],
                        },
                        {
                            key: 'triggerDirection',
                            type: 'select',
                            label: 'Trigger Direction',
                            default: 'rising',
                            options: [
                                { label: 'Rising Edge', value: 'rising' },
                                { label: 'Falling Edge', value: 'falling' },
                            ],
                            visibleWhen: [{ key: 'triggerMode', equals: 'zeroCross' }],
                        },
                        {
                            key: 'persistenceDuration',
                            type: 'number',
                            label: 'Persistence Duration (s)',
                            default: 0,
                            min: 0,
                            max: 4,
                            step: 0.1,
                        },
                        {
                            key: 'persistenceOpacity',
                            type: 'number',
                            label: 'Persistence Opacity',
                            default: 0.35,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'persistenceDuration', truthy: true }],
                        },
                        {
                            key: 'showPlayhead',
                            type: 'boolean',
                            label: 'Show Playhead',
                            default: false,
                        },
                        {
                            key: 'fillMode',
                            type: 'select',
                            label: 'Fill Mode',
                            default: 'none',
                            options: [
                                { label: 'None', value: 'none' },
                                { label: 'Under Curve', value: 'under' },
                            ],
                        },
                        {
                            key: 'fillOpacity',
                            type: 'number',
                            label: 'Fill Opacity',
                            default: 0.2,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'fillMode', equals: 'under' }],
                        },
                        {
                            key: 'baselineWidth',
                            type: 'number',
                            label: 'Baseline Width (px)',
                            default: 0,
                            min: 0,
                            max: 6,
                            step: 0.5,
                        },
                        {
                            key: 'baselineColor',
                            type: 'color',
                            label: 'Baseline Color',
                            default: '#1e293b',
                            visibleWhen: [{ key: 'baselineWidth', truthy: true }],
                        },
                        { key: 'lineColor', type: 'color', label: 'Waveform Color', default: '#22d3ee' },
                        {
                            key: 'lineWidth',
                            type: 'number',
                            label: 'Line Width (px)',
                            default: 2,
                            min: 1,
                            max: 10,
                            step: 0.5,
                        },
                        {
                            key: 'glowOpacity',
                            type: 'number',
                            label: 'Glow Opacity',
                            default: 0,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                        {
                            key: 'glowBlur',
                            type: 'number',
                            label: 'Glow Blur (px)',
                            default: 16,
                            min: 0,
                            max: 64,
                            step: 1,
                            visibleWhen: [{ key: 'glowOpacity', truthy: true }],
                        },
                        {
                            key: 'glowLayers',
                            type: 'number',
                            label: 'Glow Layers',
                            default: 2,
                            min: 0,
                            max: 6,
                            step: 1,
                            visibleWhen: [{ key: 'glowOpacity', truthy: true }],
                        },
                        {
                            key: 'glowSpread',
                            type: 'number',
                            label: 'Glow Spread',
                            default: 4,
                            min: 0,
                            max: 40,
                            step: 1,
                            visibleWhen: [{ key: 'glowOpacity', truthy: true }],
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Viewport Width (px)',
                            default: 320,
                            min: 40,
                            max: 1600,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Viewport Height (px)',
                            default: 160,
                            min: 20,
                            max: 600,
                            step: 1,
                        },
                    ],
                    presets: [
                        {
                            id: 'studioScope',
                            label: 'Studio Scope',
                            values: { windowSeconds: 0.5, width: 480, height: 180, lineWidth: 2, lineColor: '#22d3ee' },
                        },
                        {
                            id: 'wideAnalyzer',
                            label: 'Wide Analyzer',
                            values: { windowSeconds: 1.2, width: 720, height: 200, lineWidth: 1.5, lineColor: '#f59e0b' },
                        },
                        {
                            id: 'microWave',
                            label: 'Micro Window',
                            values: { windowSeconds: 0.2, width: 320, height: 120, lineWidth: 3, lineColor: '#a855f7' },
                        },
                    ],
                },
                {
                    id: 'oscilloscopeDebug',
                    label: 'Debug Overlay',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Toggle helper metrics that make it easier to debug waveform alignment.',
                    properties: [
                        {
                            key: 'showDebugTime',
                            type: 'boolean',
                            label: 'Show Target Time & Tick',
                            default: false,
                        },
                        {
                            key: 'showDebugSample',
                            type: 'boolean',
                            label: 'Show Current Frame Sample',
                            default: false,
                        },
                        {
                            key: 'showDebugWindow',
                            type: 'boolean',
                            label: 'Show Window Range',
                            default: false,
                        },
                        {
                            key: 'showDebugSource',
                            type: 'boolean',
                            label: 'Show Source Details',
                            default: false,
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(_config: any, targetTime: number): RenderObject[] {
        const width = Math.max(40, this.getProperty<number>('width') ?? 320);
        const height = Math.max(20, this.getProperty<number>('height') ?? 160);
        const layoutRect = new Rectangle(0, 0, width, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);

        const trackBinding = this.getBinding('featureTrackId');
        const trackValue = this.getProperty<string | string[] | null>('featureTrackId');
        const descriptorsValue = this.getProperty<AudioFeatureDescriptor[] | null>('features');
        const descriptors = coerceFeatureDescriptors(
            descriptorsValue,
            AudioOscilloscopeElement.DEFAULT_DESCRIPTOR,
        );
        const descriptor = descriptors[0] ?? AudioOscilloscopeElement.DEFAULT_DESCRIPTOR;
        const trackId = resolveTimelineTrackRefValue(trackBinding, trackValue);
        const analysisProfileId = this.getProperty<string>('analysisProfileId') ?? null;

        emitAnalysisIntent(this, trackId, analysisProfileId, descriptors);
        const featureKey = descriptor.featureKey;

        const tm = getSharedTimingManager();
        const windowSeconds = Math.max(0.05, this.getProperty<number>('windowSeconds') ?? 0.5);
        const offsetMs = this.getProperty<number>('offset') ?? 0;
        const offsetSeconds = offsetMs / 1000;
        const windowMetrics = this.resolveWindowMetrics(tm, targetTime, offsetSeconds, windowSeconds);
        const context = resolveFeatureContext(trackId ?? null, featureKey ?? null);

        const baseColor = this.getProperty<string>('lineColor') ?? '#22d3ee';
        const zeroCrossMode = (this.getProperty<string>('triggerMode') ?? 'free') as TriggerMode;
        const zeroCross: { mode: TriggerMode; threshold: number; direction: TriggerDirection } = {
            mode: zeroCrossMode,
            threshold: clamp(this.getProperty<number>('triggerThreshold') ?? 0.05, 0, 1),
            direction: (this.getProperty<string>('triggerDirection') ?? 'rising') as TriggerDirection,
        };

        const trace = this.buildTrace(trackId, descriptors, windowMetrics, baseColor, zeroCross, tm, context);
        if (!trace) {
            return [layoutRect];
        }

        let channelMode = (this.getProperty<string>('channelMode') ?? 'mono') as ChannelMode;
        if (channelMode === 'lissajous' && trace.series.length < 2) {
            channelMode = trace.series.length > 1 ? 'stereoOverlay' : 'mono';
        }

        const requestedFillMode = (this.getProperty<string>('fillMode') ?? 'none') as FillMode;
        const fillMode: FillMode = channelMode === 'lissajous' ? 'none' : requestedFillMode;
        const fillOpacity = clamp(this.getProperty<number>('fillOpacity') ?? 0.2, 0, 1);
        const lineWidth = Math.max(0.5, this.getProperty<number>('lineWidth') ?? 2);
        const baselineWidth = channelMode === 'lissajous' ? 0 : Math.max(0, this.getProperty<number>('baselineWidth') ?? 0);
        const baselineColor = this.getProperty<string>('baselineColor') ?? '#1e293b';
        const persistenceDuration = Math.max(0, this.getProperty<number>('persistenceDuration') ?? 0);
        const persistenceOpacity = clamp(this.getProperty<number>('persistenceOpacity') ?? 0.35, 0, 1);

        const renderObjects: RenderObject[] = [layoutRect];

        if (persistenceDuration > 0 && persistenceOpacity > 0) {
            const persistenceTraces = this.buildPersistenceTraces(
                trackId,
                descriptors,
                windowSeconds,
                offsetSeconds,
                targetTime,
                persistenceDuration,
                baseColor,
                zeroCross,
                tm,
                context,
            );
            if (persistenceTraces.length) {
                const count = persistenceTraces.length;
                persistenceTraces.forEach((historyTrace, index) => {
                    const ageRatio = (index + 1) / (count + 1);
                    const alpha = persistenceOpacity * (1 - ageRatio * 0.7);
                    if (alpha <= 0) {
                        return;
                    }
                    const objects = this.buildTraceObjects(
                        historyTrace,
                        width,
                        height,
                        channelMode,
                        'none',
                        fillOpacity,
                        lineWidth,
                        0,
                        baselineColor,
                        baseColor,
                        { alphaScale: alpha, skipFill: true, skipBaseline: true, glowScale: alpha },
                    );
                    renderObjects.push(...objects);
                });
            }
        }

        const baseObjects = this.buildTraceObjects(
            trace,
            width,
            height,
            channelMode,
            fillMode,
            fillOpacity,
            lineWidth,
            baselineWidth,
            baselineColor,
            baseColor,
            { glowScale: 1 },
        );
        renderObjects.push(...baseObjects);

        if (this.getProperty<boolean>('showPlayhead')) {
            const windowDuration = windowMetrics.windowEndSeconds - windowMetrics.windowStartSeconds;
            if (windowDuration > 0) {
                const relativePlayheadSeconds = targetTime - windowMetrics.windowStartSeconds;
                const playheadPosition = relativePlayheadSeconds / windowDuration;
                if (playheadPosition >= 0 && playheadPosition <= 1) {
                    const playheadX = clamp(playheadPosition, 0, 1) * width;
                    const playhead = new Poly(
                        [
                            { x: playheadX, y: 0 },
                            { x: playheadX, y: height },
                        ],
                        null,
                        '#f8fafc',
                        Math.max(1, Math.floor(lineWidth / 2)),
                        { includeInLayoutBounds: false },
                    );
                    playhead.setClosed(false);
                    playhead.setIncludeInLayoutBounds(false);
                    renderObjects.push(playhead);
                }
            }
        }

        const showDebugTime = this.getProperty<boolean>('showDebugTime');
        const showDebugSample = this.getProperty<boolean>('showDebugSample');
        const showDebugWindow = this.getProperty<boolean>('showDebugWindow');
        const showDebugSource = this.getProperty<boolean>('showDebugSource');

        if (showDebugTime || showDebugSample || showDebugWindow || showDebugSource) {
            const debugLines: string[] = [];
            if (showDebugTime) {
                debugLines.push(`Target: ${targetTime.toFixed(3)}s (${windowMetrics.targetTick} ticks)`);
            }

            let nearestFrameIndex: number | null = null;
            if (showDebugSample || showDebugWindow || showDebugSource) {
                let nearestDistance = Number.POSITIVE_INFINITY;
                for (let frame = 0; frame < trace.frameTicks.length; frame += 1) {
                    const frameTick = trace.frameTicks[frame] ?? trace.windowStartTick;
                    const distance = Math.abs(frameTick - windowMetrics.targetTick);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestFrameIndex = frame;
                    }
                }
            }

            if (showDebugSample && nearestFrameIndex != null) {
                const frameTick = trace.frameTicks[nearestFrameIndex] ?? trace.windowStartTick;
                const frameSeconds =
                    trace.frameSeconds?.[nearestFrameIndex] ?? tm.ticksToSeconds(frameTick);
                debugLines.push(`Frame: ${nearestFrameIndex} · center ${frameSeconds.toFixed(3)}s`);
                const primarySeries = trace.series[0];
                if (primarySeries) {
                    if (primarySeries.minValues && primarySeries.maxValues) {
                        const min = primarySeries.minValues[nearestFrameIndex] ?? 0;
                        const max = primarySeries.maxValues[nearestFrameIndex] ?? min;
                        debugLines.push(`Sample min/max: ${min.toFixed(3)} / ${max.toFixed(3)}`);
                    } else {
                        const value = primarySeries.values[nearestFrameIndex] ?? 0;
                        debugLines.push(`Sample: ${value.toFixed(3)}`);
                    }
                }
            }

            if (showDebugWindow) {
                debugLines.push(
                    `Window: ${trace.windowStartSeconds.toFixed(3)}s → ${trace.windowEndSeconds.toFixed(3)}s`,
                );
                const spanTicks = Math.max(1, Math.round(trace.windowEndTick - trace.windowStartTick));
                debugLines.push(
                    `Ticks: ${Math.round(trace.windowStartTick)} → ${Math.round(trace.windowEndTick)} (${spanTicks})`,
                );
                debugLines.push(
                    `Track bounds: ${Math.round(trace.trackStartTick)} → ${Math.round(trace.trackEndTick)}`,
                );
                if (nearestFrameIndex != null) {
                    const frameTick = trace.frameTicks[nearestFrameIndex] ?? trace.windowStartTick;
                    const frameEndTick = frameTick + trace.hopTicks;
                    debugLines.push(
                        `Frame ticks: ${Math.floor(frameTick)} → ${Math.floor(frameEndTick)}`,
                    );
                }
            }

            if (showDebugSource) {
                const hopSecondsCandidates: Array<number | undefined> = [];
                if (context?.featureTrack?.hopSeconds != null) {
                    hopSecondsCandidates.push(context.featureTrack.hopSeconds);
                }
                if (context?.cache?.hopSeconds != null) {
                    hopSecondsCandidates.push(context.cache.hopSeconds);
                }
                const hopSeconds = hopSecondsCandidates.find((value) => typeof value === 'number');
                const sampleRate = context?.cache?.analysisParams?.sampleRate;
                debugLines.push(`Track: ${trackId ?? '(unbound)'}`);
                debugLines.push(`Feature: ${featureKey ?? '(none)'}`);
                debugLines.push(
                    `Hop: ${trace.hopTicks} ticks${
                        typeof hopSeconds === 'number' ? ` (${hopSeconds.toFixed(4)}s)` : ''
                    }`,
                );
                if (nearestFrameIndex != null && context?.featureTrack) {
                    debugLines.push(
                        `Frame index: ${nearestFrameIndex} / ${context.featureTrack.frameCount - 1}`,
                    );
                }
                if (typeof sampleRate === 'number' && Number.isFinite(sampleRate)) {
                    debugLines.push(`Sample rate: ${sampleRate} Hz`);
                }
                debugLines.push(`Source: ${trace.sourceId}`);
            }

            if (debugLines.length) {
                const padding = 8;
                const lineHeight = 14;
                const approxCharWidth = 6.5;
                const maxChars = debugLines.reduce((max, line) => Math.max(max, line.length), 0);
                const availableWidth = Math.max(padding * 2, width - padding * 2);
                const overlayWidth = Math.min(
                    availableWidth,
                    Math.max(160, Math.round(maxChars * approxCharWidth) + padding * 2),
                );
                const overlayHeight = debugLines.length * lineHeight + padding * 2;
                const background = new Rectangle(
                    padding,
                    padding,
                    overlayWidth,
                    overlayHeight,
                    'rgba(15,23,42,0.75)',
                    'rgba(30,41,59,0.85)',
                    1,
                    { includeInLayoutBounds: false },
                );
                background.setIncludeInLayoutBounds(false);
                const overlayObjects: RenderObject[] = [background];
                for (let index = 0; index < debugLines.length; index += 1) {
                    const text = new Text(
                        padding * 2,
                        padding + index * lineHeight + 2,
                        debugLines[index],
                        "12px 'JetBrains Mono', 'Fira Code', monospace",
                        '#f8fafc',
                        'left',
                        'top',
                        { includeInLayoutBounds: false },
                    );
                    text.setIncludeInLayoutBounds(false);
                    overlayObjects.push(text);
                }
                renderObjects.push(...overlayObjects);
            }
        }

        return renderObjects;
    }
}

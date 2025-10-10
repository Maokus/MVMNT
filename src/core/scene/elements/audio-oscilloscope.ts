import { SceneElement } from './base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import {
    coerceFeatureDescriptors,
    resolveFeatureContext,
    resolveTimelineTrackRefValue,
} from './audioFeatureUtils';

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
                            key: 'showPlayhead',
                            type: 'boolean',
                            label: 'Show Playhead',
                            default: false,
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
        const featureKey = descriptor.featureKey;

        const tm = getSharedTimingManager();
        const windowSeconds = Math.max(0.05, this.getProperty<number>('windowSeconds') ?? 0.5);
        const offsetMs = this.getProperty<number>('offset') ?? 0;
        const offsetSeconds = offsetMs / 1000;
        const windowMetrics = this.resolveWindowMetrics(tm, targetTime, offsetSeconds, windowSeconds);
        const { windowStartSeconds, windowEndSeconds, targetTick, startTick, endTick } = windowMetrics;

        const state = useTimelineStore.getState();
        const range =
            trackId && featureKey
                ? sampleAudioFeatureRange(state, trackId, featureKey, startTick, endTick, {
                      bandIndex: descriptor.bandIndex ?? undefined,
                      channelIndex: descriptor.channelIndex ?? undefined,
                  })
                : undefined;
        if (!range || range.frameCount <= 0) {
            return [layoutRect];
        }

        const spanTicks = Math.max(1, range.windowEndTick - range.windowStartTick);
        const channels = Math.max(1, range.channels);
        const points: Array<{ x: number; y: number }> = [];
        for (let frame = 0; frame < range.frameCount; frame += 1) {
            const frameTick = range.frameTicks[frame] ?? range.windowStartTick;
            const ratio = Math.max(0, Math.min(1, (frameTick - range.windowStartTick) / spanTicks));
            const x = ratio * width;
            const baseIndex = frame * channels;
            let value = 0;
            if (range.format === 'waveform-minmax' && channels >= 2) {
                const min = range.data[baseIndex] ?? 0;
                const max = range.data[baseIndex + 1] ?? min;
                value = (min + max) / 2;
            } else {
                value = range.data[baseIndex] ?? 0;
            }
            const clamped = Math.max(-1, Math.min(1, value));
            const y = height / 2 - clamped * (height / 2);
            points.push({ x, y });
        }

        if (points.length < 2) {
            return [layoutRect];
        }

        const line = new Poly(
            points,
            null,
            this.getProperty<string>('lineColor') ?? '#22d3ee',
            this.getProperty<number>('lineWidth') ?? 2,
        );
        line.setClosed(false);
        line.setIncludeInLayoutBounds(false);

        const renderObjects: RenderObject[] = [layoutRect, line];

        if (this.getProperty<boolean>('showPlayhead')) {
            const windowDuration = windowEndSeconds - windowStartSeconds;
            if (windowDuration > 0) {
                const relativePlayheadSeconds = targetTime - windowStartSeconds;
                const playheadPosition = relativePlayheadSeconds / windowDuration;
                if (playheadPosition >= 0 && playheadPosition <= 1) {
                    const playheadX = playheadPosition * width;
                    const playhead = new Poly(
                        [
                            { x: playheadX, y: 0 },
                            { x: playheadX, y: height },
                        ],
                        null,
                        '#f8fafc',
                        Math.max(1, Math.floor((this.getProperty<number>('lineWidth') ?? 2) / 2)),
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
                debugLines.push(`Target: ${targetTime.toFixed(3)}s (${targetTick} ticks)`);
            }

            let nearestFrameIndex: number | null = null;
            if (showDebugSample || showDebugWindow || showDebugSource) {
                let nearestDistance = Number.POSITIVE_INFINITY;
                for (let frame = 0; frame < range.frameCount; frame += 1) {
                    const distance = Math.abs((range.frameTicks[frame] ?? 0) - targetTick);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestFrameIndex = frame;
                    }
                }
            }

            if (showDebugSample && nearestFrameIndex != null) {
                const frameTick = range.frameTicks[nearestFrameIndex] ?? 0;
                const frameSeconds = range.frameSeconds?.[nearestFrameIndex] ?? tm.ticksToSeconds(frameTick);
                debugLines.push(`Frame: ${nearestFrameIndex} · center ${frameSeconds.toFixed(3)}s`);
                const baseIndex = nearestFrameIndex * channels;
                if (range.format === 'waveform-minmax' && channels >= 2) {
                    const min = range.data[baseIndex] ?? 0;
                    const max = range.data[baseIndex + 1] ?? min;
                    debugLines.push(`Sample min/max: ${min.toFixed(3)} / ${max.toFixed(3)}`);
                } else {
                    const values: number[] = [];
                    for (let channel = 0; channel < channels; channel += 1) {
                        values.push(range.data[baseIndex + channel] ?? 0);
                    }
                    if (values.length === 1) {
                        debugLines.push(`Sample: ${values[0]?.toFixed(3) ?? '0.000'}`);
                    } else {
                        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
                        debugLines.push(`Sample avg: ${average.toFixed(3)}`);
                    }
                }
            }

            if (showDebugWindow) {
                debugLines.push(
                    `Window: ${windowStartSeconds.toFixed(3)}s → ${windowEndSeconds.toFixed(3)}s`,
                );
                debugLines.push(
                    `Ticks: ${range.windowStartTick} → ${range.windowEndTick} (${spanTicks})`,
                );
                debugLines.push(
                    `Track bounds: ${range.trackStartTick} → ${range.trackEndTick}`,
                );
                if (nearestFrameIndex != null) {
                    const frameTick = range.frameTicks[nearestFrameIndex] ?? 0;
                    const frameEndTick = frameTick + range.hopTicks;
                    debugLines.push(
                        `Frame ticks: ${Math.floor(frameTick)} → ${Math.floor(frameEndTick)}`,
                    );
                }
            }

            if (showDebugSource) {
                const cacheEntry = state.audioFeatureCaches[range.sourceId];
                const context = resolveFeatureContext(trackId ?? null, featureKey ?? null);
                const featureTrack = context?.featureTrack ?? cacheEntry?.featureTracks?.[featureKey ?? ''];
                const hopSeconds = featureTrack?.hopSeconds ?? cacheEntry?.hopSeconds;
                const sampleRate = cacheEntry?.analysisParams?.sampleRate;
                debugLines.push(`Track: ${trackId ?? '(unbound)'}`);
                debugLines.push(`Feature: ${featureKey ?? '(none)'}`);
                debugLines.push(
                    `Hop: ${range.hopTicks} ticks${
                        hopSeconds ? ` (${hopSeconds.toFixed(4)}s)` : ''
                    }`,
                );
                if (nearestFrameIndex != null && featureTrack) {
                    debugLines.push(
                        `Frame index: ${nearestFrameIndex} / ${featureTrack.frameCount - 1}`,
                    );
                }
                if (typeof sampleRate === 'number' && Number.isFinite(sampleRate)) {
                    debugLines.push(`Sample rate: ${sampleRate} Hz`);
                }
                debugLines.push(`Source: ${range.sourceId}`);
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

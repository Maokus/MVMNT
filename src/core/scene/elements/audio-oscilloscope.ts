import { SceneElement } from './base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioTrack } from '@audio/audioTypes';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import { AudioFeatureBinding } from '@bindings/property-bindings';

export class AudioOscilloscopeElement extends SceneElement {
    constructor(id: string = 'audioOscilloscope', config: Record<string, unknown> = {}) {
        super('audioOscilloscope', id, config);
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
                            key: 'featureBinding',
                            type: 'audioFeature',
                            label: 'Audio Feature',
                            default: null,
                            requiredFeatureKey: 'waveform',
                            autoFeatureLabel: 'Waveform',
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
        const binding = this.getBinding('featureBinding');
        const width = Math.max(40, this.getProperty<number>('width') ?? 320);
        const height = Math.max(20, this.getProperty<number>('height') ?? 160);
        const layoutRect = new Rectangle(0, 0, width, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        if (!(binding instanceof AudioFeatureBinding)) {
            return [layoutRect];
        }
        const config = binding.getConfig();
        if (!config.trackId || !config.featureKey) {
            return [layoutRect];
        }
        const windowSeconds = Math.max(0.05, this.getProperty<number>('windowSeconds') ?? 0.5);
        const offsetMs = this.getProperty<number>('offset') ?? 0;
        const offsetSeconds = offsetMs / 1000;
        const tm = getSharedTimingManager();
        const halfWindow = windowSeconds / 2;
        const windowStartSeconds = targetTime + offsetSeconds - halfWindow;
        const windowEndSeconds = targetTime + offsetSeconds + halfWindow;
        const targetTick = Math.round(tm.secondsToTicks(targetTime));
        const startTick = Math.round(tm.secondsToTicks(windowStartSeconds));
        const endTick = Math.round(tm.secondsToTicks(windowEndSeconds));
        const windowStartTick = Math.min(startTick, endTick);
        const windowEndTick = Math.max(startTick, endTick);
        const windowTickSpan = windowEndTick - windowStartTick;
        if (windowTickSpan <= 0) {
            return [layoutRect];
        }
        const state = useTimelineStore.getState();
        const track = state.tracks[config.trackId] as AudioTrack | undefined;
        if (!track || track.type !== 'audio') {
            return [layoutRect];
        }
        const sourceId = track.audioSourceId ?? config.trackId;
        const featureCache = state.audioFeatureCaches[sourceId];
        const featureTrack = featureCache?.featureTracks?.[config.featureKey];
        if (!featureTrack || featureTrack.frameCount <= 0) {
            return [layoutRect];
        }
        const hopTicks = Math.max(1, featureTrack.hopTicks || featureCache?.hopTicks || 1);
        const regionStart = track.regionStartTick ?? 0;
        const regionEnd = (() => {
            if (typeof track.regionEndTick === 'number' && Number.isFinite(track.regionEndTick)) {
                return track.regionEndTick;
            }
            const cacheEntry = state.audioCache[sourceId];
            if (cacheEntry) {
                return cacheEntry.durationTicks;
            }
            return regionStart + featureTrack.frameCount * hopTicks;
        })();
        const regionLength = Math.max(0, regionEnd - regionStart);
        const trackStartTick = track.offsetTicks;
        const trackEndTick = trackStartTick + regionLength;
        const localWindowStart = windowStartTick - track.offsetTicks + regionStart;
        const localWindowEnd = windowEndTick - track.offsetTicks + regionStart;
        const requestedFrameStart = Math.floor(Math.min(localWindowStart, localWindowEnd) / hopTicks);
        const requestedFrameEnd = Math.floor(Math.max(localWindowStart, localWindowEnd) / hopTicks);
        const rangeStartFrame = Math.max(0, requestedFrameStart);
        const rangeEndFrame = Math.min(featureTrack.frameCount - 1, requestedFrameEnd);
        const range = sampleAudioFeatureRange(state, config.trackId, config.featureKey, startTick, endTick, {
            bandIndex: config.bandIndex ?? undefined,
            channelIndex: config.channelIndex ?? undefined,
        });
        const channels = range?.channels ?? featureTrack.channels ?? 1;
        const points: Array<{ x: number; y: number }> = [];
        const dataFrameCount = range?.frameCount ?? 0;
        const availableRangeEndFrame = range ? rangeStartFrame + dataFrameCount - 1 : rangeEndFrame;
        const halfHop = hopTicks / 2;
        const centerStart = Math.floor((Math.min(localWindowStart, localWindowEnd) - halfHop) / hopTicks);
        const centerEnd = Math.floor((Math.max(localWindowStart, localWindowEnd) + halfHop) / hopTicks);
        for (let frameIndex = centerStart; frameIndex <= centerEnd; frameIndex += 1) {
            const localFrameCenterTick = frameIndex * hopTicks + halfHop;
            const frameTick = localFrameCenterTick + track.offsetTicks - regionStart;
            const withinTrack = frameTick >= trackStartTick && frameTick < trackEndTick;
            let value = 0;
            if (withinTrack && range && dataFrameCount > 0) {
                if (frameIndex >= rangeStartFrame && frameIndex <= availableRangeEndFrame) {
                    const dataIndex = frameIndex - rangeStartFrame;
                    if (dataIndex >= 0 && dataIndex < dataFrameCount) {
                        if (range.format === 'waveform-minmax' && channels >= 2) {
                            const min = range.data[dataIndex * channels] ?? 0;
                            const max = range.data[dataIndex * channels + 1] ?? min;
                            value = (min + max) / 2;
                        } else {
                            value = range.data[dataIndex * channels] ?? 0;
                        }
                    }
                }
            }
            const normalized = Math.max(-1, Math.min(1, value));
            const positionRatio = (frameTick - windowStartTick) / windowTickSpan;
            const x = Math.max(0, Math.min(width, positionRatio * width));
            const y = height / 2 - normalized * (height / 2);
            points.push({ x, y });
        }
        if (points.length < 2) {
            return [layoutRect];
        }
        const line = new Poly(
            points,
            null,
            this.getProperty<string>('lineColor') ?? '#22d3ee',
            this.getProperty<number>('lineWidth') ?? 2
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
                        Math.max(1, Math.floor((this.getProperty<number>('lineWidth') ?? 2) / 2))
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
                const targetSeconds = tm.ticksToSeconds(targetTick);
                debugLines.push(
                    `Target: ${targetSeconds.toFixed(3)}s (${targetTick} ticks)`
                );
            }

            let frameIndexForTarget: number | null = null;
            if (showDebugSample || showDebugWindow || showDebugSource) {
                const relativeFramePosition = (targetTick - track.offsetTicks + regionStart) / hopTicks;
                const clampedFrameIndex = Math.max(
                    0,
                    Math.min(featureTrack.frameCount - 1, Math.floor(relativeFramePosition))
                );
                frameIndexForTarget = clampedFrameIndex;
                const frameFraction = relativeFramePosition - Math.floor(relativeFramePosition);
                const localFrameStartTick = clampedFrameIndex * hopTicks;
                const frameStartTick = localFrameStartTick + track.offsetTicks - regionStart;
                const frameEndTick = frameStartTick + hopTicks;
                const frameCenterTick = localFrameStartTick + halfHop + track.offsetTicks - regionStart;
                const frameStartSeconds = tm.ticksToSeconds(frameStartTick);
                const frameEndSeconds = tm.ticksToSeconds(frameEndTick);
                const frameCenterSeconds = tm.ticksToSeconds(frameCenterTick);
                if (showDebugSample) {
                    let sampleLine = `Frame: ${clampedFrameIndex}`;
                    sampleLine += ` (fraction ${frameFraction.toFixed(3)})`;
                    sampleLine += ` · center ${frameCenterSeconds.toFixed(3)}s`;
                    debugLines.push(sampleLine);

                    if (range && dataFrameCount > 0) {
                        const dataIndex = clampedFrameIndex - rangeStartFrame;
                        if (dataIndex >= 0 && dataIndex < dataFrameCount) {
                            if (range.format === 'waveform-minmax' && channels >= 2) {
                                const min = range.data[dataIndex * channels] ?? 0;
                                const max = range.data[dataIndex * channels + 1] ?? min;
                                debugLines.push(
                                    `Sample min/max: ${min.toFixed(3)} / ${max.toFixed(3)}`
                                );
                            } else {
                                let sum = 0;
                                let count = 0;
                                for (let channel = 0; channel < channels; channel += 1) {
                                    const value = range.data[dataIndex * channels + channel];
                                    if (Number.isFinite(value)) {
                                        sum += value;
                                        count += 1;
                                    }
                                }
                                if (count > 0) {
                                    const average = sum / count;
                                    debugLines.push(`Sample avg: ${average.toFixed(3)}`);
                                }
                            }
                        } else {
                            debugLines.push('Sample: (value out of loaded range)');
                        }
                    } else {
                        debugLines.push('Sample: (range unavailable)');
                    }
                }

                if (showDebugWindow) {
                    debugLines.push(
                        `Window: ${windowStartSeconds.toFixed(3)}s → ${windowEndSeconds.toFixed(3)}s`
                    );
                    debugLines.push(`Ticks: ${windowStartTick} → ${windowEndTick} (${windowTickSpan})`);
                    debugLines.push(
                        `Frames: ${rangeStartFrame} → ${rangeEndFrame} (loaded ${dataFrameCount})`
                    );
                    debugLines.push(
                        `Frame bounds: ${frameStartSeconds.toFixed(3)}s → ${frameEndSeconds.toFixed(3)}s`
                    );
                }
            }

            if (showDebugSource) {
                const hopSeconds = featureTrack.hopSeconds ?? featureCache?.hopSeconds;
                const sampleRate = featureCache?.analysisParams?.sampleRate;
                debugLines.push(`Track: ${config.trackId ?? '(unbound)'}`);
                debugLines.push(`Feature: ${config.featureKey ?? '(none)'}`);
                debugLines.push(
                    `Hop: ${hopTicks} ticks${
                        hopSeconds ? ` (${hopSeconds.toFixed(4)}s)` : ''
                    }`
                );
                if (frameIndexForTarget != null) {
                    debugLines.push(
                        `Frame index: ${frameIndexForTarget} / ${featureTrack.frameCount - 1}`
                    );
                }
                if (typeof sampleRate === 'number' && Number.isFinite(sampleRate)) {
                    debugLines.push(`Sample rate: ${sampleRate} Hz`);
                }
                debugLines.push(`Source: ${sourceId}`);
            }

            if (debugLines.length) {
                const padding = 8;
                const lineHeight = 14;
                const approxCharWidth = 6.5;
                const maxChars = debugLines.reduce((max, line) => Math.max(max, line.length), 0);
                const availableWidth = Math.max(padding * 2, width - padding * 2);
                const overlayWidth = Math.min(
                    availableWidth,
                    Math.max(160, Math.round(maxChars * approxCharWidth) + padding * 2)
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
                    { includeInLayoutBounds: false }
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
                        { includeInLayoutBounds: false }
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

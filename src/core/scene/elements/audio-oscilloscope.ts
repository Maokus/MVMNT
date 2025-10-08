import { SceneElement } from './base';
import { Poly, Rectangle, type RenderObject } from '@core/render/render-objects';
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
        const startTick = Math.round(tm.secondsToTicks(windowStartSeconds));
        const endTick = Math.round(tm.secondsToTicks(windowEndSeconds));
        const windowStartTick = Math.min(startTick, endTick);
        const windowEndTick = Math.max(startTick, endTick);
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
        const expectedFrameCount = Math.max(1, Math.floor(Math.max(0, windowEndTick - windowStartTick) / hopTicks) + 1);
        const range = sampleAudioFeatureRange(state, config.trackId, config.featureKey, startTick, endTick, {
            bandIndex: config.bandIndex ?? undefined,
            channelIndex: config.channelIndex ?? undefined,
        });
        const channels = range?.channels ?? featureTrack.channels ?? 1;
        const points: Array<{ x: number; y: number }> = [];
        const dataFrameCount = range?.frameCount ?? 0;
        const availableRangeEndFrame = range ? rangeStartFrame + dataFrameCount - 1 : rangeEndFrame;
        for (let i = 0; i < expectedFrameCount; i += 1) {
            const frameTick = windowStartTick + i * hopTicks;
            const withinTrack = frameTick >= trackStartTick && frameTick < trackEndTick;
            let value = 0;
            if (withinTrack && range && dataFrameCount > 0) {
                const localTick = frameTick - track.offsetTicks + regionStart;
                const frameIndex = Math.floor(localTick / hopTicks);
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
            const denom = Math.max(1, expectedFrameCount - 1);
            const x = (i / denom) * width;
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
                const playheadPosition = (targetTime - windowStartSeconds + 0.25) / windowDuration;
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
        return renderObjects;
    }
}

import { SceneElement } from './base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import { resolveDescriptorChannel } from './audioFeatureUtils';
import { registerFeatureRequirements } from './audioElementMetadata';

const { descriptor: WAVEFORM_DESCRIPTOR } = createFeatureDescriptor({ feature: 'waveform' });

registerFeatureRequirements('audioOscilloscope', [{ feature: 'waveform' }]);

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export class AudioOscilloscopeElement extends SceneElement {
    constructor(id: string = 'audioOscilloscope', config: Record<string, unknown> = {}) {
        super('audioOscilloscope', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Oscilloscope',
            description: 'Simple waveform preview for debugging audio features.',
            category: 'audio',
            groups: [
                ...basicGroups,
                {
                    id: 'oscilloscopeBasics',
                    label: 'Oscilloscope',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'featureTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'windowSeconds',
                            type: 'number',
                            label: 'Window (seconds)',
                            default: 0.12,
                            min: 0.01,
                            max: 0.5,
                            step: 0.01,
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 420,
                            min: 40,
                            max: 1600,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 140,
                            min: 20,
                            max: 800,
                            step: 1,
                        },
                        {
                            key: 'lineColor',
                            type: 'color',
                            label: 'Line Color',
                            default: '#22d3ee',
                        },
                        {
                            key: 'lineWidth',
                            type: 'number',
                            label: 'Line Width (px)',
                            default: 2,
                            min: 1,
                            max: 6,
                            step: 0.5,
                        },
                        {
                            key: 'backgroundColor',
                            type: 'color',
                            label: 'Background',
                            default: 'rgba(15, 23, 42, 0.35)',
                        },
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 0,
                            min: 0,
                            max: 64,
                            step: 1,
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const width = this.getProperty<number>('width') ?? 420;
        const height = this.getProperty<number>('height') ?? 140;
        const windowSeconds = clamp(this.getProperty<number>('windowSeconds') ?? 0.12, 0.01, 1);
        const lineColor = this.getProperty<string>('lineColor') ?? '#22d3ee';
        const lineWidth = clamp(this.getProperty<number>('lineWidth') ?? 2, 0.5, 10);
        const backgroundColor = this.getProperty<string>('backgroundColor') ?? 'rgba(15, 23, 42, 0.35)';
        const smoothing = clamp(this.getProperty<number>('smoothing') ?? 0, 0, 64);
        const smoothingRadius = Math.max(0, Math.round(smoothing));
        const trackId = (this.getProperty<string>('featureTrackId') ?? '').trim() || null;

        const descriptor = WAVEFORM_DESCRIPTOR;

        const objects: RenderObject[] = [];
        objects.push(new Rectangle(0, 0, width, height, backgroundColor));

        if (!trackId) {
            objects.push(new Text(8, height / 2, 'Select an audio track', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        }

        const timing = getSharedTimingManager();
        const halfWindow = windowSeconds / 2;
        const startSeconds = Math.max(0, targetTime - halfWindow);
        const endSeconds = startSeconds + windowSeconds;
        const startTick = Math.floor(timing.secondsToTicks(startSeconds));
        const endTick = Math.max(startTick + 1, Math.ceil(timing.secondsToTicks(endSeconds)));

        const state = useTimelineStore.getState();
        const channelIndex = resolveDescriptorChannel(trackId, descriptor);
        const range = sampleAudioFeatureRange(state, trackId, descriptor.featureKey, startTick, endTick, {
            channelIndex: channelIndex ?? undefined,
            smoothing: smoothingRadius,
        });

        if (!range || range.frameCount < 2 || !range.data?.length) {
            objects.push(new Text(8, height / 2, 'No waveform data', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        }

        const channelCount = Math.max(1, range.channels || 1);
        const values: number[] = [];
        for (let frame = 0; frame < range.frameCount; frame += 1) {
            const baseIndex = frame * channelCount;
            if (range.format === 'waveform-minmax') {
                const min = range.data[baseIndex] ?? 0;
                const max = range.data[baseIndex + 1] ?? min;
                values.push(clamp((min + max) / 2, -1, 1));
            } else {
                values.push(clamp(range.data[baseIndex] ?? 0, -1, 1));
            }
        }

        if (values.length < 2) {
            objects.push(new Text(8, height / 2, 'Waveform too short', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        }

        const denom = Math.max(1, values.length - 1);
        const points = values.map((value, index) => ({
            x: (index / denom) * width,
            y: height / 2 - value * (height / 2),
        }));

        const line = new Poly(points, null, lineColor, lineWidth, { includeInLayoutBounds: false });
        line.setClosed(false);
        objects.push(line);

        return objects;
    }
}

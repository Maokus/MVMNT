import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { Rectangle, Text, Line, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { normalizeChannelSelectorInput, selectChannelSample } from '@audio/audioFeatureUtils';
import { applyOpacity } from '@utils/color';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function linearToDb(linear: number): number {
    if (linear <= 0) return -Infinity;
    return 20 * Math.log10(linear);
}

function dbToNormalized(db: number, minDb: number, maxDb: number): number {
    if (!Number.isFinite(db)) return 0;
    return clamp((db - minDb) / Math.max(1e-6, maxDb - minDb), 0, 1);
}

const DEFAULT_METER_COLOR = '#F472B6';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';
const DEFAULT_PEAK_HOLD_COLOR = '#FFFFFF';
const REF_LINE_COLOR = 'rgba(255,255,255,0.15)';
const REF_LABEL_COLOR = '#64748b';
const REF_LINE_COLOR_CLIP = 'rgba(255,80,80,0.4)';

// Standard reference dB levels shown on the scale
const REFERENCE_DB_LEVELS = [0, -3, -6, -12, -18, -24, -36, -48, -60] as const;

// Peak hold falls at 12 dB/s after the hold period
const PEAK_FALL_RATE_DB_PER_MS = 12 / 1000;

registerFeatureRequirements('audioVolumeMeter', [{ feature: 'rms' }]);

const clampSmoothing: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) return undefined;
    return clamp(numeric, 0, 64);
};

const normalizeChannelSelector: PropertyTransform<string | number | null, SceneElementInterface> = (value) =>
    normalizeChannelSelectorInput(value);

export class AudioVolumeMeterElement extends SceneElement {
    private _peakDb: number = -Infinity;
    private _peakSetMs: number = 0;
    private _lastRenderMs: number = 0;

    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Volume Meter',
                description: 'dBFS meter with peak hold and reference lines.',
                category: 'Audio Displays',
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'volumeMeter',
                        label: 'Volume Meter',
                        collapsed: false,
                        properties: [
                            {
                                key: 'channelSelector',
                                type: 'select',
                                label: 'Channel',
                                default: null,
                                options: [{ label: 'Mix (mono)', value: null }],
                                runtime: { transform: normalizeChannelSelector, defaultValue: null },
                            },
                            prop.select('meterMode', 'Meter Mode', 'rms', [
                                { label: 'RMS', value: 'rms' },
                                { label: 'Peak (fast)', value: 'peak' },
                            ]),
                            prop.select('orientation', 'Orientation', 'vertical', [
                                { label: 'Vertical', value: 'vertical' },
                                { label: 'Horizontal', value: 'horizontal' },
                            ]),
                            prop.number('width', 'Width (px)', 80, { step: 1 }),
                            prop.number('height', 'Height (px)', 400, { step: 1 }),
                            prop.number('minDb', 'Min dBFS', -60, { step: 1 }),
                            prop.number('maxDb', 'Max dBFS', 0, { step: 1 }),
                            prop.boolean('showPeakHold', 'Show Peak Hold', true),
                            prop.number('peakHoldSec', 'Peak Hold (sec)', 2, { step: 0.1 }),
                            prop.boolean('showReferenceLines', 'Reference Lines', true),
                            prop.boolean('showValue', 'Show Value Label', true),
                            {
                                key: 'smoothing',
                                type: 'number',
                                label: 'Smoothing',
                                default: 0,
                                step: 1,
                                runtime: { transform: clampSmoothing, defaultValue: 0 },
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true }),
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR),
                            prop.range('backgroundOpacity', 'Background Opacity', 0, { min: 0, max: 1, step: 0.01 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const width = props.width ?? 80;
        const height = props.height ?? 400;
        const minDb = props.minDb ?? -60;
        const maxDb = props.maxDb ?? 0;
        const isVertical = (props.orientation ?? 'vertical') === 'vertical';

        const objects: RenderObject[] = [];

        objects.push(
            new Rectangle(
                0,
                0,
                width,
                height,
                applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 0)
            )
        );

        if (!props.audioTrackId) {
            objects.push(
                new Text(8, height / 2, 'Select an audio track', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle')
                    .setIncludeInLayoutBounds(false)
            );
            return objects;
        }

        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
        // Peak mode uses no smoothing for a fast-responding meter
        const smoothing = (props.meterMode ?? 'rms') === 'peak' ? 0 : (props.smoothing ?? 0);
        const result =
            api && status === 'ok'
                ? api.audio.sampleFeatureAtTime({
                      element: this,
                      trackId: props.audioTrackId,
                      feature: 'rms',
                      time: _targetTime,
                      samplingOptions: { smoothing },
                  })
                : null;

        const selected = selectChannelSample(result?.metadata.frame, props.channelSelector);
        const rawLinear = selected?.values?.[0] ?? result?.values?.[0] ?? 0;
        const rawDb = linearToDb(rawLinear);
        const clampedDb = clamp(Number.isFinite(rawDb) ? rawDb : minDb, minDb, maxDb);
        const normalized = dbToNormalized(clampedDb, minDb, maxDb);
        const meterColor = applyOpacity(props.color ?? DEFAULT_METER_COLOR, props.opacity ?? 1);

        // Peak hold — tracks per-instance using wall-clock time so it works during live playback
        const nowMs = Date.now();
        const frameDeltaMs = this._lastRenderMs > 0 ? nowMs - this._lastRenderMs : 0;
        this._lastRenderMs = nowMs;

        if (!Number.isFinite(this._peakDb) || rawDb >= this._peakDb) {
            this._peakDb = rawDb;
            this._peakSetMs = nowMs;
        } else {
            const holdElapsed = nowMs - this._peakSetMs;
            const peakHoldMs = (props.peakHoldSec ?? 2) * 1000;
            if (holdElapsed > peakHoldMs && frameDeltaMs > 0) {
                this._peakDb = Math.max(this._peakDb - PEAK_FALL_RATE_DB_PER_MS * frameDeltaMs, minDb - 1);
            }
        }

        // Reference lines (drawn before the bar so the bar renders on top)
        if (props.showReferenceLines !== false) {
            const labelFont = '10px Inter, sans-serif';
            for (const refDb of REFERENCE_DB_LEVELS) {
                if (refDb < minDb || refDb > maxDb) continue;
                const refNorm = dbToNormalized(refDb, minDb, maxDb);
                // Clip zone (above -3 dBFS) gets a reddish line colour
                const lineColor = refDb >= -3 ? REF_LINE_COLOR_CLIP : REF_LINE_COLOR;
                const label = refDb === 0 ? '0' : `${refDb}`;

                if (isVertical) {
                    const lineY = height - refNorm * height;
                    objects.push(
                        new Line(0, lineY, width, lineY, lineColor, 1).setIncludeInLayoutBounds(false)
                    );
                    objects.push(
                        new Text(width + 4, lineY, label, labelFont, REF_LABEL_COLOR, 'left', 'middle')
                            .setIncludeInLayoutBounds(false)
                    );
                } else {
                    const lineX = refNorm * width;
                    objects.push(
                        new Line(lineX, 0, lineX, height, lineColor, 1).setIncludeInLayoutBounds(false)
                    );
                    objects.push(
                        new Text(lineX, height + 4, label, labelFont, REF_LABEL_COLOR, 'center', 'top')
                            .setIncludeInLayoutBounds(false)
                    );
                }
            }
        }

        // Meter bar
        if (isVertical) {
            const fillHeight = normalized * height;
            objects.push(
                new Rectangle(0, height - fillHeight, width, fillHeight, meterColor).setIncludeInLayoutBounds(false)
            );
        } else {
            objects.push(
                new Rectangle(0, 0, normalized * width, height, meterColor).setIncludeInLayoutBounds(false)
            );
        }

        // Peak hold indicator
        if (props.showPeakHold !== false) {
            const peakDb = clamp(Number.isFinite(this._peakDb) ? this._peakDb : minDb, minDb, maxDb);
            const peakNorm = dbToNormalized(peakDb, minDb, maxDb);
            if (isVertical) {
                const peakY = height - peakNorm * height;
                objects.push(
                    new Line(0, peakY, width, peakY, DEFAULT_PEAK_HOLD_COLOR, 2).setIncludeInLayoutBounds(false)
                );
            } else {
                const peakX = peakNorm * width;
                objects.push(
                    new Line(peakX, 0, peakX, height, DEFAULT_PEAK_HOLD_COLOR, 2).setIncludeInLayoutBounds(false)
                );
            }
        }

        // Value label
        if (props.showValue) {
            const dbLabel = Number.isFinite(rawDb) ? `${clampedDb.toFixed(1)} dB` : '-∞ dB';
            const labelY = isVertical ? height + 16 : height + 16;
            objects.push(
                new Text(0, labelY, dbLabel, '12px Inter, sans-serif', '#e2e8f0', 'left', 'middle')
                    .setIncludeInLayoutBounds(false)
            );
        }

        return objects;
    }
}

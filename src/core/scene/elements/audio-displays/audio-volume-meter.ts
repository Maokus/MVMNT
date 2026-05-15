import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { Rectangle, Text, Line, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { applyOpacity } from '@utils/color';
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
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

const STEREO_GAP = 3;

function getChannelValue(readings: Float32Array | null, channelIndex: number): number {
    if (!readings || readings.length === 0) return 0;
    return readings[Math.min(channelIndex, readings.length - 1)] ?? 0;
}

function getMonoValue(readings: Float32Array | null): number {
    if (!readings || readings.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < readings.length; i++) sum += readings[i] ?? 0;
    return sum / readings.length;
}

function findMaxAbs(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i] ?? 0);
        if (abs > peak) peak = abs;
    }
    return peak;
}

const clampSmoothing: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) return undefined;
    return clamp(numeric, 0, 64);
};

export class AudioVolumeMeterElement extends SceneElement {
    // Per-channel peak tracking: index 0 = L/mono, index 1 = R
    private _peakDb: number[] = [-Infinity, -Infinity];
    private _peakSetSec: number[] = [-Infinity, -Infinity];
    private _lastRenderSec: number = -Infinity;

    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
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
                            prop.select('channelMode', 'Channel', 'stereo', [
                                { label: 'Stereo (L+R)', value: 'stereo' },
                                { label: 'Left', value: 'left' },
                                { label: 'Right', value: 'right' },
                                { label: 'Mono (mix)', value: 'mono' },
                            ]),
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

    private _updatePeak(
        channelIndex: number,
        rawDb: number,
        nowSec: number,
        frameDeltaSec: number,
        peakHoldSec: number,
        minDb: number
    ): number {
        const currentPeak = this._peakDb[channelIndex] ?? -Infinity;
        const currentSetSec = this._peakSetSec[channelIndex] ?? -Infinity;
        if (!Number.isFinite(currentPeak) || rawDb >= currentPeak) {
            this._peakDb[channelIndex] = rawDb;
            this._peakSetSec[channelIndex] = nowSec;
            return rawDb;
        }
        const holdElapsed = nowSec - currentSetSec;
        if (holdElapsed > peakHoldSec && frameDeltaSec > 0) {
            const next = Math.max(currentPeak - PEAK_FALL_RATE_DB_PER_MS * frameDeltaSec * 1000, minDb - 1);
            this._peakDb[channelIndex] = next;
            return next;
        }
        return currentPeak;
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const width = props.width ?? 80;
        const height = props.height ?? 400;
        const minDb = props.minDb ?? -60;
        const maxDb = props.maxDb ?? 0;
        const isVertical = (props.orientation ?? 'vertical') === 'vertical';
        const channelMode = (props.channelMode ?? 'stereo') as 'stereo' | 'left' | 'right' | 'mono';
        const isStereo = channelMode === 'stereo';

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
                new Text(
                    8,
                    height / 2,
                    'Select an audio track',
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                ).setIncludeInLayoutBounds(false)
            );
            return objects;
        }

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioRawRead]);
        const meterMode = (props.meterMode ?? 'rms') as 'rms' | 'peak';
        const smoothing = props.smoothing ?? 0;
        // Window size: 25ms base + 10ms per smoothing unit (0→25ms, 64→665ms)
        const windowSec = meterMode === 'peak' ? 0.01 : Math.max(0.025, smoothing * 0.01);
        const halfWindow = windowSec / 2;

        let readings: Float32Array | null = null;
        if (host.ok) {
            const trackId = props.audioTrackId as string;
            const startSec = _targetTime - halfWindow;
            const endSec = _targetTime + halfWindow;
            if (meterMode === 'rms') {
                readings = host.api.audio.getRmsInWindow({ trackId, startSec, endSec });
            } else {
                // Peak mode: get raw samples per channel and find max abs amplitude
                const leftSamples = host.api.audio.getRawSamples({ trackId, startSec, endSec, channel: 'left' });
                const rightSamples = host.api.audio.getRawSamples({ trackId, startSec, endSec, channel: 'right' });
                if (leftSamples || rightSamples) {
                    readings = new Float32Array(2);
                    readings[0] = leftSamples ? findMaxAbs(leftSamples) : 0;
                    readings[1] = rightSamples ? findMaxAbs(rightSamples) : readings[0];
                }
            }
        }

        const meterColor = applyOpacity(props.color ?? DEFAULT_METER_COLOR, props.opacity ?? 1);

        const nowSec = _targetTime;
        // frameDeltaSec is positive when time advances, zero on first frame, negative when scrubbing backwards.
        // When scrubbing backwards, reset peaks so they reflect the new playback position.
        const frameDeltaSec = this._lastRenderSec > -Infinity ? nowSec - this._lastRenderSec : 0;
        this._lastRenderSec = nowSec;
        if (frameDeltaSec < 0) {
            // Time went backwards (scrub) — reset peaks to current reading so old peaks don't linger.
            this._peakDb = [-Infinity, -Infinity];
            this._peakSetSec = [-Infinity, -Infinity];
        }

        const peakHoldSec = props.peakHoldSec ?? 2;

        if (isStereo) {
            this._buildStereoMeter(objects, {
                readings,
                width,
                height,
                minDb,
                maxDb,
                isVertical,
                meterColor,
                nowSec,
                frameDeltaSec,
                peakHoldSec,
                props,
            });
        } else {
            const rawLinear =
                channelMode === 'left'
                    ? getChannelValue(readings, 0)
                    : channelMode === 'right'
                      ? getChannelValue(readings, 1)
                      : getMonoValue(readings);
            const rawDb = linearToDb(rawLinear);
            const clampedDb = clamp(Number.isFinite(rawDb) ? rawDb : minDb, minDb, maxDb);
            const normalized = dbToNormalized(clampedDb, minDb, maxDb);
            const peakDb = this._updatePeak(0, rawDb, nowSec, frameDeltaSec, peakHoldSec, minDb);

            this._buildRefLines(objects, { width, height, minDb, maxDb, isVertical, props });
            this._buildBar(objects, { x: 0, y: 0, w: width, h: height, normalized, isVertical, meterColor });
            if (props.showPeakHold !== false) {
                this._buildPeakLine(objects, { x: 0, y: 0, w: width, h: height, peakDb, minDb, maxDb, isVertical });
            }
            if (props.showValue) {
                const dbLabel = Number.isFinite(rawDb) ? `${clampedDb.toFixed(1)} dB` : '-∞ dB';
                const labelY = height + 16;
                objects.push(
                    new Text(
                        0,
                        labelY,
                        dbLabel,
                        '12px Inter, sans-serif',
                        '#e2e8f0',
                        'left',
                        'middle'
                    ).setIncludeInLayoutBounds(false)
                );
            }
        }

        return objects;
    }

    private _buildStereoMeter(
        objects: RenderObject[],
        ctx: {
            readings: Float32Array | null;
            width: number;
            height: number;
            minDb: number;
            maxDb: number;
            isVertical: boolean;
            meterColor: string;
            nowSec: number;
            frameDeltaSec: number;
            peakHoldSec: number;
            props: Record<string, unknown>;
        }
    ) {
        const {
            readings,
            width,
            height,
            minDb,
            maxDb,
            isVertical,
            meterColor,
            nowSec,
            frameDeltaSec,
            peakHoldSec,
            props,
        } = ctx;

        const rawLinearL = getChannelValue(readings, 0);
        const rawLinearR = getChannelValue(readings, 1);
        const rawDbL = linearToDb(rawLinearL);
        const rawDbR = linearToDb(rawLinearR);
        const clampedDbL = clamp(Number.isFinite(rawDbL) ? rawDbL : minDb, minDb, maxDb);
        const clampedDbR = clamp(Number.isFinite(rawDbR) ? rawDbR : minDb, minDb, maxDb);
        const normL = dbToNormalized(clampedDbL, minDb, maxDb);
        const normR = dbToNormalized(clampedDbR, minDb, maxDb);
        const peakDbL = this._updatePeak(0, rawDbL, nowSec, frameDeltaSec, peakHoldSec, minDb);
        const peakDbR = this._updatePeak(1, rawDbR, nowSec, frameDeltaSec, peakHoldSec, minDb);

        if (isVertical) {
            const barW = (width - STEREO_GAP) / 2;
            const xL = 0;
            const xR = barW + STEREO_GAP;

            // Reference lines spanning full width
            this._buildRefLines(objects, { width, height, minDb, maxDb, isVertical, props });

            this._buildBar(objects, { x: xL, y: 0, w: barW, h: height, normalized: normL, isVertical, meterColor });
            this._buildBar(objects, { x: xR, y: 0, w: barW, h: height, normalized: normR, isVertical, meterColor });

            if (props.showPeakHold !== false) {
                this._buildPeakLine(objects, {
                    x: xL,
                    y: 0,
                    w: barW,
                    h: height,
                    peakDb: peakDbL,
                    minDb,
                    maxDb,
                    isVertical,
                });
                this._buildPeakLine(objects, {
                    x: xR,
                    y: 0,
                    w: barW,
                    h: height,
                    peakDb: peakDbR,
                    minDb,
                    maxDb,
                    isVertical,
                });
            }

            // L / R channel labels inside bars
            const labelFont = '10px Inter, sans-serif';
            objects.push(
                new Text(
                    xL + barW / 2,
                    8,
                    'L',
                    labelFont,
                    'rgba(255,255,255,0.5)',
                    'center',
                    'top'
                ).setIncludeInLayoutBounds(false)
            );
            objects.push(
                new Text(
                    xR + barW / 2,
                    8,
                    'R',
                    labelFont,
                    'rgba(255,255,255,0.5)',
                    'center',
                    'top'
                ).setIncludeInLayoutBounds(false)
            );

            if (props.showValue) {
                const labelY = height + 16;
                const labelFont2 = '11px Inter, sans-serif';
                const labelL = Number.isFinite(rawDbL) ? `L: ${clampedDbL.toFixed(1)}` : 'L: -∞';
                const labelR = Number.isFinite(rawDbR) ? `R: ${clampedDbR.toFixed(1)}` : 'R: -∞';
                objects.push(
                    new Text(xL, labelY, labelL, labelFont2, '#e2e8f0', 'left', 'middle').setIncludeInLayoutBounds(
                        false
                    )
                );
                objects.push(
                    new Text(
                        xR + barW,
                        labelY,
                        labelR,
                        labelFont2,
                        '#e2e8f0',
                        'right',
                        'middle'
                    ).setIncludeInLayoutBounds(false)
                );
            }
        } else {
            // Horizontal stereo: two rows stacked
            const barH = (height - STEREO_GAP) / 2;
            const yL = 0;
            const yR = barH + STEREO_GAP;

            this._buildRefLinesHorizontalRow(objects, { x: 0, y: yL, w: width, h: barH, minDb, maxDb, props });
            this._buildRefLinesHorizontalRow(objects, { x: 0, y: yR, w: width, h: barH, minDb, maxDb, props });

            this._buildBar(objects, { x: 0, y: yL, w: width, h: barH, normalized: normL, isVertical, meterColor });
            this._buildBar(objects, { x: 0, y: yR, w: width, h: barH, normalized: normR, isVertical, meterColor });

            if (props.showPeakHold !== false) {
                this._buildPeakLine(objects, {
                    x: 0,
                    y: yL,
                    w: width,
                    h: barH,
                    peakDb: peakDbL,
                    minDb,
                    maxDb,
                    isVertical,
                });
                this._buildPeakLine(objects, {
                    x: 0,
                    y: yR,
                    w: width,
                    h: barH,
                    peakDb: peakDbR,
                    minDb,
                    maxDb,
                    isVertical,
                });
            }

            const labelFont = '10px Inter, sans-serif';
            objects.push(
                new Text(
                    4,
                    yL + barH / 2,
                    'L',
                    labelFont,
                    'rgba(255,255,255,0.5)',
                    'left',
                    'middle'
                ).setIncludeInLayoutBounds(false)
            );
            objects.push(
                new Text(
                    4,
                    yR + barH / 2,
                    'R',
                    labelFont,
                    'rgba(255,255,255,0.5)',
                    'left',
                    'middle'
                ).setIncludeInLayoutBounds(false)
            );

            if (props.showValue) {
                const labelFont2 = '11px Inter, sans-serif';
                const labelL = Number.isFinite(rawDbL) ? `${clampedDbL.toFixed(1)} dB` : '-∞ dB';
                const labelR = Number.isFinite(rawDbR) ? `${clampedDbR.toFixed(1)} dB` : '-∞ dB';
                objects.push(
                    new Text(
                        width + 4,
                        yL + barH / 2,
                        labelL,
                        labelFont2,
                        '#e2e8f0',
                        'left',
                        'middle'
                    ).setIncludeInLayoutBounds(false)
                );
                objects.push(
                    new Text(
                        width + 4,
                        yR + barH / 2,
                        labelR,
                        labelFont2,
                        '#e2e8f0',
                        'left',
                        'middle'
                    ).setIncludeInLayoutBounds(false)
                );
            }
        }
    }

    private _buildRefLines(
        objects: RenderObject[],
        {
            width,
            height,
            minDb,
            maxDb,
            isVertical,
            props,
        }: {
            width: number;
            height: number;
            minDb: number;
            maxDb: number;
            isVertical: boolean;
            props: Record<string, unknown>;
        }
    ) {
        if (props.showReferenceLines === false) return;
        const labelFont = '10px Inter, sans-serif';
        for (const refDb of REFERENCE_DB_LEVELS) {
            if (refDb < minDb || refDb > maxDb) continue;
            const refNorm = dbToNormalized(refDb, minDb, maxDb);
            const lineColor = refDb >= -3 ? REF_LINE_COLOR_CLIP : REF_LINE_COLOR;
            const label = refDb === 0 ? '0' : `${refDb}`;

            if (isVertical) {
                const lineY = height - refNorm * height;
                objects.push(new Line(0, lineY, width, lineY, lineColor, 1).setIncludeInLayoutBounds(false));
                objects.push(
                    new Text(
                        width + 4,
                        lineY,
                        label,
                        labelFont,
                        REF_LABEL_COLOR,
                        'left',
                        'middle'
                    ).setIncludeInLayoutBounds(false)
                );
            } else {
                const lineX = refNorm * width;
                objects.push(new Line(lineX, 0, lineX, height, lineColor, 1).setIncludeInLayoutBounds(false));
                objects.push(
                    new Text(
                        lineX,
                        height + 4,
                        label,
                        labelFont,
                        REF_LABEL_COLOR,
                        'center',
                        'top'
                    ).setIncludeInLayoutBounds(false)
                );
            }
        }
    }

    private _buildRefLinesHorizontalRow(
        objects: RenderObject[],
        {
            x,
            y,
            w,
            h,
            minDb,
            maxDb,
            props,
        }: {
            x: number;
            y: number;
            w: number;
            h: number;
            minDb: number;
            maxDb: number;
            props: Record<string, unknown>;
        }
    ) {
        if (props.showReferenceLines === false) return;
        for (const refDb of REFERENCE_DB_LEVELS) {
            if (refDb < minDb || refDb > maxDb) continue;
            const refNorm = dbToNormalized(refDb, minDb, maxDb);
            const lineColor = refDb >= -3 ? REF_LINE_COLOR_CLIP : REF_LINE_COLOR;
            const lineX = x + refNorm * w;
            objects.push(new Line(lineX, y, lineX, y + h, lineColor, 1).setIncludeInLayoutBounds(false));
        }
    }

    private _buildBar(
        objects: RenderObject[],
        {
            x,
            y,
            w,
            h,
            normalized,
            isVertical,
            meterColor,
        }: {
            x: number;
            y: number;
            w: number;
            h: number;
            normalized: number;
            isVertical: boolean;
            meterColor: string;
        }
    ) {
        if (isVertical) {
            const fillH = normalized * h;
            objects.push(new Rectangle(x, y + h - fillH, w, fillH, meterColor).setIncludeInLayoutBounds(false));
        } else {
            objects.push(new Rectangle(x, y, normalized * w, h, meterColor).setIncludeInLayoutBounds(false));
        }
    }

    private _buildPeakLine(
        objects: RenderObject[],
        {
            x,
            y,
            w,
            h,
            peakDb,
            minDb,
            maxDb,
            isVertical,
        }: {
            x: number;
            y: number;
            w: number;
            h: number;
            peakDb: number;
            minDb: number;
            maxDb: number;
            isVertical: boolean;
        }
    ) {
        const peakClamped = clamp(Number.isFinite(peakDb) ? peakDb : minDb, minDb, maxDb);
        const peakNorm = dbToNormalized(peakClamped, minDb, maxDb);
        if (isVertical) {
            const peakY = y + h - peakNorm * h;
            objects.push(new Line(x, peakY, x + w, peakY, DEFAULT_PEAK_HOLD_COLOR, 2).setIncludeInLayoutBounds(false));
        } else {
            const peakX = x + peakNorm * w;
            objects.push(new Line(peakX, y, peakX, y + h, DEFAULT_PEAK_HOLD_COLOR, 2).setIncludeInLayoutBounds(false));
        }
    }
}

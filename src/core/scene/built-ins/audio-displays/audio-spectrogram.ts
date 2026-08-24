import { BoundSceneElement, asNumber, type PropertyTransform } from '@core/scene/runtime/bound-scene-element';
import { ClipLayer, Line, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/scene/runtime/schema';
import { applyOpacity } from '@utils/color';
import { prop, insertElementConfig } from '@core/scene/runtime/schema-builders';
import { propGroup, tab } from '@core/scene/built-ins/schema-groups';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/built-ins/define-built-in';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { getBaseAnalysisProfile } from '@audio/features/analysisProfileRegistry';
import type { AudioAnalysisProfileOverrides } from '@audio/features/audioFeatureTypes';
import type { AudioFeatureRequirement } from '@audio/audioElementMetadata';
import type { AudioSpectrumScale } from './audio-spectrum';
import {
    getSpectrogramTile,
    getSpectrogramTileRange,
    DEFAULT_SPECTROGRAM_CUSTOM_COLORS,
    SPECTROGRAM_COLOR_MAPS,
    SPECTROGRAM_TILE_COLUMNS,
    SpectrogramTileRenderObject,
    type SpectrogramColorMap,
    type SpectrogramCustomColors,
} from './spectrogram-tiles';

export { buildSpectrogramPixels, resolveSpectrogramColorStops } from './spectrogram-tiles';

const DEFAULT_BACKGROUND_COLOR = '#0F172A';
const DEFAULT_PLAYHEAD_COLOR = '#E2E8F0';
const MAX_GRID_COLUMNS = 512;
const MAX_GRID_ROWS = 256;
const MAX_GUIDE_LINES = 256;
const A4_FREQUENCY = 440;
const A4_MIDI_NOTE = 69;
const WINDOW_SIZE_OPTIONS = [256, 512, 1024, 2048, 4096, 8192] as const;
const HOP_SIZE_OPTIONS = [64, 128, 256, 512, 1024, 2048] as const;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function normalizeScale(value: unknown): AudioSpectrumScale {
    return value === 'linear' || value === 'log' || value === 'mel' ? value : 'log';
}

function normalizeColorMap(value: unknown): SpectrogramColorMap {
    return SPECTROGRAM_COLOR_MAPS.includes(value as SpectrogramColorMap) ? (value as SpectrogramColorMap) : 'viridis';
}

function resolveCustomColors(props: Record<string, unknown>): SpectrogramCustomColors {
    return [
        typeof props.customLowColor === 'string' ? props.customLowColor : DEFAULT_SPECTROGRAM_CUSTOM_COLORS[0],
        typeof props.customMidColor === 'string' ? props.customMidColor : DEFAULT_SPECTROGRAM_CUSTOM_COLORS[1],
        typeof props.customHighColor === 'string' ? props.customHighColor : DEFAULT_SPECTROGRAM_CUSTOM_COLORS[2],
    ];
}

function selectedPreset(value: unknown, options: readonly number[]): number | null {
    const numeric = typeof value === 'number' ? value : Number(value);
    return options.includes(numeric) ? numeric : null;
}

/** Resolves the element's profile settings once for analysis subscription and rendering. */
export function resolveSpectrogramAnalysis(props: Record<string, unknown>): {
    requirement: AudioFeatureRequirement;
    analysisProfileId: string | null;
} {
    const selectedWindowSize = selectedPreset(props.analysisWindowSize, WINDOW_SIZE_OPTIONS);
    const selectedHopSize = selectedPreset(props.analysisHopSize, HOP_SIZE_OPTIONS);
    const hasOverrides = selectedWindowSize !== null || selectedHopSize !== null;
    let profileParams: AudioAnalysisProfileOverrides | undefined;

    if (hasOverrides) {
        const base = getBaseAnalysisProfile(null);
        const windowSize = selectedWindowSize ?? base.windowSize;
        const hopSize = Math.min(selectedHopSize ?? base.hopSize, windowSize);
        profileParams = { windowSize, hopSize };
    }

    const built = createFeatureDescriptor({
        feature: 'spectrogram',
        profile: null,
        profileParams,
    });
    return {
        requirement: {
            feature: 'spectrogram',
            profileParams,
        },
        analysisProfileId: built.descriptor.analysisProfileId ?? built.profile,
    };
}

export function getSpectrogramFrequencyPosition(
    frequency: number,
    minFrequency: number,
    maxFrequency: number,
    scale: AudioSpectrumScale
): number {
    const safeMin = scale === 'log' ? Math.max(1e-3, minFrequency) : Math.max(0, minFrequency);
    const safeMax = Math.max(safeMin + 1e-9, maxFrequency);
    const toScale = (value: number) => {
        if (scale === 'linear') return value;
        if (scale === 'log') return Math.log10(Math.max(1e-3, value));
        return 2595 * Math.log10(1 + value / 700);
    };
    return clamp((toScale(frequency) - toScale(safeMin)) / (toScale(safeMax) - toScale(safeMin)), 0, 1);
}

function addGuideLine(
    objects: RenderObject[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width: number
): void {
    objects.push(new Line(x1, y1, x2, y2, { color, lineWidth: width, layoutParticipation: 'exclude' }));
}

function formatFrequency(frequency: number): string {
    return frequency >= 1000 ? `${Number((frequency / 1000).toFixed(2))} kHz` : `${Math.round(frequency)} Hz`;
}

function formatNote(note: number): string {
    const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const rounded = Math.round(note);
    return `${names[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

function frequencyToMidiNote(frequency: number): number {
    return A4_MIDI_NOTE + 12 * Math.log2(Math.max(frequency, 1e-3) / A4_FREQUENCY);
}

function timingValue(result: unknown): number | null {
    if (typeof result === 'number' && Number.isFinite(result)) return result;
    if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === true) {
        const value = (result as { value?: unknown }).value;
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    return null;
}

function beatsPerBar(result: unknown): number {
    const value =
        result && typeof result === 'object' && (result as { ok?: unknown }).ok === true
            ? (result as { value?: { numerator?: unknown } }).value
            : result;
    const numerator = value && typeof value === 'object' ? (value as { numerator?: unknown }).numerator : undefined;
    return typeof numerator === 'number' && Number.isFinite(numerator) && numerator > 0 ? Math.round(numerator) : 4;
}

const positiveNumber =
    (fallback: number, min: number, max: number): PropertyTransform<number, SceneElementInterface> =>
    (value, element) => {
        const numeric = asNumber(value, element);
        return numeric === undefined ? undefined : clamp(numeric, min, max);
    };

export class AudioSpectrogramElement extends BoundSceneElement {
    constructor(id: string = 'audioSpectrogram', config: Record<string, unknown> = {}) {
        super('audioSpectrogram', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Audio Spectrogram',
                description: 'Scrolling frequency heatmap for an audio track.',
                category: 'Audio Displays',
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'analysis',
                        label: 'Analysis',
                        collapsed: true,
                        properties: [
                            prop.select(
                                'analysisWindowSize',
                                'Window Size',
                                '',
                                [
                                    { value: '', label: 'Default (2048)' },
                                    ...WINDOW_SIZE_OPTIONS.map((value) => ({
                                        value: String(value),
                                        label: String(value),
                                    })),
                                ],
                                {
                                    description:
                                        'How much audio is included in each slice. Larger windows show steadier, more detailed frequencies but blur rapid changes over time.',
                                }
                            ),
                            prop.select(
                                'analysisHopSize',
                                'Hop Size',
                                '',
                                [
                                    { value: '', label: 'Default (512)' },
                                    ...HOP_SIZE_OPTIONS.map((value) => ({
                                        value: String(value),
                                        label: String(value),
                                    })),
                                ],
                                {
                                    description:
                                        'How far the analysis moves before taking the next slice. Smaller hops make changes look smoother in time, but create more data and take longer to analyze.',
                                }
                            ),
                        ],
                    },
                    {
                        id: 'spectrogram',
                        label: 'Spectrogram',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width (px)', 800, { min: 1, step: 1 }),
                            prop.number('height', 'Height (px)', 500, { min: 1, step: 1 }),
                            {
                                key: 'windowSeconds',
                                type: 'number',
                                label: 'Window (seconds)',
                                default: 6,
                                min: 0.1,
                                max: 60,
                                step: 0.1,
                                runtime: { transform: positiveNumber(6, 0.1, 60), defaultValue: 6 },
                            },
                            {
                                key: 'playheadPosition',
                                type: 'number',
                                label: 'Playhead Position',
                                default: 0.5,
                                min: 0,
                                max: 1,
                                step: 0.01,
                                runtime: { transform: positiveNumber(0.5, 0, 1), defaultValue: 0.5 },
                            },
                            prop.boolean('seeFuture', 'See Future', true),
                            prop.boolean('showPlayhead', 'Show Playhead', true),
                            prop.color('playheadColor', 'Playhead Color', DEFAULT_PLAYHEAD_COLOR),
                            {
                                key: 'scale',
                                type: 'select',
                                label: 'Frequency Scale',
                                default: 'log',
                                options: [
                                    { label: 'Linear', value: 'linear' },
                                    { label: 'Logarithmic', value: 'log' },
                                    { label: 'Mel', value: 'mel' },
                                ],
                                runtime: { transform: (value) => normalizeScale(value), defaultValue: 'log' },
                            },
                            prop.number('minFrequency', 'Min Frequency (Hz)', 20, { min: 0, max: 48000, step: 1 }),
                            prop.number('maxFrequency', 'Max Frequency (Hz)', 20000, { min: 1, max: 48000, step: 1 }),
                            prop.number('minDecibels', 'Minimum Value', -80, { min: -120, max: 0, step: 1 }),
                            prop.number('maxDecibels', 'Maximum Value', 0, { min: -120, max: 0, step: 1 }),
                            prop.number('gain', 'Gain', 1, { min: 0, max: 10, step: 0.01 }),
                            {
                                key: 'colorMap',
                                type: 'select',
                                label: 'Color Map',
                                default: 'viridis',
                                options: SPECTROGRAM_COLOR_MAPS.map((value) => ({
                                    label: value[0]!.toUpperCase() + value.slice(1),
                                    value,
                                })),
                                runtime: { transform: (value) => normalizeColorMap(value), defaultValue: 'viridis' },
                            },
                            prop.color('customLowColor', 'Custom Low Color', DEFAULT_SPECTROGRAM_CUSTOM_COLORS[0], {
                                visibleWhen: [{ key: 'colorMap', equals: 'custom' }],
                            }),
                            prop.color('customMidColor', 'Custom Mid Color', DEFAULT_SPECTROGRAM_CUSTOM_COLORS[1], {
                                visibleWhen: [{ key: 'colorMap', equals: 'custom' }],
                            }),
                            prop.color('customHighColor', 'Custom High Color', DEFAULT_SPECTROGRAM_CUSTOM_COLORS[2], {
                                visibleWhen: [{ key: 'colorMap', equals: 'custom' }],
                            }),
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'playheadPosition' } },
                            { kind: 'property', propertyKey: 'playheadPosition' },
                        ],
                    },
                    {
                        id: 'guides',
                        label: 'Guides',
                        collapsed: true,
                        properties: [
                            prop.boolean('showFrequencyGuides', 'Show Frequency Lines', false),
                            prop.number('frequencyGuideStep', 'Frequency Line Every (Hz)', 1000, {
                                min: 1,
                                max: 48000,
                                step: 1,
                            }),
                            prop.boolean('showOctaveGuides', 'Show Octave Lines', false),
                            prop.number('octaveGuideStep', 'Octave Line Every', 1, { min: 1, max: 8, step: 1 }),
                            prop.number('octaveGuideStartNote', 'Octave Start Note (MIDI)', A4_MIDI_NOTE, {
                                min: 0,
                                max: 127,
                                step: 1,
                            }),
                            prop.boolean('showNoteGuides', 'Show Note Lines', false),
                            prop.number('noteGuideStep', 'Note Line Every (semitones)', 12, {
                                min: 1,
                                max: 48,
                                step: 1,
                            }),
                            prop.number('noteGuideStartNote', 'Note Start Note (MIDI)', 0, {
                                min: 0,
                                max: 127,
                                step: 1,
                            }),
                            prop.boolean('showBeatGuides', 'Show Beat Lines', false),
                            prop.number('beatGuideStep', 'Beat Line Every', 1, { min: 0.25, max: 64, step: 0.25 }),
                            prop.boolean('showBarGuides', 'Show Bar Lines', false),
                            prop.color('barGuideColor', 'Bar Line Color', '#F8FAFC'),
                            prop.boolean('showSecondGuides', 'Show Second Lines', false),
                            prop.number('secondGuideStep', 'Second Line Every', 1, { min: 0.1, max: 60, step: 0.1 }),
                            prop.color('guideColor', 'Guide Color', '#E2E8F0'),
                            prop.number('guideOpacity', 'Guide Opacity', 0.35, { min: 0, max: 1, step: 0.01 }),
                            prop.number('guideLineWidth', 'Guide Line Width', 1, { min: 0.5, max: 8, step: 0.5 }),
                            prop.boolean('showGuideLabels', 'Show Guide Labels', true),
                            prop.number('guideLabelSize', 'Guide Label Size (px)', 10, { min: 6, max: 32, step: 1 }),
                        ],
                        layout: [
                            {
                                kind: 'section',
                                id: 'frequency-guides',
                                label: 'Frequency',
                                collapsed: false,
                                children: [
                                    { kind: 'property', propertyKey: 'showFrequencyGuides' },
                                    { kind: 'property', propertyKey: 'frequencyGuideStep' },
                                    { kind: 'property', propertyKey: 'showOctaveGuides' },
                                    { kind: 'property', propertyKey: 'octaveGuideStep' },
                                    { kind: 'property', propertyKey: 'octaveGuideStartNote' },
                                    { kind: 'property', propertyKey: 'showNoteGuides' },
                                    { kind: 'property', propertyKey: 'noteGuideStep' },
                                    { kind: 'property', propertyKey: 'noteGuideStartNote' },
                                ],
                            },
                            {
                                kind: 'section',
                                id: 'time-guides',
                                label: 'Time',
                                collapsed: false,
                                children: [
                                    { kind: 'property', propertyKey: 'showBeatGuides' },
                                    { kind: 'property', propertyKey: 'beatGuideStep' },
                                    { kind: 'property', propertyKey: 'showBarGuides' },
                                    { kind: 'property', propertyKey: 'barGuideColor' },
                                    { kind: 'property', propertyKey: 'showSecondGuides' },
                                    { kind: 'property', propertyKey: 'secondGuideStep' },
                                ],
                            },
                            {
                                kind: 'section',
                                id: 'guide-appearance',
                                label: 'Appearance & Labels',
                                collapsed: true,
                                children: [
                                    { kind: 'property', propertyKey: 'guideColor' },
                                    { kind: 'property', propertyKey: 'guideOpacity' },
                                    { kind: 'property', propertyKey: 'guideLineWidth' },
                                    { kind: 'property', propertyKey: 'showGuideLabels' },
                                    { kind: 'property', propertyKey: 'guideLabelSize' },
                                ],
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true, label: 'Spectrogram' }),
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR),
                            prop.number('backgroundOpacity', 'Background Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'backgroundOpacity' } },
                            { kind: 'property', propertyKey: 'backgroundOpacity' },
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = Math.max(1, props.width ?? 800);
        const height = Math.max(1, props.height ?? 300);
        const objects: RenderObject[] = [
            new Rectangle(0, 0, width, height, {
                fillColor: applyOpacity(
                    props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
                    props.backgroundOpacity ?? 1
                ),
            }),
        ];
        const message = (text: string) => {
            objects.push(
                new Text(8, height / 2, text, '12px Inter, sans-serif', {
                    color: '#94a3b8',
                    baseline: 'middle',
                }).setLayoutParticipation('exclude')
            );
            return objects;
        };
        if (!props.audioTrackId) return message('Select an audio track');
        const analysis = resolveSpectrogramAnalysis(props);
        const context = getEnginePrivateContext(this);
        const audio = context.audio;
        if (!audio) return message('Audio not available');

        const metadata = audio.getChannelMetadata(props.audioTrackId);
        const sampleRate = metadata.ok ? metadata.value.sampleRate : 44100;
        const cols = clamp(Math.round(width), 1, MAX_GRID_COLUMNS);
        const rows = clamp(Math.round(height), 1, MAX_GRID_ROWS);
        const windowSeconds = clamp(props.windowSeconds ?? 6, 0.1, 60);
        const playheadPosition = clamp(props.playheadPosition ?? 0.5, 0, 1);
        const startSeconds = targetTime - windowSeconds * playheadPosition;
        const endSeconds = targetTime + windowSeconds * (1 - playheadPosition);
        const stepSeconds = windowSeconds / Math.max(1, cols - 1);
        const gain = clamp(props.gain ?? 1, 0, 10);
        const columnWidth = cols > 1 ? width / (cols - 1) : width;
        const lastVisibleSeconds = props.seeFuture === true ? endSeconds : targetTime;
        const { firstTile, lastTile } = getSpectrogramTileRange(startSeconds, lastVisibleSeconds, stepSeconds);
        const clipWidth = props.seeFuture === true ? width : width * playheadPosition;
        const tiles = new ClipLayer(Math.max(0, clipWidth), height, { layoutParticipation: 'exclude' });
        tiles.blendMode = props.blendMode === 'source-over' ? null : (props.blendMode as GlobalCompositeOperation);
        let hasData = false;
        for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex += 1) {
            const resource = getSpectrogramTile({
                trackId: props.audioTrackId,
                analysisProfileId: analysis.analysisProfileId,
                tileIndex,
                stepSeconds,
                rows,
                sampleRate,
                scale: normalizeScale(props.scale),
                minFrequency: props.minFrequency ?? 20,
                maxFrequency: props.maxFrequency ?? 20000,
                minDecibels: props.minDecibels ?? -80,
                maxDecibels: props.maxDecibels ?? 0,
                gain,
                colorMap: normalizeColorMap(props.colorMap),
                customColors: resolveCustomColors(props),
            });
            if (!resource) continue;
            hasData = true;
            const tileStartSeconds = tileIndex * SPECTROGRAM_TILE_COLUMNS * stepSeconds;
            const x = ((tileStartSeconds - startSeconds) / stepSeconds) * columnWidth;
            tiles.addChild(
                new SpectrogramTileRenderObject(resource, x, 0, SPECTROGRAM_TILE_COLUMNS * columnWidth, height, {
                    layoutParticipation: 'exclude',
                })
            );
        }
        if (!hasData) return message('No spectrogram data');
        objects.push(tiles);
        const guideColor = applyOpacity(props.guideColor ?? '#E2E8F0', clamp(props.guideOpacity ?? 0.35, 0, 1));
        const guideWidth = clamp(props.guideLineWidth ?? 1, 0.5, 8);
        const showGuideLabels = props.showGuideLabels !== false;
        const guideLabelFont = `${Math.round(clamp(props.guideLabelSize ?? 10, 6, 32))}px Inter, sans-serif`;
        const minFrequency = clamp(props.minFrequency ?? 20, 0, sampleRate / 2);
        const maxFrequency = clamp(props.maxFrequency ?? 20000, minFrequency + 1e-9, sampleRate / 2);
        const guideScale = normalizeScale(props.scale);
        const addFrequencyGuide = (frequency: number, label: string) => {
            if (frequency < minFrequency || frequency > maxFrequency) return;
            const y = height * (1 - getSpectrogramFrequencyPosition(frequency, minFrequency, maxFrequency, guideScale));
            addGuideLine(objects, 0, y, width, y, guideColor, guideWidth);
            if (showGuideLabels) {
                const atTop = y < 12;
                objects.push(
                    new Text(4, atTop ? y + 2 : y - 2, label, guideLabelFont, {
                        color: guideColor,
                        baseline: atTop ? 'top' : 'bottom',
                    }).setLayoutParticipation('exclude')
                );
            }
        };
        if (props.showFrequencyGuides === true) {
            const step = clamp(props.frequencyGuideStep ?? 1000, 1, 48000);
            for (
                let frequency = Math.ceil(minFrequency / step) * step, count = 0;
                frequency <= maxFrequency && count < MAX_GUIDE_LINES;
                frequency += step, count += 1
            )
                addFrequencyGuide(frequency, formatFrequency(frequency));
        }
        if (props.showOctaveGuides === true) {
            const step = Math.round(clamp(props.octaveGuideStep ?? 1, 1, 8));
            const startNote = Math.round(clamp(props.octaveGuideStartNote ?? A4_MIDI_NOTE, 0, 127));
            const noteStep = 12 * step;
            const firstNote =
                startNote + Math.ceil((frequencyToMidiNote(minFrequency) - startNote) / noteStep) * noteStep;
            for (let note = firstNote, count = 0; count < MAX_GUIDE_LINES; note += noteStep, count += 1) {
                const frequency = A4_FREQUENCY * Math.pow(2, (note - A4_MIDI_NOTE) / 12);
                if (frequency > maxFrequency) break;
                addFrequencyGuide(frequency, `${formatNote(note)} · ${formatFrequency(frequency)}`);
            }
        }
        if (props.showNoteGuides === true) {
            const step = Math.round(clamp(props.noteGuideStep ?? 12, 1, 48));
            const startNote = Math.round(clamp(props.noteGuideStartNote ?? 0, 0, 127));
            const firstNote = startNote + Math.ceil((frequencyToMidiNote(minFrequency) - startNote) / step) * step;
            for (let note = firstNote, count = 0; count < MAX_GUIDE_LINES; note += step, count += 1) {
                const frequency = A4_FREQUENCY * Math.pow(2, (note - A4_MIDI_NOTE) / 12);
                if (frequency > maxFrequency) break;
                addFrequencyGuide(frequency, `${formatNote(note)} · ${formatFrequency(frequency)}`);
            }
        }
        const addTimeGuide = (seconds: number, label: string, color = guideColor) => {
            const x = ((seconds - startSeconds) / windowSeconds) * width;
            if (x >= 0 && x <= width) {
                addGuideLine(objects, x, 0, x, height, color, guideWidth);
                if (showGuideLabels) {
                    objects.push(
                        new Text(Math.min(width - 2, x + 3), 3, label, guideLabelFont, {
                            color,
                            baseline: 'top',
                        }).setLayoutParticipation('exclude')
                    );
                }
            }
        };
        if (props.showSecondGuides === true) {
            const step = clamp(props.secondGuideStep ?? 1, 0.1, 60);
            for (
                let second = Math.ceil(startSeconds / step) * step, count = 0;
                second <= endSeconds + 1e-9 && count < MAX_GUIDE_LINES;
                second += step, count += 1
            )
                addTimeGuide(second, `${Number(second.toFixed(2))} s`);
        }
        if (props.showBeatGuides === true || props.showBarGuides === true) {
            const beatStep = clamp(props.beatGuideStep ?? 1, 0.25, 64);
            const firstBeat = timingValue(context.timing?.secondsToBeats(startSeconds));
            const lastBeat = timingValue(context.timing?.secondsToBeats(endSeconds));
            if (firstBeat !== null && lastBeat !== null) {
                const barSize = beatsPerBar(context.timing?.getTimeSignature());
                if (props.showBeatGuides === true) {
                    for (
                        let beat = Math.ceil(firstBeat / beatStep) * beatStep, count = 0;
                        beat <= lastBeat + 1e-9 && count < MAX_GUIDE_LINES;
                        beat += beatStep, count += 1
                    ) {
                        const isBarBoundary = Math.abs(beat / barSize - Math.round(beat / barSize)) < 1e-9;
                        if (props.showBarGuides === true && isBarBoundary) continue;
                        const seconds = timingValue(context.timing?.beatsToSeconds(beat));
                        if (seconds !== null) addTimeGuide(seconds, `${Number(beat.toFixed(2))}`);
                    }
                }
                if (props.showBarGuides === true) {
                    const firstBarBeat = Math.ceil(firstBeat / barSize) * barSize;
                    const barColor = applyOpacity(
                        props.barGuideColor ?? '#F8FAFC',
                        clamp(props.guideOpacity ?? 0.35, 0, 1)
                    );
                    for (
                        let beat = firstBarBeat, count = 0;
                        beat <= lastBeat + 1e-9 && count < MAX_GUIDE_LINES;
                        beat += barSize, count += 1
                    ) {
                        const seconds = timingValue(context.timing?.beatsToSeconds(beat));
                        if (seconds !== null) addTimeGuide(seconds, `Bar ${Math.floor(beat / barSize) + 1}`, barColor);
                    }
                }
            }
        }
        if (props.showPlayhead !== false) {
            const x = width * playheadPosition;
            const line = new Line(x, 0, x, height, {
                color: applyOpacity(props.playheadColor ?? DEFAULT_PLAYHEAD_COLOR, props.opacity ?? 1),
                lineWidth: 1,
                layoutParticipation: 'exclude',
            });
            objects.push(line);
        }
        return objects;
    }
}

export const audioSpectrogram = defineHostAdaptedBuiltIn(
    {
        type: 'audioSpectrogram',
        metadata: { name: 'Audio Spectrogram', description: 'Scrolling frequency heatmap', category: 'Audio Displays' },
        capabilities: { required: ['audio.features.read'], optional: ['timing.conversion'] },
        audioFeatureDemands(props) {
            const analysis = resolveSpectrogramAnalysis(props);
            return [
                {
                    ...analysis.requirement,
                    id: 'spectrogram',
                    trackId: typeof props.audioTrackId === 'string' ? props.audioTrackId : null,
                },
            ];
        },
    },
    AudioSpectrogramElement
);

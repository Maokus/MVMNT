import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from './base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { getFeatureData, type FeatureDataResult } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from './audioElementMetadata';

interface FeatureOption {
    value: string;
    label: string;
}

const FALLBACK_FEATURE_OPTIONS: FeatureOption[] = [
    { value: 'rms', label: 'RMS' },
    { value: 'waveform', label: 'Waveform' },
    { value: 'spectrogram', label: 'Spectrogram' },
    { value: 'pitchWaveform', label: 'Pitch Waveform' },
];

let lastRegisteredSignature: string | null = null;

function toDisplayLabel(key: string): string {
    return key
        .replace(/[-_]+/g, ' ')
        .replace(/\b([a-z])/g, (match) => match.toUpperCase())
        .trim();
}

function buildSignature(options: FeatureOption[]): string {
    return options.map((option) => option.value).join('|');
}

function resolveFeatureOptions(): FeatureOption[] {
    const calculators = audioFeatureCalculatorRegistry.list();
    const seen = new Set<string>();
    const options: FeatureOption[] = [];

    for (const calculator of calculators) {
        const rawKey = typeof calculator.featureKey === 'string' ? calculator.featureKey.trim() : '';
        if (!rawKey || seen.has(rawKey)) {
            continue;
        }
        seen.add(rawKey);
        const label =
            typeof calculator.label === 'string' && calculator.label.trim().length
                ? calculator.label.trim()
                : toDisplayLabel(rawKey);
        options.push({ value: rawKey, label });
    }

    if (!options.length) {
        for (const fallback of FALLBACK_FEATURE_OPTIONS) {
            if (seen.has(fallback.value)) {
                continue;
            }
            options.push({ value: fallback.value, label: fallback.label });
        }
    }

    options.sort((a, b) => a.label.localeCompare(b.label));

    const signature = buildSignature(options);
    if (signature !== lastRegisteredSignature) {
        registerFeatureRequirements(
            'audioDebug',
            options.map((option) => ({ feature: option.value }))
        );
        lastRegisteredSignature = signature;
    }

    return options;
}

const clampToRange =
    (min: number, max: number): PropertyTransform<number, SceneElementInterface> =>
    (value, element) => {
        const numeric = asNumber(value, element);
        if (numeric === undefined) {
            return undefined;
        }
        if (numeric < min) return min;
        if (numeric > max) return max;
        return numeric;
    };

const normalizeFeatureKey: PropertyTransform<string | null, SceneElementInterface> = (value, element) => {
    const options = resolveFeatureOptions();
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized && options.some((option) => option.value === normalized)) {
        return normalized;
    }
    return options[0]?.value ?? null;
};

function formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    const abs = Math.abs(value);
    if (abs === 0) {
        return '0';
    }
    if (abs >= 100) {
        return value.toFixed(0);
    }
    if (abs >= 10) {
        return value.toFixed(1);
    }
    if (abs >= 1) {
        return value.toFixed(2);
    }
    if (abs >= 0.01) {
        return value.toFixed(3);
    }
    return value.toExponential(2);
}

function formatScalar(value: unknown): string {
    if (typeof value === 'number') {
        return formatNumber(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (value == null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return formatArray(value, 4);
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>);
        return keys.length ? `{ ${keys.join(', ')} }` : '{}';
    }
    return String(value);
}

function formatArray(values: unknown[], limit: number): string {
    if (!values.length) {
        return '[]';
    }
    const slice = values.slice(0, limit).map((entry) => formatScalar(entry));
    const remaining = values.length - slice.length;
    const suffix = remaining > 0 ? `, … (+${remaining})` : '';
    return `[${slice.join(', ')}${suffix}]`;
}

function flattenMetadata(
    value: Record<string, unknown>,
    prefix: string,
    entries: string[],
    maxEntries: number,
    depth = 0
): void {
    if (entries.length >= maxEntries) {
        return;
    }
    const keys = Object.keys(value);
    for (const key of keys) {
        if (entries.length >= maxEntries) {
            break;
        }
        const child = value[key];
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        if (child == null) {
            entries.push(`${nextPrefix}: null`);
            continue;
        }
        if (Array.isArray(child)) {
            entries.push(`${nextPrefix}: ${formatArray(child, 6)}`);
            continue;
        }
        if (typeof child === 'object') {
            if (depth >= 1) {
                entries.push(`${nextPrefix}: ${formatScalar(child)}`);
            } else {
                flattenMetadata(child as Record<string, unknown>, nextPrefix, entries, maxEntries, depth + 1);
            }
            continue;
        }
        entries.push(`${nextPrefix}: ${formatScalar(child)}`);
    }
}

function collectMetadataLines(result: FeatureDataResult, maxEntries: number): string[] {
    if (maxEntries <= 0) {
        return [];
    }
    const lines: string[] = [];
    const descriptor = result.metadata?.descriptor;
    if (descriptor) {
        const descriptorRecord = descriptor as unknown as Record<string, unknown>;
        const calculatorId = descriptorRecord.calculatorId;
        const bandIndex = descriptorRecord.bandIndex;
        if (calculatorId != null) {
            lines.push(`Calculator: ${formatScalar(calculatorId)}`);
        }
        if (bandIndex != null) {
            lines.push(`Band Index: ${formatScalar(bandIndex)}`);
        }
        if (lines.length < maxEntries) {
            const extras: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(descriptorRecord)) {
                if (key === 'featureKey' || key === 'calculatorId' || key === 'bandIndex') {
                    continue;
                }
                extras[key] = value;
            }
            if (Object.keys(extras).length) {
                flattenMetadata(extras, 'descriptor', lines, maxEntries);
            }
        }
    }

    if (lines.length >= maxEntries) {
        return lines.slice(0, maxEntries);
    }

    const frame = result.metadata?.frame;
    if (frame) {
        const frameRecord = frame as unknown as Record<string, unknown>;
        const extras: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(frameRecord)) {
            if (key === 'values') {
                continue;
            }
            extras[key] = value;
        }
        if (Object.keys(extras).length) {
            flattenMetadata(extras, 'frame', lines, maxEntries);
        }
    }

    return lines.slice(0, maxEntries);
}

interface AudioDebugProps {
    audioTrackId: string | null;
    featureKey: string | null;
    maxValuesToDisplay: number;
    maxMetadataEntries: number;
    panelWidth: number;
    fontSize: number;
    lineHeight: number;
    padding: number;
    textColor: string;
    backgroundColor: string;
}

export class AudioDebugElement extends SceneElement {
    constructor(id: string = 'audioDebug', config: Record<string, unknown> = {}) {
        super('audioDebug', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const featureOptions = resolveFeatureOptions();
        const defaultFeature = featureOptions[0]?.value ?? null;
        return {
            ...base,
            name: 'Audio Debug',
            description: 'Inspect raw audio feature values and metadata for debugging.',
            category: 'audio',
            groups: [
                ...base.groups,
                {
                    id: 'audioDebugBasics',
                    label: 'Audio Debug',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            runtime: {
                                transform: (value: unknown, element: SceneElementInterface) =>
                                    asTrimmedString(value, element) ?? null,
                                defaultValue: null,
                            },
                        },
                        {
                            key: 'featureKey',
                            type: 'select',
                            label: 'Feature',
                            default: defaultFeature,
                            options: featureOptions.map((option) => ({
                                value: option.value,
                                label: option.label,
                            })),
                            runtime: {
                                transform: normalizeFeatureKey,
                                defaultValue: defaultFeature,
                            },
                        },
                        {
                            key: 'maxValuesToDisplay',
                            type: 'number',
                            label: 'Max Values to Display',
                            default: 8,
                            min: 1,
                            max: 64,
                            step: 1,
                            runtime: { transform: clampToRange(1, 64), defaultValue: 8 },
                        },
                        {
                            key: 'maxMetadataEntries',
                            type: 'number',
                            label: 'Max Metadata Lines',
                            default: 6,
                            min: 0,
                            max: 32,
                            step: 1,
                            runtime: { transform: clampToRange(0, 32), defaultValue: 6 },
                        },
                        {
                            key: 'panelWidth',
                            type: 'number',
                            label: 'Panel Width (px)',
                            default: 360,
                            min: 120,
                            max: 800,
                            step: 1,
                            runtime: { transform: clampToRange(120, 800), defaultValue: 360 },
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size (px)',
                            default: 14,
                            min: 8,
                            max: 48,
                            step: 1,
                            runtime: { transform: clampToRange(8, 48), defaultValue: 14 },
                        },
                        {
                            key: 'lineHeight',
                            type: 'number',
                            label: 'Line Height (px)',
                            default: 20,
                            min: 12,
                            max: 64,
                            step: 1,
                            runtime: { transform: clampToRange(12, 64), defaultValue: 20 },
                        },
                        {
                            key: 'padding',
                            type: 'number',
                            label: 'Padding (px)',
                            default: 12,
                            min: 0,
                            max: 64,
                            step: 1,
                            runtime: { transform: clampToRange(0, 64), defaultValue: 12 },
                        },
                        {
                            key: 'textColor',
                            type: 'color',
                            label: 'Text Color',
                            default: '#e2e8f0',
                            runtime: { transform: asTrimmedString, defaultValue: '#e2e8f0' },
                        },
                        {
                            key: 'backgroundColor',
                            type: 'color',
                            label: 'Background',
                            default: 'rgba(15, 23, 42, 0.55)',
                            runtime: {
                                transform: asTrimmedString,
                                defaultValue: 'rgba(15, 23, 42, 0.55)',
                            },
                        },
                    ],
                },
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps() as AudioDebugProps;
        const featureOptions = resolveFeatureOptions();
        const objects: RenderObject[] = [];

        const fontSize = props.fontSize ?? 14;
        const lineHeight = Math.max(props.lineHeight ?? 20, Math.round(fontSize + 4));
        const font = `${fontSize}px Inter, sans-serif`;
        const padding = props.padding ?? 12;
        const panelWidth = props.panelWidth ?? 360;

        const lines: string[] = [];

        if (!props.audioTrackId) {
            lines.push('Select an audio track to inspect audio features.');
        } else if (!featureOptions.length) {
            lines.push('No audio features are currently available.');
        } else {
            const dataByFeature = new Map<string, FeatureDataResult | null>();
            for (const option of featureOptions) {
                const result = getFeatureData(this, props.audioTrackId, option.value, targetTime);
                dataByFeature.set(option.value, result);
            }

            const requestedKey = props.featureKey ?? featureOptions[0]?.value ?? null;
            const requestedLabel =
                featureOptions.find((option) => option.value === requestedKey)?.label ?? requestedKey ?? 'Unknown';

            let activeKey: string | null = requestedKey;
            if (activeKey && !dataByFeature.has(activeKey)) {
                activeKey = null;
            }

            if (!activeKey) {
                for (const option of featureOptions) {
                    if (dataByFeature.get(option.value)) {
                        activeKey = option.value;
                        break;
                    }
                }
            }

            const activeResult = activeKey ? dataByFeature.get(activeKey) ?? null : null;
            const activeLabel = featureOptions.find((option) => option.value === activeKey)?.label ?? requestedLabel;

            lines.push(`Feature: ${activeLabel}${activeKey ? ` (${activeKey})` : ''}`);

            if (!activeResult) {
                lines.push('No feature data available at this time.');
            } else {
                const values = Array.isArray(activeResult.values) ? activeResult.values : [];
                const valueSummary = formatArray(values, props.maxValuesToDisplay ?? 8);
                lines.push(`Values (${values.length}): ${valueSummary}`);

                const metadataLines = collectMetadataLines(activeResult, props.maxMetadataEntries ?? 6);
                lines.push(...metadataLines);
            }

            if (featureOptions.length > 1) {
                const availability = featureOptions
                    .map((option) => {
                        const sample = dataByFeature.get(option.value);
                        const status = sample ? '✔' : '…';
                        return `${status} ${option.label}`;
                    })
                    .join('  ');
                lines.push(`Requested: ${availability}`);
            }
        }

        const totalHeight = Math.max(1, lines.length) * lineHeight + padding * 2;
        objects.push(new Rectangle(0, 0, panelWidth, totalHeight, props.backgroundColor ?? 'rgba(15, 23, 42, 0.55)'));

        lines.forEach((line, index) => {
            const x = padding;
            const y = padding + index * lineHeight;
            objects.push(new Text(x, y, line, font, props.textColor ?? '#e2e8f0'));
        });

        return objects;
    }
}

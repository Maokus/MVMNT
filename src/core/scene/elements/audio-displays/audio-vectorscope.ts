import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { Line, Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { applyOpacity } from '@utils/color';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/plugins/built-in-definition';

const DEFAULT_TRACE_COLOR = '#A78BFA';
const DEFAULT_GRID_COLOR = '#64748B';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';
const ROOT_TWO = Math.sqrt(2);
const VECTORSCOPE_MODES = [
    'unipolar-scaled',
    'unipolar-unscaled',
    'bipolar-scaled',
    'bipolar-unscaled',
    'lissajous',
] as const;

export type VectorscopeMode = (typeof VECTORSCOPE_MODES)[number];

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

const boundedNumber = (min: number, max: number): PropertyTransform<number, SceneElementInterface> => (value, element) => {
    const numeric = asNumber(value, element);
    return numeric === undefined ? undefined : clamp(numeric, min, max);
};

export interface VectorscopePoint { x: number; y: number; age: number; }

function normalizeVectorscopeMode(value: unknown): VectorscopeMode {
    return VECTORSCOPE_MODES.includes(value as VectorscopeMode) ? value as VectorscopeMode : 'bipolar-scaled';
}

export function buildVectorscopePoints(
    left: Float32Array,
    right: Float32Array,
    width: number,
    height: number,
    gain: number,
    pointCount: number,
    mode: VectorscopeMode = 'bipolar-scaled'
): VectorscopePoint[] {
    const count = Math.min(left.length, right.length);
    const target = Math.max(2, Math.min(count, Math.floor(pointCount)));
    if (count < 2) return [];
    const points: VectorscopePoint[] = [];
    for (let index = 0; index < target; index += 1) {
        const sourceIndex = Math.min(count - 1, Math.round(index * (count - 1) / (target - 1)));
        const l = clamp((left[sourceIndex] ?? 0) * gain, -1, 1);
        const r = clamp((right[sourceIndex] ?? 0) * gain, -1, 1);
        const side = (l - r) / ROOT_TWO;
        const mid = (l + r) / ROOT_TWO;
        let normalizedX: number;
        let normalizedY: number;
        switch (mode) {
            case 'lissajous':
                normalizedX = l;
                normalizedY = r;
                break;
            case 'unipolar-scaled':
                normalizedX = Math.abs(side) / ROOT_TWO;
                normalizedY = Math.abs(mid) / ROOT_TWO;
                break;
            case 'unipolar-unscaled':
                normalizedX = Math.abs(clamp(side, -1, 1));
                normalizedY = Math.abs(clamp(mid, -1, 1));
                break;
            case 'bipolar-unscaled':
                normalizedX = clamp(side, -1, 1);
                normalizedY = clamp(mid, -1, 1);
                break;
            case 'bipolar-scaled':
            default:
                normalizedX = side / ROOT_TWO;
                normalizedY = mid / ROOT_TWO;
                break;
        }
        // Unipolar modes use a conventional lower-left origin; bipolar and Lissajous
        // modes retain a centered zero point. Scaled mid/side modes fit ±√2 in bounds.
        const isUnipolar = mode === 'unipolar-scaled' || mode === 'unipolar-unscaled';
        points.push({
            x: isUnipolar ? normalizedX * width : width / 2 + normalizedX * width / 2,
            y: isUnipolar ? height - normalizedY * height : height / 2 - normalizedY * height / 2,
            age: index / Math.max(1, target - 1),
        });
    }
    return points;
}

export class AudioVectorscopeElement extends SceneElement {
    constructor(id: string = 'audioVectorscope', config: Record<string, unknown> = {}) { super('audioVectorscope', id, config); }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(super.getConfigSchema(), { name: 'Audio Vectorscope', description: 'Stereo mid/side XY display drawn from raw audio.', category: 'Audio Displays' }, [
            tab.content([
                propGroup.audioSource(),
                { id: 'vectorscope', label: 'Vectorscope', collapsed: false, properties: [
                    prop.number('width', 'Width (px)', 400, { min: 1, step: 1 }), prop.number('height', 'Height (px)', 400, { min: 1, step: 1 }),
                    { key: 'persistenceSeconds', type: 'number', label: 'Persistence (seconds)', default: 0.1, min: 0.01, max: 2, step: 0.01, runtime: { transform: boundedNumber(0.01, 2), defaultValue: 0.1 } },
                    { key: 'pointCount', type: 'number', label: 'Point Density', default: 1024, min: 64, max: 2048, step: 1, runtime: { transform: boundedNumber(64, 2048), defaultValue: 1024 } },
                    { key: 'gain', type: 'number', label: 'Gain', default: 1, min: 0, max: 10, step: 0.01, runtime: { transform: boundedNumber(0, 10), defaultValue: 1 } },
                    { key: 'mode', type: 'select', label: 'Mode', default: 'bipolar-scaled', options: [
                        { label: 'Unipolar Scaled', value: 'unipolar-scaled' },
                        { label: 'Unipolar Unscaled', value: 'unipolar-unscaled' },
                        { label: 'Bipolar Scaled', value: 'bipolar-scaled' },
                        { label: 'Bipolar Unscaled', value: 'bipolar-unscaled' },
                        { label: 'Lissajous', value: 'lissajous' },
                    ], runtime: { transform: (value) => normalizeVectorscopeMode(value), defaultValue: 'bipolar-scaled' } },
                    prop.number('traceWidth', 'Trace Width (px)', 1.5, { min: 0.25, max: 12, step: 0.25 }), prop.boolean('showGrid', 'Show Grid', true), prop.boolean('showLabels', 'Show L/R Labels', true),
                ] },
            ]),
            tab.appearance([
                propGroup.appearance({ blendMode: true }),
                { id: 'trace', label: 'Trace', collapsed: false, properties: [prop.color('color', 'Trace Color', DEFAULT_TRACE_COLOR), prop.range('opacity', 'Trace Opacity', 1, { min: 0, max: 1, step: 0.01 })] },
                { id: 'grid', label: 'Grid', collapsed: true, properties: [prop.color('gridColor', 'Grid Color', DEFAULT_GRID_COLOR), prop.range('gridOpacity', 'Grid Opacity', 0.5, { min: 0, max: 1, step: 0.01 })] },
                { id: 'background', label: 'Background', collapsed: true, properties: [prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR), prop.range('backgroundOpacity', 'Background Opacity', 1, { min: 0, max: 1, step: 0.01 })] },
            ]),
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = Math.max(1, props.width ?? 400); const height = Math.max(1, props.height ?? 400);
        const objects: RenderObject[] = [new Rectangle(0, 0, width, height, { fillColor: applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 1) })];
        const message = (text: string) => { objects.push(new Text(8, height / 2, text, '12px Inter, sans-serif', { color: '#94a3b8', baseline: 'middle' }).setLayoutParticipation('exclude')); return objects; };
        if (!props.audioTrackId) return message('Select an audio track');
        const audio = getEnginePrivateContext(this).audio;
        if (!audio) return message('Audio not available');
        const persistence = clamp(props.persistenceSeconds ?? 0.1, 0.01, 2);
        const startSeconds = Math.max(0, targetTime - persistence);
        const left = audio.getRawSamples({ trackId: props.audioTrackId, startSeconds, endSeconds: targetTime, channel: 'left' });
        if (!left.ok || left.value.length < 2) return message('No vectorscope data');
        const rightResult = audio.getRawSamples({ trackId: props.audioTrackId, startSeconds, endSeconds: targetTime, channel: 'right' });
        const right = rightResult.ok ? rightResult.value : left.value;
        const mode = normalizeVectorscopeMode(props.mode);
        if (props.showGrid !== false) this.addGrid(objects, width, height, props.gridColor ?? DEFAULT_GRID_COLOR, props.gridOpacity ?? 0.5, props.showLabels !== false, mode);
        const points = buildVectorscopePoints(left.value, right, width, height, clamp(props.gain ?? 1, 0, 10), clamp(Math.round(props.pointCount ?? 1024), 64, 2048), mode);
        if (!points.length) return message('No vectorscope data');
        const traceColor = props.color ?? DEFAULT_TRACE_COLOR;
        const traceOpacity = clamp(props.opacity ?? 1, 0, 1);
        const traceWidth = Math.max(0.25, props.traceWidth ?? 1.5);
        const segmentCount = 6;
        for (let segment = 0; segment < segmentCount; segment += 1) {
            const start = Math.floor(segment * (points.length - 1) / segmentCount);
            const end = Math.min(points.length, Math.floor((segment + 1) * (points.length - 1) / segmentCount) + 2);
            const trace = new Poly(points.slice(start, end), { fillColor: null, strokeColor: applyOpacity(traceColor, traceOpacity * (0.18 + 0.82 * (segment + 1) / segmentCount)), strokeWidth: traceWidth, layoutParticipation: 'exclude' });
            trace.setClosed(false).setLineJoin('round').setLineCap('round');
            trace.blendMode = props.blendMode === 'source-over' ? null : props.blendMode as GlobalCompositeOperation;
            objects.push(trace);
        }
        return objects;
    }

    private addGrid(
        objects: RenderObject[], width: number, height: number, color: string, opacity: number, showLabels: boolean, mode: VectorscopeMode
    ): void {
        const gridColor = applyOpacity(color, clamp(opacity, 0, 1));
        const addLine = (x: number, y: number, dx: number, dy: number) => objects.push(new Line(x, y, x + dx, y + dy, { color: gridColor, lineWidth: 1, layoutParticipation: 'exclude' }));
        const addLabel = (x: number, y: number, text: string, align: CanvasTextAlign = 'left') =>
            objects.push(new Text(x, y, text, '11px Inter, sans-serif', { color: gridColor, align }).setLayoutParticipation('exclude'));

        if (mode === 'unipolar-scaled' || mode === 'unipolar-unscaled') {
            // The trace occupies one positive mid/side quadrant, so use a 0–1 graticule.
            for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
                addLine(ratio * width, 0, 0, height);
                addLine(0, ratio * height, width, 0);
            }
            if (showLabels) { addLabel(4, 12, 'Mid'); addLabel(width - 4, height - 6, 'Side', 'right'); }
            return;
        }

        addLine(width / 2, 0, 0, height);
        addLine(0, height / 2, width, 0);
        if (mode === 'lissajous') {
            // Direct left-vs-right plotting uses Cartesian channel axes rather than phase diagonals.
            for (const ratio of [0.25, 0.75]) {
                addLine(ratio * width, 0, 0, height);
                addLine(0, ratio * height, width, 0);
            }
            if (showLabels) { addLabel(4, height / 2 - 6, 'L−'); addLabel(width - 4, height / 2 - 6, 'L+', 'right'); addLabel(width / 2 + 4, 12, 'R+'); addLabel(width / 2 + 4, height - 6, 'R−'); }
            return;
        }

        // Centered bipolar mid/side graticule: diagonal guides mark the in/out-of-phase axes.
        addLine(0, height, width, -height);
        addLine(0, 0, width, height);
        if (showLabels) { addLabel(4, height / 2 - 6, 'S−'); addLabel(width - 4, height / 2 - 6, 'S+', 'right'); addLabel(width / 2 + 4, 12, 'M+'); addLabel(width / 2 + 4, height - 6, 'M−'); }
    }
}

export const audioVectorscope = defineHostAdaptedBuiltIn({
    type: 'audioVectorscope', metadata: { name: 'Audio Vectorscope', description: 'Stereo mid/side XY display', category: 'Audio Displays' }, capabilities: { required: ['audio.raw.read'], optional: [] },
}, AudioVectorscopeElement);

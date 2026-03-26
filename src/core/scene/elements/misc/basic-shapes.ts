import { SceneElement, asNumber, asTrimmedString, asBoolean } from '../base';
import { Arc, Line, Poly, Rectangle, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';

type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'line';

const DEG_TO_RAD = Math.PI / 180;

export class BasicShapesElement extends SceneElement {
    constructor(id: string = 'basicShapes', config: { [key: string]: any } = {}) {
        super('basicShapes', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Basic Shapes',
            description: 'Flexible wrapper for primitive render objects — rectangles, circles, polygons, and lines.',
            category: 'Misc',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'shapeType',
                    label: 'Shape',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Choose which primitive shape to render.',
                    properties: [
                        {
                            key: 'shapeType',
                            type: 'select' as const,
                            label: 'Shape Type',
                            default: 'rectangle',
                            options: [
                                { value: 'rectangle', label: 'Rectangle' },
                                { value: 'circle', label: 'Circle / Arc' },
                                { value: 'triangle', label: 'Polygon' },
                                { value: 'line', label: 'Line' },
                            ],
                            description: 'The primitive shape to draw.',
                            runtime: { transform: asTrimmedString, defaultValue: 'rectangle' },
                        },
                    ],
                    presets: [
                        { id: 'rect', label: 'Rectangle', values: { shapeType: 'rectangle' } },
                        { id: 'circle', label: 'Circle', values: { shapeType: 'circle' } },
                        { id: 'triangle', label: 'Polygon', values: { shapeType: 'triangle' } },
                        { id: 'line', label: 'Line', values: { shapeType: 'line' } },
                    ],
                },
                {
                    id: 'shapeAppearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Fill, stroke, and blending for the shape.',
                    properties: [
                        {
                            key: 'fillColor',
                            type: 'colorAlpha' as const,
                            label: 'Fill Color',
                            default: '#4488ffff',
                            description: 'Interior fill color. Set alpha to 0 for no fill.',
                            runtime: { transform: asTrimmedString, defaultValue: '#4488ffff' },
                        },
                        {
                            key: 'strokeColor',
                            type: 'colorAlpha' as const,
                            label: 'Stroke Color',
                            default: '#ffffffff',
                            description: 'Outline color. Set alpha to 0 for no stroke.',
                            runtime: { transform: asTrimmedString, defaultValue: '#ffffffff' },
                        },
                        {
                            key: 'strokeWidth',
                            type: 'number' as const,
                            label: 'Stroke Width (px)',
                            default: 0,
                            min: 0,
                            max: 60,
                            step: 1,
                            description: 'Width of the stroke in pixels (0 = no stroke).',
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'lineCap',
                            type: 'select' as const,
                            label: 'Line Cap',
                            default: 'butt',
                            options: [
                                { value: 'butt', label: 'Butt' },
                                { value: 'round', label: 'Round' },
                                { value: 'square', label: 'Square' },
                            ],
                            description: 'Shape of stroke endpoints.',
                            visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                            runtime: { transform: asTrimmedString, defaultValue: 'butt' },
                        },
                        {
                            key: 'dashLength',
                            type: 'number' as const,
                            label: 'Dash Length (px)',
                            default: 0,
                            min: 0,
                            max: 200,
                            step: 1,
                            description: 'Length of each dash segment. 0 = solid line.',
                            visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'dashGap',
                            type: 'number' as const,
                            label: 'Dash Gap (px)',
                            default: 4,
                            min: 0,
                            max: 200,
                            step: 1,
                            description: 'Gap between dash segments.',
                            visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                            runtime: { transform: asNumber, defaultValue: 4 },
                        },
                        {
                            key: 'blendMode',
                            type: 'select' as const,
                            label: 'Blend Mode',
                            default: 'source-over',
                            options: [
                                { value: 'source-over', label: 'Normal' },
                                { value: 'screen', label: 'Screen' },
                                { value: 'multiply', label: 'Multiply' },
                                { value: 'overlay', label: 'Overlay' },
                                { value: 'darken', label: 'Darken' },
                                { value: 'lighten', label: 'Lighten' },
                                { value: 'color-dodge', label: 'Color Dodge' },
                                { value: 'color-burn', label: 'Color Burn' },
                                { value: 'hard-light', label: 'Hard Light' },
                                { value: 'soft-light', label: 'Soft Light' },
                                { value: 'difference', label: 'Difference' },
                                { value: 'exclusion', label: 'Exclusion' },
                                { value: 'hue', label: 'Hue' },
                                { value: 'saturation', label: 'Saturation' },
                                { value: 'color', label: 'Color' },
                                { value: 'luminosity', label: 'Luminosity' },
                            ],
                            description: 'Canvas composite blending operation.',
                            runtime: { transform: asTrimmedString, defaultValue: 'source-over' },
                        },
                    ],
                    presets: [
                        { id: 'filled', label: 'Filled', values: { fillColor: '#4488ffff', strokeWidth: 0 } },
                        { id: 'outlined', label: 'Outlined', values: { fillColor: '#4488ff00', strokeColor: '#ffffffff', strokeWidth: 2 } },
                        { id: 'filledOutlined', label: 'Filled + Outline', values: { fillColor: '#4488ffcc', strokeColor: '#ffffffff', strokeWidth: 2 } },
                        { id: 'screen', label: 'Screen Blend', values: { blendMode: 'screen' } },
                        { id: 'multiply', label: 'Multiply Blend', values: { blendMode: 'multiply' } },
                    ],
                },
                {
                    id: 'shapeSize',
                    label: 'Size',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Dimensions for the selected shape.',
                    properties: [
                        {
                            key: 'rectWidth',
                            type: 'number' as const,
                            label: 'Width (px)',
                            default: 200,
                            min: 1,
                            max: 4000,
                            step: 1,
                            description: 'Width of the rectangle in pixels.',
                            visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                        {
                            key: 'rectHeight',
                            type: 'number' as const,
                            label: 'Height (px)',
                            default: 120,
                            min: 1,
                            max: 4000,
                            step: 1,
                            description: 'Height of the rectangle in pixels.',
                            visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                            runtime: { transform: asNumber, defaultValue: 120 },
                        },
                        {
                            key: 'cornerRadius',
                            type: 'number' as const,
                            label: 'Corner Radius (px)',
                            default: 0,
                            min: 0,
                            max: 500,
                            step: 1,
                            description: 'Rounded corner radius for the rectangle.',
                            visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'radius',
                            type: 'number' as const,
                            label: 'Radius (px)',
                            default: 100,
                            min: 1,
                            max: 2000,
                            step: 1,
                            description: 'Radius of the circle or circumradius of the polygon.',
                            visibleWhen: [
                                { key: 'shapeType', notEquals: 'rectangle' },
                                { key: 'shapeType', notEquals: 'line' },
                            ],
                            runtime: { transform: asNumber, defaultValue: 100 },
                        },
                        {
                            key: 'startAngle',
                            type: 'range' as const,
                            label: 'Start Angle (°)',
                            default: 0,
                            min: 0,
                            max: 360,
                            step: 1,
                            description: 'Arc start angle in degrees (0 = right, 90 = down).',
                            visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'endAngle',
                            type: 'range' as const,
                            label: 'End Angle (°)',
                            default: 360,
                            min: 0,
                            max: 360,
                            step: 1,
                            description: 'Arc end angle in degrees (360 = full circle).',
                            visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                            runtime: { transform: asNumber, defaultValue: 360 },
                        },
                        {
                            key: 'anticlockwise',
                            type: 'boolean' as const,
                            label: 'Anticlockwise',
                            default: false,
                            description: 'Draw the arc in the anticlockwise direction.',
                            visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                            runtime: { transform: asBoolean, defaultValue: false },
                        },
                        {
                            key: 'sides',
                            type: 'number' as const,
                            label: 'Sides',
                            default: 3,
                            min: 3,
                            max: 12,
                            step: 1,
                            description: 'Number of polygon vertices (3 = triangle, 4 = rhombus, 6 = hexagon, etc.).',
                            visibleWhen: [{ key: 'shapeType', equals: 'triangle' }],
                            runtime: { transform: asNumber, defaultValue: 3 },
                        },
                        {
                            key: 'lineLength',
                            type: 'number' as const,
                            label: 'Length (px)',
                            default: 200,
                            min: 1,
                            max: 4000,
                            step: 1,
                            description: 'Total length of the line in pixels (element rotation controls angle).',
                            visibleWhen: [{ key: 'shapeType', equals: 'line' }],
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                    ],
                },
                {
                    id: 'shapeShadow',
                    label: 'Shadow',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Drop shadow for the shape.',
                    properties: [
                        {
                            key: 'shadowColor',
                            type: 'colorAlpha' as const,
                            label: 'Shadow Color',
                            default: '#00000000',
                            description: 'Shadow color and opacity. Set alpha to 0 to disable.',
                            runtime: { transform: asTrimmedString, defaultValue: '#00000000' },
                        },
                        {
                            key: 'shadowBlur',
                            type: 'number' as const,
                            label: 'Shadow Blur (px)',
                            default: 0,
                            min: 0,
                            max: 100,
                            step: 1,
                            description: 'Blur radius of the drop shadow.',
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'shadowOffsetX',
                            type: 'number' as const,
                            label: 'Shadow Offset X (px)',
                            default: 0,
                            min: -200,
                            max: 200,
                            step: 1,
                            description: 'Horizontal offset of the shadow.',
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'shadowOffsetY',
                            type: 'number' as const,
                            label: 'Shadow Offset Y (px)',
                            default: 0,
                            min: -200,
                            max: 200,
                            step: 1,
                            description: 'Vertical offset of the shadow.',
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const shapeType = (props.shapeType ?? 'rectangle') as ShapeType;
        const fillColor = props.fillColor ?? '#4488ffff';
        const strokeColor = props.strokeColor ?? '#ffffffff';
        const strokeWidth = props.strokeWidth ?? 0;
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;

        const effectiveFill = this.#alphaFromHex(fillColor) > 0 ? fillColor : null;
        const effectiveStroke = strokeWidth > 0 && this.#alphaFromHex(strokeColor) > 0 ? strokeColor : null;

        const shadowColor = props.shadowColor ?? '#00000000';
        const shadowBlur = props.shadowBlur ?? 0;
        const shadowOffsetX = props.shadowOffsetX ?? 0;
        const shadowOffsetY = props.shadowOffsetY ?? 0;
        const hasShadow = this.#alphaFromHex(shadowColor) > 0;

        let ro: RenderObject;

        switch (shapeType) {
            case 'rectangle': {
                const w = Math.max(1, props.rectWidth ?? 200);
                const h = Math.max(1, props.rectHeight ?? 120);
                const cr = props.cornerRadius ?? 0;
                const rect = new Rectangle(-w / 2, -h / 2, w, h, effectiveFill, effectiveStroke, strokeWidth);
                rect.cornerRadius = cr;
                if (hasShadow) rect.setShadow(shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY);
                ro = rect;
                break;
            }
            case 'circle': {
                const r = Math.max(1, props.radius ?? 100);
                const startAngle = (props.startAngle ?? 0) * DEG_TO_RAD;
                const endAngle = (props.endAngle ?? 360) * DEG_TO_RAD;
                const anticlockwise = props.anticlockwise ?? false;
                const lineCap = (props.lineCap ?? 'butt') as CanvasLineCap;
                const dashLength = props.dashLength ?? 0;
                const dashGap = props.dashGap ?? 4;
                const arc = new Arc(0, 0, r, startAngle, endAngle, anticlockwise, {
                    fillColor: effectiveFill,
                    strokeColor: effectiveStroke,
                    strokeWidth,
                });
                arc.lineCap = lineCap;
                if (dashLength > 0) arc.lineDash = [dashLength, dashGap];
                if (hasShadow) arc.setShadow(shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY);
                ro = arc;
                break;
            }
            case 'triangle': {
                const r = Math.max(1, props.radius ?? 100);
                const sides = Math.max(3, Math.round(props.sides ?? 3));
                const lineCap = (props.lineCap ?? 'butt') as CanvasLineCap;
                const dashLength = props.dashLength ?? 0;
                const dashGap = props.dashGap ?? 4;
                // Regular polygon centered at origin, first vertex pointing up
                const points = Array.from({ length: sides }, (_, i) => {
                    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
                    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
                });
                const poly = new Poly(points, effectiveFill, effectiveStroke, strokeWidth);
                poly.lineCap = lineCap;
                if (dashLength > 0) poly.lineDash = [dashLength, dashGap];
                if (hasShadow) poly.setShadow(shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY);
                ro = poly;
                break;
            }
            case 'line': {
                const len = Math.max(1, props.lineLength ?? 200);
                const lineCap = (props.lineCap ?? 'butt') as CanvasLineCap;
                const dashLength = props.dashLength ?? 0;
                const dashGap = props.dashGap ?? 4;
                const line = new Line(-len / 2, 0, len / 2, 0, effectiveStroke ?? effectiveFill ?? '#ffffff', strokeWidth || 2);
                line.lineCap = lineCap;
                if (dashLength > 0) line.lineDash = [dashLength, dashGap];
                if (hasShadow) line.setShadow(shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY);
                ro = line;
                break;
            }
            default:
                return [];
        }

        ro.blendMode = blendMode === 'source-over' ? null : blendMode;

        return [ro];
    }

    /** Parse alpha channel from a 8-char hex color like '#rrggbbaa'. Returns 0–255. */
    #alphaFromHex(color: string): number {
        if (!color || color.length < 8) return 255;
        const hex = color.startsWith('#') ? color.slice(1) : color;
        if (hex.length === 8) {
            return parseInt(hex.slice(6, 8), 16);
        }
        return 255;
    }
}

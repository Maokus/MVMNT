import { SceneElement } from '../base';
import { Arc, Line, Poly, Rectangle, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';

type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'line';

const DEG_TO_RAD = Math.PI / 180;

export class BasicShapesElement extends SceneElement {
    constructor(id: string = 'basicShapes', config: { [key: string]: any } = {}) {
        super('basicShapes', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Basic Shapes',
            description: 'Flexible wrapper for primitive render objects — rectangles, circles, polygons, and lines.',
            category: 'Misc',
        }, [
            {
                id: 'shapeType',
                label: 'Shape',
                variant: 'basic',
                collapsed: false,
                description: 'Choose which primitive shape to render.',
                properties: [
                    prop.select('shapeType', 'Shape Type', 'rectangle', [
                        { value: 'rectangle', label: 'Rectangle' },
                        { value: 'circle', label: 'Circle / Arc' },
                        { value: 'triangle', label: 'Polygon' },
                        { value: 'line', label: 'Line' },
                    ], { description: 'The primitive shape to draw.' }),
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
                    prop.colorAlpha('fillColor', 'Fill Color', '#4488ffff', {
                        description: 'Interior fill color. Set alpha to 0 for no fill.',
                    }),
                    prop.colorAlpha('strokeColor', 'Stroke Color', '#ffffffff', {
                        description: 'Outline color. Set alpha to 0 for no stroke.',
                    }),
                    prop.number('strokeWidth', 'Stroke Width (px)', 0, {
                        min: 0, max: 60, step: 1,
                        description: 'Width of the stroke in pixels (0 = no stroke).',
                    }),
                    prop.select('lineCap', 'Line Cap', 'butt', [
                        { value: 'butt', label: 'Butt' },
                        { value: 'round', label: 'Round' },
                        { value: 'square', label: 'Square' },
                    ], {
                        description: 'Shape of stroke endpoints.',
                        visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                    }),
                    prop.number('dashLength', 'Dash Length (px)', 0, {
                        min: 0, max: 200, step: 1,
                        description: 'Length of each dash segment. 0 = solid line.',
                        visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                    }),
                    prop.number('dashGap', 'Dash Gap (px)', 4, {
                        min: 0, max: 200, step: 1,
                        description: 'Gap between dash segments.',
                        visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                    }),
                    prop.select('blendMode', 'Blend Mode', 'source-over', [
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
                    ], { description: 'Canvas composite blending operation.' }),
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
                    prop.number('rectWidth', 'Width (px)', 200, {
                        min: 1, max: 4000, step: 1,
                        description: 'Width of the rectangle in pixels.',
                        visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                    }),
                    prop.number('rectHeight', 'Height (px)', 120, {
                        min: 1, max: 4000, step: 1,
                        description: 'Height of the rectangle in pixels.',
                        visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                    }),
                    prop.number('cornerRadius', 'Corner Radius (px)', 0, {
                        min: 0, max: 500, step: 1,
                        description: 'Rounded corner radius for the rectangle.',
                        visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                    }),
                    prop.number('radius', 'Radius (px)', 100, {
                        min: 1, max: 2000, step: 1,
                        description: 'Radius of the circle or circumradius of the polygon.',
                        visibleWhen: [
                            { key: 'shapeType', notEquals: 'rectangle' },
                            { key: 'shapeType', notEquals: 'line' },
                        ],
                    }),
                    prop.range('startAngle', 'Start Angle (°)', 0, {
                        min: 0, max: 360, step: 1,
                        description: 'Arc start angle in degrees (0 = right, 90 = down).',
                        visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                    }),
                    prop.range('endAngle', 'End Angle (°)', 360, {
                        min: 0, max: 360, step: 1,
                        description: 'Arc end angle in degrees (360 = full circle).',
                        visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                    }),
                    prop.boolean('anticlockwise', 'Anticlockwise', false, {
                        description: 'Draw the arc in the anticlockwise direction.',
                        visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                    }),
                    prop.number('sides', 'Sides', 3, {
                        min: 3, max: 12, step: 1,
                        description: 'Number of polygon vertices (3 = triangle, 4 = rhombus, 6 = hexagon, etc.).',
                        visibleWhen: [{ key: 'shapeType', equals: 'triangle' }],
                    }),
                    prop.number('lineLength', 'Length (px)', 200, {
                        min: 1, max: 4000, step: 1,
                        description: 'Total length of the line in pixels (element rotation controls angle).',
                        visibleWhen: [{ key: 'shapeType', equals: 'line' }],
                    }),
                ],
            },
            {
                id: 'shapeShadow',
                label: 'Shadow',
                variant: 'advanced',
                collapsed: true,
                description: 'Drop shadow for the shape.',
                properties: [
                    prop.colorAlpha('shadowColor', 'Shadow Color', '#00000000', {
                        description: 'Shadow color and opacity. Set alpha to 0 to disable.',
                    }),
                    prop.number('shadowBlur', 'Shadow Blur (px)', 0, {
                        min: 0, max: 100, step: 1,
                        description: 'Blur radius of the drop shadow.',
                    }),
                    prop.number('shadowOffsetX', 'Shadow Offset X (px)', 0, {
                        min: -200, max: 200, step: 1,
                        description: 'Horizontal offset of the shadow.',
                    }),
                    prop.number('shadowOffsetY', 'Shadow Offset Y (px)', 0, {
                        min: -200, max: 200, step: 1,
                        description: 'Vertical offset of the shadow.',
                    }),
                ],
            },
        ]);
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

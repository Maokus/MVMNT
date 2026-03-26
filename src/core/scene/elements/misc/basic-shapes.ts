import { SceneElement, asNumber, asTrimmedString } from '../base';
import { Arc, Line, Poly, Rectangle, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';

type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'line';

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
            description: 'Flexible wrapper for primitive render objects — rectangles, circles, triangles, and lines.',
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
                                { value: 'circle', label: 'Circle' },
                                { value: 'triangle', label: 'Triangle' },
                                { value: 'line', label: 'Line' },
                            ],
                            description: 'The primitive shape to draw.',
                            runtime: { transform: asTrimmedString, defaultValue: 'rectangle' },
                        },
                    ],
                    presets: [
                        { id: 'rect', label: 'Rectangle', values: { shapeType: 'rectangle' } },
                        { id: 'circle', label: 'Circle', values: { shapeType: 'circle' } },
                        { id: 'triangle', label: 'Triangle', values: { shapeType: 'triangle' } },
                        { id: 'line', label: 'Line', values: { shapeType: 'line' } },
                    ],
                },
                {
                    id: 'shapeAppearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Fill and stroke styling for the shape.',
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
                    ],
                    presets: [
                        { id: 'filled', label: 'Filled', values: { fillColor: '#4488ffff', strokeWidth: 0 } },
                        { id: 'outlined', label: 'Outlined', values: { fillColor: '#4488ff00', strokeColor: '#ffffffff', strokeWidth: 2 } },
                        { id: 'filledOutlined', label: 'Filled + Outline', values: { fillColor: '#4488ffcc', strokeColor: '#ffffffff', strokeWidth: 2 } },
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
                            label: 'Width (px) [rect]',
                            default: 200,
                            min: 1,
                            max: 4000,
                            step: 1,
                            description: 'Width of the rectangle in pixels.',
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                        {
                            key: 'rectHeight',
                            type: 'number' as const,
                            label: 'Height (px) [rect]',
                            default: 120,
                            min: 1,
                            max: 4000,
                            step: 1,
                            description: 'Height of the rectangle in pixels.',
                            runtime: { transform: asNumber, defaultValue: 120 },
                        },
                        {
                            key: 'cornerRadius',
                            type: 'number' as const,
                            label: 'Corner Radius (px) [rect]',
                            default: 0,
                            min: 0,
                            max: 500,
                            step: 1,
                            description: 'Rounded corner radius for the rectangle.',
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'radius',
                            type: 'number' as const,
                            label: 'Radius (px) [circle / triangle]',
                            default: 100,
                            min: 1,
                            max: 2000,
                            step: 1,
                            description: 'Radius of the circle, or circumradius of the triangle.',
                            runtime: { transform: asNumber, defaultValue: 100 },
                        },
                        {
                            key: 'lineLength',
                            type: 'number' as const,
                            label: 'Length (px) [line]',
                            default: 200,
                            min: 1,
                            max: 4000,
                            step: 1,
                            description: 'Total length of the line in pixels (element rotation controls angle).',
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const shapeType = (props.shapeType ?? 'rectangle') as ShapeType;
        const fillColor = props.fillColor ?? '#4488ffff';
        const strokeColor = props.strokeColor ?? '#ffffffff';
        const strokeWidth = props.strokeWidth ?? 0;

        // Resolve effective fill/stroke: treat fully-transparent colors as null
        const effectiveFill = this.#alphaFromHex(fillColor) > 0 ? fillColor : null;
        const effectiveStroke = strokeWidth > 0 && this.#alphaFromHex(strokeColor) > 0 ? strokeColor : null;

        switch (shapeType) {
            case 'rectangle': {
                const w = Math.max(1, props.rectWidth ?? 200);
                const h = Math.max(1, props.rectHeight ?? 120);
                const cr = props.cornerRadius ?? 0;
                const rect = new Rectangle(-w / 2, -h / 2, w, h, effectiveFill, effectiveStroke, strokeWidth);
                rect.cornerRadius = cr;
                return [rect];
            }
            case 'circle': {
                const r = Math.max(1, props.radius ?? 100);
                const arc = new Arc(0, 0, r, 0, Math.PI * 2, false, {
                    fillColor: effectiveFill,
                    strokeColor: effectiveStroke,
                    strokeWidth,
                });
                return [arc];
            }
            case 'triangle': {
                const r = Math.max(1, props.radius ?? 100);
                // Equilateral triangle centered at origin, pointing up
                const points = [
                    { x: 0, y: -r },
                    { x: r * Math.sin((2 * Math.PI) / 3), y: -r * Math.cos((2 * Math.PI) / 3) },
                    { x: r * Math.sin((4 * Math.PI) / 3), y: -r * Math.cos((4 * Math.PI) / 3) },
                ];
                const poly = new Poly(points, effectiveFill, effectiveStroke, strokeWidth);
                return [poly];
            }
            case 'line': {
                const len = Math.max(1, props.lineLength ?? 200);
                const line = new Line(-len / 2, 0, len / 2, 0, effectiveStroke ?? effectiveFill ?? '#ffffff', strokeWidth || 2);
                return [line];
            }
            default:
                return [];
        }
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

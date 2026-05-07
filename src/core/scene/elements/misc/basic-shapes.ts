import { SceneElement, type EnhancedConfigSchema, prop, insertElementGroups, propGroup, tab } from '@mvmnt/plugin-sdk';
import { Arc, Line, Poly, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import { applyOpacity } from '@utils/color';

type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'line';

const DEG_TO_RAD = Math.PI / 180;

export class BasicShapesElement extends SceneElement {
    constructor(id: string = 'basicShapes', config: { [key: string]: any } = {}) {
        super('basicShapes', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Basic Shapes',
                description:
                    'Flexible wrapper for primitive render objects — rectangles, circles, polygons, and lines.',
                category: 'Misc',
            },
            [
                tab.properties([
                    {
                        id: 'shapeType',
                        label: 'Shape',
                        variant: 'basic',
                        collapsed: false,
                        description: 'Choose which primitive shape to render.',
                        properties: [
                            prop.select(
                                'shapeType',
                                'Shape Type',
                                'rectangle',
                                [
                                    { value: 'rectangle', label: 'Rectangle' },
                                    { value: 'circle', label: 'Circle / Arc' },
                                    { value: 'triangle', label: 'Polygon' },
                                    { value: 'line', label: 'Line' },
                                ],
                                { description: 'The primitive shape to draw.' }
                            ),
                        ],
                        presets: [
                            { id: 'rect', label: 'Rectangle', values: { shapeType: 'rectangle' } },
                            { id: 'circle', label: 'Circle', values: { shapeType: 'circle' } },
                            { id: 'triangle', label: 'Polygon', values: { shapeType: 'triangle' } },
                            { id: 'line', label: 'Line', values: { shapeType: 'line' } },
                        ],
                    },
                    propGroup.appearance({ blendMode: true }),
                    {
                        id: 'shapeStroke',
                        label: 'Stroke',
                        variant: 'basic',
                        collapsed: false,
                        description: 'Outline, dashing, and line cap for the shape.',
                        properties: [
                            prop.color('strokeColor', 'Stroke Color', '#ffffff', {
                                description: 'Outline color.',
                            }),
                            prop.range('strokeOpacity', 'Stroke Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.number('strokeWidth', 'Stroke Width (px)', 0, {
                                min: 0,
                                step: 1,
                                description: 'Width of the stroke in pixels (0 = no stroke).',
                            }),
                            prop.select(
                                'lineCap',
                                'Line Cap',
                                'butt',
                                [
                                    { value: 'butt', label: 'Butt' },
                                    { value: 'round', label: 'Round' },
                                    { value: 'square', label: 'Square' },
                                ],
                                {
                                    description: 'Shape of stroke endpoints.',
                                    visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                                }
                            ),
                            prop.number('dashLength', 'Dash Length (px)', 0, {
                                min: 0,
                                max: 200,
                                step: 1,
                                description: 'Length of each dash segment. 0 = solid line.',
                                visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                            }),
                            prop.number('dashGap', 'Dash Gap (px)', 4, {
                                min: 0,
                                max: 200,
                                step: 1,
                                description: 'Gap between dash segments.',
                                visibleWhen: [{ key: 'shapeType', notEquals: 'rectangle' }],
                            }),
                        ],
                        presets: [
                            {
                                id: 'filled',
                                label: 'Filled',
                                values: { color: '#4488ff', opacity: 1, strokeWidth: 0 },
                            },
                            {
                                id: 'outlined',
                                label: 'Outlined',
                                values: {
                                    color: '#4488ff',
                                    opacity: 0,
                                    strokeColor: '#ffffff',
                                    strokeOpacity: 1,
                                    strokeWidth: 2,
                                },
                            },
                            {
                                id: 'filledOutlined',
                                label: 'Filled + Outline',
                                values: {
                                    color: '#4488ff',
                                    opacity: 0.8,
                                    strokeColor: '#ffffff',
                                    strokeOpacity: 1,
                                    strokeWidth: 2,
                                },
                            },
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
                                min: 1,
                                max: 4000,
                                step: 1,
                                description: 'Width of the rectangle in pixels.',
                                visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                            }),
                            prop.number('rectHeight', 'Height (px)', 120, {
                                min: 1,
                                max: 4000,
                                step: 1,
                                description: 'Height of the rectangle in pixels.',
                                visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                            }),
                            prop.number('cornerRadius', 'Corner Radius (px)', 0, {
                                min: 0,
                                max: 500,
                                step: 1,
                                description: 'Rounded corner radius for the rectangle.',
                                visibleWhen: [{ key: 'shapeType', equals: 'rectangle' }],
                            }),
                            prop.number('radius', 'Radius (px)', 100, {
                                min: 1,
                                max: 2000,
                                step: 1,
                                description: 'Radius of the circle or circumradius of the polygon.',
                                visibleWhen: [
                                    { key: 'shapeType', notEquals: 'rectangle' },
                                    { key: 'shapeType', notEquals: 'line' },
                                ],
                            }),
                            prop.number('startAngle', 'Start Angle (rad)', 0, {
                                min: 0,
                                max: 6.28,
                                step: 0.01,
                                description: 'Arc start angle in radians (0 = right, π/2 = down).',
                                visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                            }),
                            prop.number('endAngle', 'End Angle (rad)', 6.28, {
                                min: 0,
                                max: 6.28,
                                step: 0.01,
                                description: 'Arc end angle in radians (2π ≈ 6.28 = full circle).',
                                visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                            }),
                            prop.boolean('anticlockwise', 'Anticlockwise', false, {
                                description: 'Draw the arc in the anticlockwise direction.',
                                visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                            }),
                            prop.select(
                                'circleFillStyle',
                                'Fill Style',
                                'segment',
                                [
                                    { value: 'segment', label: 'Segment' },
                                    { value: 'sector', label: 'Sector (pie)' },
                                ],
                                {
                                    description:
                                        'Segment closes with a chord; sector closes back to the centre (pie-slice).',
                                    visibleWhen: [{ key: 'shapeType', equals: 'circle' }],
                                }
                            ),
                            prop.number('sides', 'Sides', 3, {
                                min: 3,
                                max: 12,
                                step: 1,
                                description:
                                    'Number of polygon vertices (3 = triangle, 4 = rhombus, 6 = hexagon, etc.).',
                                visibleWhen: [{ key: 'shapeType', equals: 'triangle' }],
                            }),
                            prop.number('lineLength', 'Length (px)', 200, {
                                min: 1,
                                max: 4000,
                                step: 1,
                                description: 'Total length of the line in pixels (element rotation controls angle).',
                                visibleWhen: [{ key: 'shapeType', equals: 'line' }],
                            }),
                        ],
                    },
                    propGroup.shadow(),
                ]),
            ]
        );
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const shapeType = (props.shapeType ?? 'rectangle') as ShapeType;
        const opacity = props.opacity ?? props.fillOpacity ?? 1;
        const strokeOpacity = props.strokeOpacity ?? 1;
        const strokeWidth = props.strokeWidth ?? 0;
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;

        const effectiveFill = opacity > 0 ? applyOpacity(props.color ?? props.fillColor ?? '#4488ff', opacity) : null;
        const effectiveStroke =
            strokeWidth > 0 && strokeOpacity > 0 ? applyOpacity(props.strokeColor ?? '#ffffff', strokeOpacity) : null;

        const hasShadow = props.shadowEnabled === true;
        const shadowColor = hasShadow ? applyOpacity(props.shadowColor ?? '#000000', 1) : '#000000FF';
        const shadowBlur = props.shadowBlur ?? 8;
        const shadowOffsetX = props.shadowOffsetX ?? 2;
        const shadowOffsetY = props.shadowOffsetY ?? 2;

        let ro: RenderObject;
        let layoutBounds = { w: 0, h: 0 };

        switch (shapeType) {
            case 'rectangle': {
                const w = Math.max(1, props.rectWidth ?? 200);
                const h = Math.max(1, props.rectHeight ?? 120);
                layoutBounds = { w, h };
                const cr = props.cornerRadius ?? 0;
                const rect = new Rectangle(-w / 2, -h / 2, w, h, effectiveFill, effectiveStroke, strokeWidth);
                rect.cornerRadius = cr;
                if (hasShadow) rect.setShadow(shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY);
                ro = rect;
                break;
            }
            case 'circle': {
                const r = Math.max(1, props.radius ?? 100);
                layoutBounds = { w: r * 2, h: r * 2 };
                const startAngle = props.startAngle ?? 0;
                const endAngle = props.endAngle ?? Math.PI * 2;
                const anticlockwise = props.anticlockwise ?? false;
                const lineCap = (props.lineCap ?? 'butt') as CanvasLineCap;
                const dashLength = props.dashLength ?? 0;
                const dashGap = props.dashGap ?? 4;
                const circleFillStyle = (props.circleFillStyle ?? 'segment') as 'segment' | 'sector';
                const arc = new Arc(0, 0, r, startAngle, endAngle, anticlockwise, {
                    fillColor: effectiveFill,
                    strokeColor: effectiveStroke,
                    strokeWidth,
                });
                arc.lineCap = lineCap;
                arc.arcFillStyle = circleFillStyle;
                if (dashLength > 0) arc.lineDash = [dashLength, dashGap];
                if (hasShadow) arc.setShadow(shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY);
                ro = arc;
                break;
            }
            case 'triangle': {
                const r = Math.max(1, props.radius ?? 100);
                layoutBounds = { w: r * 2, h: r * 2 };
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
                layoutBounds = { w: len, h: 0 };
                const lineCap = (props.lineCap ?? 'butt') as CanvasLineCap;
                const dashLength = props.dashLength ?? 0;
                const dashGap = props.dashGap ?? 4;
                const line = new Line(
                    -len / 2,
                    0,
                    len / 2,
                    0,
                    effectiveStroke ?? effectiveFill ?? '#ffffff',
                    strokeWidth || 2
                );
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
        ro.setIncludeInLayoutBounds(false);

        // Create invisible layout element to stabilize bounds
        const layoutRect = new Rectangle(
            -layoutBounds.w / 2,
            -layoutBounds.h / 2,
            layoutBounds.w,
            layoutBounds.h,
            null,
            null,
            0
        );
        (layoutRect as any).isLayoutElement = true;

        return [layoutRect, ro];
    }
}

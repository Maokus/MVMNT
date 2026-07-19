import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Arc, Line, Poly, Rectangle, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';

interface Props extends Readonly<Record<string, any>> {}
const number = (key: string, label: string, value: number, extra: Record<string, unknown> = {}) => ({
    key,
    label,
    type: 'number',
    default: value,
    ...extra,
});
const degrees = (value: number) => (value * Math.PI) / 180;

export const basicShapes = definePluginElement<Props, undefined>({
    type: 'basicShapes',
    metadata: {
        name: 'Basic Shapes',
        description: 'Flexible rectangles, circles, polygons, and lines',
        category: 'Misc',
    },
    schema: {
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'shapeType',
                        label: 'Shape',
                        collapsed: false,
                        properties: [
                            {
                                key: 'shapeType',
                                label: 'Shape Type',
                                type: 'select',
                                default: 'rectangle',
                                options: [
                                    { value: 'rectangle', label: 'Rectangle' },
                                    { value: 'circle', label: 'Circle / Arc' },
                                    { value: 'triangle', label: 'Polygon' },
                                    { value: 'line', label: 'Line' },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'shapeSize',
                        label: 'Size',
                        collapsed: false,
                        properties: [
                            number('rectWidth', 'Width (px)', 200, { min: 1, max: 4000 }),
                            number('rectHeight', 'Height (px)', 120, { min: 1, max: 4000 }),
                            number('cornerRadius', 'Corner Radius (px)', 0, { min: 0 }),
                            number('radius', 'Radius (px)', 100, { min: 1 }),
                            number('startAngle', 'Start Angle (°)', 0),
                            number('endAngle', 'End Angle (°)', 360),
                            { key: 'anticlockwise', label: 'Anticlockwise', type: 'boolean', default: false },
                            {
                                key: 'circleFillStyle',
                                label: 'Fill Style',
                                type: 'select',
                                default: 'segment',
                                options: [
                                    { value: 'segment', label: 'Segment' },
                                    { value: 'sector', label: 'Sector' },
                                ],
                            },
                            number('sides', 'Sides', 3, { min: 3, max: 12 }),
                            { key: 'star', label: 'Star', type: 'boolean', default: false },
                            number('innerRadius', 'Inner Radius (px)', 50, { min: 1 }),
                            number('lineLength', 'Length (px)', 200, { min: 1 }),
                        ],
                    },
                ],
            },
            {
                id: 'appearance',
                label: 'Appearance',
                groups: [
                    {
                        id: 'appearance',
                        label: 'Fill',
                        collapsed: false,
                        properties: [
                            { key: 'color', label: 'Fill Color', type: 'colorAlpha', default: '#4488FFFF' },
                            {
                                key: 'opacity',
                                label: 'Fill Opacity',
                                type: 'range',
                                default: 1,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                            {
                                key: 'blendMode',
                                label: 'Blend Mode',
                                type: 'select',
                                default: 'source-over',
                                options: [
                                    { value: 'source-over', label: 'Normal' },
                                    { value: 'screen', label: 'Screen' },
                                    { value: 'multiply', label: 'Multiply' },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'shapeStroke',
                        label: 'Stroke',
                        collapsed: false,
                        properties: [
                            { key: 'strokeColor', label: 'Stroke Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            {
                                key: 'strokeOpacity',
                                label: 'Stroke Opacity',
                                type: 'range',
                                default: 1,
                                min: 0,
                                max: 1,
                            },
                            number('strokeWidth', 'Stroke Width (px)', 0, { min: 0 }),
                            {
                                key: 'lineCap',
                                label: 'Line Cap',
                                type: 'select',
                                default: 'butt',
                                options: [
                                    { value: 'butt', label: 'Butt' },
                                    { value: 'round', label: 'Round' },
                                    { value: 'square', label: 'Square' },
                                ],
                            },
                            number('dashLength', 'Dash Length (px)', 0, { min: 0 }),
                            number('dashGap', 'Dash Gap (px)', 4, { min: 0 }),
                            number('dashOffset', 'Dash Offset (px)', 0),
                        ],
                    },
                    {
                        id: 'shadow',
                        label: 'Shadow',
                        collapsed: true,
                        properties: [
                            { key: 'shadowEnabled', label: 'Enable Shadow', type: 'boolean', default: false },
                            { key: 'shadowColor', label: 'Shadow Color', type: 'colorAlpha', default: '#000000FF' },
                            number('shadowBlur', 'Shadow Blur', 8),
                            number('shadowOffsetX', 'Shadow X', 2),
                            number('shadowOffsetY', 'Shadow Y', 2),
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props) {
        const fill = props.opacity > 0 ? applyOpacity(props.color, props.opacity) : null;
        const stroke =
            props.strokeWidth > 0 && props.strokeOpacity > 0
                ? applyOpacity(props.strokeColor, props.strokeOpacity)
                : null;
        const decorate = (object: any) => {
            object.blendMode = props.blendMode === 'source-over' ? null : props.blendMode;
            object.lineCap = props.lineCap;
            if (props.dashLength > 0) {
                object.lineDash = [props.dashLength, props.dashGap];
                object.lineDashOffset = props.dashOffset;
            }
            if (props.shadowEnabled)
                object.setShadow(
                    applyOpacity(props.shadowColor, 1),
                    props.shadowBlur,
                    props.shadowOffsetX,
                    props.shadowOffsetY
                );
            object.setIncludeInLayoutBounds(false);
            return object as RenderObject;
        };
        let shape: RenderObject;
        let width = 0;
        let height = 0;
        if (props.shapeType === 'rectangle') {
            width = Math.max(1, props.rectWidth);
            height = Math.max(1, props.rectHeight);
            const rectangle = new Rectangle(-width / 2, -height / 2, width, height, {
                fillColor: fill,
                strokeColor: stroke,
                strokeWidth: props.strokeWidth,
            });
            rectangle.cornerRadius = props.cornerRadius;
            shape = decorate(rectangle);
        } else if (props.shapeType === 'circle') {
            const radius = Math.max(1, props.radius);
            width = height = radius * 2;
            const arc = new Arc(0, 0, radius, degrees(props.startAngle), degrees(props.endAngle), props.anticlockwise, {
                fillColor: fill,
                strokeColor: stroke,
                strokeWidth: props.strokeWidth,
            });
            arc.arcFillStyle = props.circleFillStyle;
            shape = decorate(arc);
        } else if (props.shapeType === 'triangle') {
            const radius = Math.max(1, props.radius);
            width = height = radius * 2;
            const count = Math.max(3, Math.round(props.sides));
            const points: Array<{ x: number; y: number }> = [];
            for (let index = 0; index < count * (props.star ? 2 : 1); index++) {
                const total = count * (props.star ? 2 : 1);
                const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
                const pointRadius = props.star && index % 2 ? Math.max(1, props.innerRadius) : radius;
                points.push({ x: pointRadius * Math.cos(angle), y: pointRadius * Math.sin(angle) });
            }
            shape = decorate(new Poly(points, fill, stroke, props.strokeWidth));
        } else {
            width = Math.max(1, props.lineLength);
            shape = decorate(
                new Line(-width / 2, 0, width / 2, 0, stroke ?? fill ?? '#ffffff', props.strokeWidth || 2)
            );
        }
        const bounds = new Rectangle(-width / 2, -height / 2, width, height, { fillColor: null });
        return [bounds, shape];
    },
});
export const BasicShapesElement = createBuiltInDefinitionElementClass(basicShapes);
